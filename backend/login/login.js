const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../database/database');
const { createSession, logout, validateToken, authMiddleware } = require('../session/session');
const { addAuditTrail } = require('../audit/auditService')

// --- Helper Functions ---

/**
 * Verifies if a string is a valid bcrypt hash.
 * @param {string} hash The string to verify.
 * @returns {boolean}
 */
function isValidBcryptHash(hash) {
  return typeof hash === 'string' &&
         hash.length === 60 &&
         hash.startsWith('$2b');
}

/**
 * Sanitizes string input by trimming whitespace.
 * @param {any} input The input to sanitize.
 * @returns {string|any} The trimmed string or original input if not a string.
 */
function sanitizeInput(input) {
  return typeof input === 'string' ? input.trim() : input;
}

/**
 * Asynchronously logs an audit trail event with its own isolated error handling
 * to prevent it from crashing the main application flow.
 * @param {object} auditData The data for the audit trail entry.
 */
async function logAudit(auditData) {
  try {
    // Ensure all data passed is in a format the audit service expects, especially userID
    const validatedAuditData = {
        ...auditData,
        userID: auditData.userID ? parseInt(auditData.userID, 10) : null,
    };
    await addAuditTrail(validatedAuditData);
  } catch (auditError) {
    console.error('CRITICAL: Audit trail logging failed.');
  }
}


// --- Main Login Route ---

