const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { sendAccountCreationEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');

// Get all users
router.get('/users', authMiddleware, async (req, res) => {
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

    // Fetch all non-archived users
    const users = await pool.request()
      .query(`
        SELECT 
          userName,
          fullName,
          emailAddress,
          phoneNumber,
          isArchived
        FROM userInfo
        WHERE isArchived = 0
        ORDER BY fullName ASC
      `);

    // Process users to show status
    const processedUsers = users.recordset.map(user => ({
      userName: user.userName,
      fullName: user.fullName,
      emailAddress: user.emailAddress,
      phoneNumber: user.phoneNumber,
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

    // Check if username already exists
    const userCheck = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT userID FROM userInfo WHERE username = @username');

    if (userCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Check if email already exists
    const emailCheck = await pool.request()
      .input('emailAddress', sql.NVarChar, emailAddress)
      .query('SELECT userID FROM userInfo WHERE emailAddress = @emailAddress');

    if (emailCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email address already exists'
      });
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

    // Insert new user
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('fullName', sql.NVarChar, fullName)
      .input('barangayID', sql.Int, barangayID)
      .input('emailAddress', sql.NVarChar, emailAddress)
      .input('phoneNumber', sql.NVarChar, phoneNumber)
      .input('passKey', sql.NVarChar, hashedPassword)
      .input('positionID', sql.Int, positionID)
      .query(`
        INSERT INTO userInfo (
          username,
          fullName,
          barangay,
          emailAddress,
          phoneNumber,
          passKey,
          position,
          isDefaultPassword
        )
        VALUES (
          @username,
          @fullName,
          @barangayID,
          @emailAddress,
          @phoneNumber,
          @passKey,
          @positionID,
          1
        );
        SELECT SCOPE_IDENTITY() AS userID;
      `);

    const userId = result.recordset[0].userID;

    // Send account creation email
    const emailResult = await sendAccountCreationEmail(username, emailAddress);
    
    if (!emailResult.success) {
      console.error('Failed to send account creation email');
      // Note: We don't return here as the account was still created successfully
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
    console.error('Error creating account');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating the account'
    });
  }
});

module.exports = router;