const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../database/database');
const { createSession, logout, validateToken, authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt, generateEmailHash, generateUsernameHash, encrypt } = require('../utils/crypto');

// --- Helper Functions ---

function isValidBcryptHash(hash) {
  return typeof hash === 'string' && hash.length === 60 && hash.startsWith('$2b');
}

function sanitizeInput(input) {
  return typeof input === 'string' ? input.trim() : input;
}

async function logAudit(auditData) {
  try {
    const validatedAuditData = {
      ...auditData,
      userID: auditData.userID ? parseInt(auditData.userID, 10) : null,
    };
    await addAuditTrail(validatedAuditData);
  } catch (auditError) {
    console.error('CRITICAL: Audit trail logging failed.', auditError);
  }
}

// --- Main Login Route ---

router.post('/', async (req, res) => {
  let userForAudit = null;

  try {
    const identifier = sanitizeInput(req.body.identifier);
    const password = req.body.password;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required' });
    }

    const pool = await getConnection();
    const request = pool.request();
    let userQuery;

    // Determine if identifier is an email or username and build query accordingly
    if (identifier.includes('@')) {
      const emailHash = generateEmailHash(identifier);
      request.input('hash', sql.VarChar, emailHash);
      userQuery = 'WHERE u.emailHash = @hash';
    } else {
      const usernameHash = generateUsernameHash(identifier);
      request.input('hash', sql.VarChar, usernameHash);
      userQuery = 'WHERE u.usernameHash = @hash';
    }

    const result = await request.query(`
        SELECT u.userID, u.username, u.passKey, u.fullName, r.roleName as position, u.barangay as barangayID, b.barangayName as barangayName, u.isDefaultPassword, u.isArchived,
               ac.templateControl, ac.trackerControl, ac.docsControl
        FROM userInfo u
        LEFT JOIN roles r ON u.position = r.roleID
        LEFT JOIN barangays b ON u.barangay = b.barangayID
        LEFT JOIN accessControl ac ON u.userID = ac.userID
        ${userQuery} AND u.isArchived = 0
      `);

    const user = result.recordset[0];
    userForAudit = user;

    if (!user) {
      logAudit({ actor: 'S', module: 'L', userID: null, actions: 'login-failure', descriptions: `Login attempt for non-existent or archived user: ${identifier}` });
      return res.status(401).json({ success: false, message: 'Invalid credentials or account is archived.' });
    }

    const decryptedUsername = decrypt(user.username);

    if (!isValidBcryptHash(user.passKey)) {
      console.error(`Login failed: Invalid hash format in database for user ID: ${user.userID}`);
      return res.status(500).json({ success: false, message: 'Server configuration error. Please contact admin.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passKey);

    if (!passwordMatches) {
      logAudit({ actor: 'S', module: 'L', userID: user.userID, actions: 'login-failure', descriptions: `Invalid password attempt for user: ${decryptedUsername}` });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // --- Login Success Logic ---
    const decryptedFullName = decrypt(user.fullName);
    const sessionID = await createSession(user.userID);

    const token = jwt.sign(
      { sessionID: sessionID },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        userId: user.userID,
        username: decryptedUsername,
        fullName: decryptedFullName,
        position: user.position,
        barangay: user.barangayID,
        barangayName: user.barangayName,
        isDefaultPassword: user.isDefaultPassword,
        isArchived: user.isArchived,
        permissions: {
          templateControl: Boolean(user.templateControl),
          trackerControl: Boolean(user.trackerControl),
          docsControl: Boolean(user.docsControl)
        }
      }
    });

    logAudit({ actor: user.position === 'Admin' ? 'A' : 'C', module: 'L', userID: user.userID, actions: 'login-success', descriptions: `User: ${decryptedUsername} logged in successfully` });

  } catch (error) {
    console.error('A critical error occurred during the login process:', error);
    logAudit({ actor: 'S', module: 'L', userID: userForAudit ? userForAudit.userID : null, actions: 'login-error', descriptions: 'Server error during login attempt' });
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'An error occurred during login' });
    }
  }
});

// --- Other Routes ---

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { userId, username, position } = req.user;
    await logout(req, res);
    logAudit({ actor: position === 'Admin' ? 'A' : 'C', module: 'L', userID: userId, actions: 'logout', descriptions: `User: ${username} logged out` });
  } catch (error) {
    console.error('Error during logout:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error during logout' });
    }
  }
});

router.post('/change-credentials', authMiddleware, async (req, res) => {
  try {
    const { newUsername, newPassword, currentUsername, userID } = req.body;

    if (!newUsername || !newPassword || !currentUsername || !userID) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    let isAuthorized = (req.user && String(req.user.userId) === String(userID)) || (req.user && req.user.username === currentUsername);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized action.' });
    }

    const pool = await getConnection();
    const usernameHash = generateUsernameHash(currentUsername);
    const userValidation = await pool.request()
      .input('usernameHash', sql.VarChar, usernameHash)
      .query('SELECT userID, isDefaultPassword FROM userInfo WHERE usernameHash = @usernameHash');

    if (userValidation.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found or username mismatch.' });
    }

    const user = userValidation.recordset[0];
    if (!user.isDefaultPassword) {
      return res.status(400).json({ success: false, message: 'This account does not have default credentials.' });
    }

    // Check if new username already exists by hashing and checking the hash
    const newUsernameHash = generateUsernameHash(newUsername);
    const usernameCheck = await pool.request()
      .input('newUsernameHash', sql.VarChar, newUsernameHash)
      .input('currentUserID', sql.Int, userID)
      .query('SELECT userID FROM userInfo WHERE usernameHash = @newUsernameHash AND userID != @currentUserID');

    if (usernameCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Username already exists.' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Encrypt the new username and update the hash
    const encryptedNewUsername = encrypt(newUsername);

    await pool.request()
      .input('userID', sql.Int, userID)
      .input('newUsername', sql.NVarChar, encryptedNewUsername)
      .input('newUsernameHash', sql.VarChar, newUsernameHash)
      .input('hashedPassword', sql.NVarChar, hashedPassword)
      .query(`
                UPDATE userInfo 
                SET 
                    username = @newUsername, 
                    usernameHash = @newUsernameHash,
                    passKey = @hashedPassword, 
                    isDefaultPassword = 0 
                WHERE userID = @userID
            `);

    await logAudit({ actor: 'C', module: 'A', userID: userID, actions: 'change-credentials', oldValue: `username: ${currentUsername}`, newValue: `username: ${newUsername}`, descriptions: 'User changed their credentials' });

    res.json({ success: true, message: 'Credentials changed successfully.' });

  } catch (error) {
    console.error('Error changing credentials:', error);
    res.status(500).json({ success: false, message: 'An error occurred while changing credentials.' });
  }
});

router.get('/validate-token', async (req, res) => {
  await validateToken(req, res);
});

module.exports = router;