router.post('/', async (req, res) => {
  let userForAudit = null; // To hold user info for failure auditing

  try {
    const username = sanitizeInput(req.body.username);
    const password = req.body.password; // Password is not trimmed to allow spaces if intended
    const barangay = sanitizeInput(req.body.barangay);

    console.log('Login attempt received');

    if (!username || !password || !barangay) {
      return res.status(400).json({ success: false, message: 'Username, password, and barangay are required' });
    }

    const pool = await getConnection();
    // FIXED: Changed u.userName to u.username to match database schema
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`
        SELECT u.userID, u.username, u.passKey, u.fullName, r.roleName as position, b.barangayName as barangay, u.isDefaultPassword, u.isArchived
        FROM userInfo u
        LEFT JOIN roles r ON u.position = r.roleID
        LEFT JOIN barangays b ON u.barangay = b.barangayID
        WHERE u.username = @username
      `);

    const user = result.recordset[0];
    userForAudit = user; // Store user for potential failure log

    if (!user) {
      console.log('Login failed: User not found');
      logAudit({
        actor: 'S',
        module: 'L',
        userID: null,
        actions: 'login-failure',
        descriptions: 'Login attempt for non-existent user'
      });
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (user.isArchived) {
      console.log('Login failed: Account is archived');
      logAudit({
        actor: 'S',
        module: 'L',
        userID: user.userID,
        actions: 'login-failure',
        descriptions: 'Login attempt for archived account'
      });
      return res.status(401).json({ success: false, message: 'This account has been archived. Please contact an administrator.' });
    }

    if (user.barangay !== barangay) {
      console.log('Login failed: Incorrect barangay for user.');
      logAudit({
        actor: 'S',
        module: 'L',
        userID: user.userID,
        actions: 'login-failure',
        descriptions: 'Incorrect barangay attempt for user'
      });
      return res.status(401).json({ success: false, message: 'You are not authorized to log in for this barangay.' });
    }

    if (!isValidBcryptHash(user.passKey)) {
      console.error('Login failed: Invalid hash format in database for user.');
      return res.status(500).json({ success: false, message: 'Server configuration error. Please contact admin.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passKey);

    if (!passwordMatches) {
      console.log('Login failed: Invalid password for user.');
      logAudit({
        actor: 'S',
        module: 'L',
        userID: user.userID,
        actions: 'login-failure',
        descriptions: 'Invalid password attempt for user'
      });
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // --- Login Success Logic ---

    const sessionID = await createSession(user.userID);

    const token = jwt.sign(
      { userId: user.userID, username: user.username, sessionID: sessionID, position: user.position },
      process.env.JWT_SECRET_KEY || 'your-secret-key-here',
      { expiresIn: '24h' }
    );

    // 1. Send success response to the client with token and user data
    res.json({
      success: true,
      message: 'Login successful',
      token, // Include the token in the response
      user: {
        userId: user.userID, // Use consistent casing
        username: user.username,
        fullName: user.fullName,
        position: user.position,
        barangay: user.barangay,
        isDefaultPassword: user.isDefaultPassword,
        isArchived: user.isArchived
      }
    });

    // 2. Log the successful login to the audit trail (this will no longer crash the app)
    console.log('Login successful for user.');
    logAudit({
      actor: user.position === 'MA' || user.position === 'SA' ? 'A' : 'C',
      module: 'L',
      userID: user.userID,
      actions: 'login-success',
      descriptions: 'User logged in successfully'
    });

  } catch (error) {
    console.error('A critical error occurred during the login process.');

    // Log a generic failure to the audit trail if possible
    logAudit({
        actor: 'S',
        module: 'L',
        userID: userForAudit ? userForAudit.userID : null,
        actions: 'login-error',
        descriptions: 'Server error during login attempt'
    });

    if (!res.headersSent) {
        return res.status(500).json({
            success: false,
            message: 'An error occurred during login'
        });
    }
  }
});


// --- Other Routes ---

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { userId, username, position } = req.user;
    await logout(req, res); // Let session handler send the response
    logAudit({
        actor: position === 'MA' || position === 'SA' ? 'A' : 'C',
        module: 'L',
        userID: userId,
        actions: 'logout',
        descriptions: 'User logged out'
    });
  } catch (error) {
     console.error('Error during logout.');
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

        // Enhanced authorization check with multiple fallback methods
        let isAuthorized = false;
        
        // Method 1: Direct user ID comparison
        if (req.user && req.user.userId && String(req.user.userId) === String(userID)) {
            isAuthorized = true;
        }
        
        // Method 2: Username comparison (for cases where user ID might not match)
        if (!isAuthorized && req.user && req.user.username && req.user.username === currentUsername) {
            isAuthorized = true;
        }
        
        // Method 3: Additional check by querying database to verify the user exists and matches the token
        if (!isAuthorized && req.user && req.user.userId) {
            try {
                const pool = await getConnection();
                const userCheck = await pool.request()
                    .input('tokenUserId', sql.Int, req.user.userId)
                    .input('requestUserId', sql.Int, userID)
                    .input('currentUsername', sql.NVarChar, currentUsername)
                    .query(`
                        SELECT userID FROM userInfo 
                        WHERE (userID = @tokenUserId AND userID = @requestUserId) 
                           OR (userID = @tokenUserId AND username = @currentUsername)
                    `);
                
                if (userCheck.recordset.length > 0) {
                    isAuthorized = true;
                }
            } catch (dbError) {
                console.error('Database verification error.');
                // Continue with existing authorization logic
            }
        }

        if (!isAuthorized) {
            console.log('Authorization failed - User verification failed');
            // console.log('Token user:', req.user);
            // console.log('Request data:', { userID, currentUsername });
            return res.status(403).json({ success: false, message: 'Unauthorized action.' });
        }

        // Validate that the user requesting change actually has default password
        const pool = await getConnection();
        const userValidation = await pool.request()
            .input('userID', sql.Int, userID)
            .input('currentUsername', sql.NVarChar, currentUsername)
            .query(`
                SELECT userID, isDefaultPassword FROM userInfo 
                WHERE userID = @userID AND username = @currentUsername
            `);

        if (userValidation.recordset.length === 0) {
            return res.status(400).json({ success: false, message: 'User not found or username mismatch.' });
        }

        const user = userValidation.recordset[0];
        if (!user.isDefaultPassword) {
            return res.status(400).json({ success: false, message: 'This account does not have default credentials.' });
        }

        // Check if new username already exists (excluding current user)
        const usernameCheck = await pool.request()
            .input('newUsername', sql.NVarChar, newUsername)
            .input('currentUserID', sql.Int, userID)
            .query(`
                SELECT userID FROM userInfo 
                WHERE username = @newUsername AND userID != @currentUserID
            `);

        if (usernameCheck.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'Username already exists.' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update user credentials
        await pool.request()
            .input('userID', sql.Int, userID)
            .input('newUsername', sql.NVarChar, newUsername)
            .input('hashedPassword', sql.NVarChar, hashedPassword)
            .query(`
                UPDATE userInfo 
                SET 
                    username = @newUsername, 
                    passKey = @hashedPassword, 
                    isDefaultPassword = 0 
                WHERE userID = @userID
            `);

        // Log audit trail
        await logAudit({
            actor: 'C',
            module: 'A',
            userID: userID,
            actions: 'change-credentials',
            oldValue: `username: ${currentUsername}`,
            newValue: `username: ${newUsername}`,
            descriptions: 'User changed their credentials'
        });

        console.log('Credentials successfully changed for user.');
        res.json({ success: true, message: 'Credentials changed successfully.' });

    } catch (error) {
        console.error('Error changing credentials.');
        res.status(500).json({ success: false, message: 'An error occurred while changing credentials.' });
    }
});

router.get('/validate-token', async (req, res) => {
  await validateToken(req, res);
});

module.exports = router;