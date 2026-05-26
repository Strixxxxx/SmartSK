const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { sendAccountCreationEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');
const { decrypt } = require('../utils/crypto');
const axios = require('axios');
const { downloadBlobAsText, registerContainerName } = require('../Storage/storage');

/**
 * Normalizes name for comparison (lowercase, alphanumeric parts).
 * Handles variations in dots and commas.
 */
const normalizeName = (name) => {
  if (!name) return new Set();
  const cleanName = name.toLowerCase().replace(/[.,]/g, ' ');
  return new Set(cleanName.split(/\s+/).filter(part => part.length > 0));
};

// Get all users
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if user has MA or SA position
    if (req.user.position !== 'Admin') {
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
    if (req.user.position !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access. Master Admin privileges required.'
      });
    }

    const {
      username,
      fullName,
      position, // roleName like 'SKC'
      emailAddress,
      phoneNumber,
      password
    } = req.body;

    const barangayID = req.user.barangay; // Inherit barangay from the admin

    // Validate required fields
    if (!username || !fullName || !position || !emailAddress || !phoneNumber || !password) {
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

    // Get roleID for the provided position
    const roleResult = await pool.request()
      .input('roleName', sql.NVarChar, position)
      .query('SELECT roleID FROM roles WHERE roleName = @roleName');

    if (roleResult.recordset.length === 0) {
      return res.status(400).json({ success: false, message: `Invalid position provided: ${position}` });
    }
    const positionID = roleResult.recordset[0].roleID;

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Get current termID for the barangay
    const termResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');
    
    const currentTermID = termResult.recordset.length > 0 ? termResult.recordset[0].termID : null;

    // --- Intelligent Matching Logic ---
    let finalTermID = null;

    // 1. Get Barangay Name for official list retrieval
    const barangayResult = await pool.request()
      .input('barangayID', sql.Int, barangayID)
      .query('SELECT barangayName FROM barangays WHERE barangayID = @barangayID');
    
    const barangayName = barangayResult.recordset.length > 0 ? barangayResult.recordset[0].barangayName : null;

    if (barangayName && currentTermID) {
      try {
        const blobName = `SK OFFICIAL - ${barangayName}.json`;
        const listData = await downloadBlobAsText(registerContainerName, blobName);
        const officialsList = JSON.parse(listData);

        const userParts = normalizeName(fullName);
        
        const match = officialsList.find(official => {
          const offName = official.fullName || '';
          const offParts = normalizeName(offName);
          
          if (userParts.size === 0 || offParts.size === 0) return false;

          // Check for subset matching (smart logic: Juan Dela Cruz matches Juan C. Dela Cruz)
          const userArr = Array.from(userParts);
          const offArr = Array.from(offParts);
          const isSubset = userArr.every(part => offParts.has(part)) || 
                           offArr.every(part => userParts.has(part));

          // Also check position (e.g. 'SKC' in JSON matches 'SKC' in position request)
          const positionMatch = String(official.position).toUpperCase() === String(position).toUpperCase();

          return isSubset && positionMatch;
        });

        if (match) {
          console.log(`[SmartSync] Match confirmed: ${fullName} matches official list for ${barangayName}. Assigning Term ${currentTermID}.`);
          finalTermID = currentTermID;
        } else {
          console.log(`[SmartSync] No match found in official list for ${fullName} (${position}) in ${barangayName}.`);
        }
      } catch (err) {
        console.error(`[SmartSync] Verification skipped or failed: ${err.message}`);
      }
    }

    // Encrypt user data
    const encryptedUsername = encrypt(username);
    const encryptedFullName = encrypt(fullName);
    const encryptedEmail = encrypt(emailAddress);
    const encryptedPhone = encrypt(phoneNumber);

    // Insert new user using an atomic transaction to ensure global ID synchronization
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
      .input('termID', sql.Int, finalTermID)
      .query(`
        BEGIN TRANSACTION;
        BEGIN TRY
          -- 1. Reserve the userID by inserting into preUserInfo first
          INSERT INTO preUserInfo (
            username,
            passKey,
            fullName,
            position,
            barangay,
            emailAddress,
            phoneNumber,
            isDefaultPassword,
            isArchived,
            emailHash,
            usernameHash
          )
          VALUES (
            @username,
            @passKey,
            @fullName,
            @positionID,
            @barangayID,
            @emailAddress,
            @phoneNumber,
            1,
            0,
            @emailHash,
            @usernameHash
          );
          
          DECLARE @newUserID INT = SCOPE_IDENTITY();
          
          -- 2. Insert into userInfo using the reserved userID
          SET IDENTITY_INSERT userInfo ON;
          INSERT INTO userInfo (
            userID,
            username,
            passKey,
            fullName,
            position,
            barangay,
            emailAddress,
            phoneNumber,
            isDefaultPassword,
            isArchived,
            emailHash,
            usernameHash,
            termID
          )
          VALUES (
            @newUserID,
            @username,
            @passKey,
            @fullName,
            @positionID,
            @barangayID,
            @emailAddress,
            @phoneNumber,
            1,
            0,
            @emailHash,
            @usernameHash,
            @termID
          );
          SET IDENTITY_INSERT userInfo OFF;
          
          COMMIT TRANSACTION;
          SELECT @newUserID AS userID;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
          THROW;
        END CATCH
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

    // Trigger Python sync logic in the background
    const pyPort = process.env.PY_PORT || 8080;
    axios.post(`http://127.0.0.1:${pyPort}/sync-account-official`, {
      user_id: userId,
      term_id: currentTermID
    }).catch(err => console.error("Failed to trigger Python account sync:", err.message));

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