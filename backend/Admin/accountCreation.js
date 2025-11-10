const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { sendAccountCreationEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt } = require('../utils/crypto');

// Get all users
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if user has MA or SA position
    if (req.user.position !== 'MA' && req.user.position !== 'SA') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access. Master Admin privileges required.'
      });
    }

    // Get database connection
    const pool = await getConnection();
    const userBarangay = req.user.barangay; // Get barangay from the authenticated user

    // Fetch non-archived users from the user's barangay
    const users = await pool.request()
      .input('userBarangay', sql.Int, userBarangay)
      .query(`
        SELECT 
          userName,
          fullName,
          emailAddress,
          phoneNumber,
          isArchived
        FROM userInfo
        WHERE isArchived = 0 AND barangay = @userBarangay
        ORDER BY fullName ASC
      `);

    // Decrypt user data before sending to client
    const processedUsers = users.recordset.map(user => ({
      userName: decrypt(user.userName),
      fullName: decrypt(user.fullName),
      emailAddress: decrypt(user.emailAddress),
      phoneNumber: decrypt(user.phoneNumber),
      actualStatus: user.isArchived ? 'inactive' : 'active'
    }));

    return res.status(200).json({
      success: true,
      users: processedUsers
    });

  } catch (error) {
    console.error('Error fetching users');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching users'
    });
  }
});

const { encrypt, generateEmailHash, generateUsernameHash } = require('../utils/crypto');

// Create new account
router.post('/create-account', authMiddleware, async (req, res) => {
  try {
    // Check if user has MA or SA position
    if (req.user.position !== 'MA' && req.user.position !== 'SA') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access. Master Admin privileges required.'
      });
    }

    const {
      username,
      fullName,
      barangay,
      emailAddress,
      phoneNumber,
      password
    } = req.body;

    // Validate required fields
    if (!username || !fullName || !barangay || !emailAddress || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /@(gmail\.com|outlook\.com|yahoo\.com)$/i;
    if (!emailRegex.test(emailAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email domain. Only @gmail.com, @outlook.com, and @yahoo.com are allowed.'
      });
    }

    // Get database connection
    const pool = await getConnection();

    // Check if email or username already exists using hashes
    const emailHash = generateEmailHash(emailAddress);
    const usernameHash = generateUsernameHash(username);

    const emailCheck = await pool.request()
      .input('emailHash', sql.VarChar, emailHash)
      .query('SELECT userID FROM userInfo WHERE emailHash = @emailHash');

    if (emailCheck.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Email address already exists' });
    }

    const usernameCheck = await pool.request()
      .input('usernameHash', sql.VarChar, usernameHash)
      .query('SELECT userID FROM userInfo WHERE usernameHash = @usernameHash');

    if (usernameCheck.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    // Get barangayID from barangay name
    const barangayResult = await pool.request()
      .input('barangayName', sql.NVarChar, barangay)
      .query('SELECT barangayID FROM barangays WHERE barangayName = @barangayName');

    if (barangayResult.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid barangay provided' });
    }
    const barangayID = barangayResult.recordset[0].barangayID;

    // Get roleID for 'SKO'
    const roleResult = await pool.request()
      .input('roleName', sql.NVarChar, 'SKO')
      .query('SELECT roleID FROM roles WHERE roleName = @roleName');

    if (roleResult.recordset.length === 0) {
      return res.status(500).json({ success: false, message: 'Default role "SKO" not found in database.' });
    }
    const positionID = roleResult.recordset[0].roleID;

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Encrypt user data
    const encryptedUsername = encrypt(username);
    const encryptedFullName = encrypt(fullName);
    const encryptedEmail = encrypt(emailAddress);
    const encryptedPhone = encrypt(phoneNumber);

    // Insert new user
    const result = await pool.request()
      .input('username', sql.NVarChar, encryptedUsername)
      .input('fullName', sql.NVarChar, encryptedFullName)
      .input('barangayID', sql.Int, barangayID)
      .input('emailAddress', sql.NVarChar, encryptedEmail)
      .input('phoneNumber', sql.NVarChar, encryptedPhone)
      .input('passKey', sql.NVarChar, hashedPassword)
      .input('positionID', sql.Int, positionID)
      .input('emailHash', sql.VarChar, emailHash)
      .input('usernameHash', sql.VarChar, usernameHash)
      .query(`
        INSERT INTO userInfo (
          username,
          fullName,
          barangay,
          emailAddress,
          phoneNumber,
          passKey,
          position,
          isDefaultPassword,
          emailHash,
          usernameHash
        )
        VALUES (
          @username,
          @fullName,
          @barangayID,
          @emailAddress,
          @phoneNumber,
          @passKey,
          @positionID,
          1,
          @emailHash,
          @usernameHash
        );
        SELECT SCOPE_IDENTITY() AS userID;
      `);

    const userId = result.recordset[0].userID;

    // Send account creation email
    const emailResult = await sendAccountCreationEmail(username, emailAddress);
    
    if (!emailResult.success) {
      console.error('Failed to send account creation email');
    }
    addAuditTrail({
        actor: 'A',
        module: 'C',
        userID: req.user.userId,
        actions: 'create-account',
        oldValue: null,
        newValue: `Username: ${username}`,
        descriptions: `Admin ${req.user.fullName} created a new account for ${username}`
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      userId
    });

  } catch (error) {
    console.error('Error creating account', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the account'
    });
  }
});

module.exports = router;