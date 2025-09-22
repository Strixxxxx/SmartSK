const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const bcrypt = require('bcrypt');
const { sendPasswordResetEmail, verifyOTP } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');

// Request password reset
router.post('/request', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    
    const pool = await getConnection();
    
    // Check if user exists
    const userResult = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT userID, emailAddress FROM userInfo WHERE username = @username');
    
    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const { userID, emailAddress } = userResult.recordset[0];
    
    // Use the email service to generate and send OTP
    const { otp, success, message } = await sendPasswordResetEmail(emailAddress);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        message: message || 'Failed to send verification code'
      });
    }
    
    // Hash the OTP before storing
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Invalidate any previous OTPs for this user
    await pool.request()
      .input('userID', sql.Int, userID)
      .query('DELETE FROM otpStore WHERE userID = @userID');

    // Store the new hashed OTP in the database
    await pool.request()
      .input('userID', sql.Int, userID)
      .input('hashedOtp', sql.VarChar, hashedOtp)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO otpStore (userID, otpCode, expiresAt, attempts, isUsed) 
        VALUES (@userID, @hashedOtp, @expiresAt, 0, 0)
      `);

    addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: userID,
        actions: 'request-password-reset',
        oldValue: null,
        newValue: null,
        descriptions: 'User requested a password reset'
    });
    
    return res.json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    console.error('Password reset request error');
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { username, otp } = req.body;
    
    if (!username || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Username and verification code are required'
      });
    }
    
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT userID FROM userInfo WHERE username = @username');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { userID } = userResult.recordset[0];

    // Fetch the latest, unused OTP for the user
    const otpResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query(`
        SELECT * FROM otpStore 
        WHERE userID = @userID AND isUsed = 0 
        ORDER BY createdAt DESC
      `);
    const otpData = otpResult.recordset[0];
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'No verification code found. Please request a new one.'
      });
    }
    
    // Check if OTP has expired
    if (new Date() > new Date(otpData.expiresAt)) {
      await pool.request().input('otpID', sql.Int, otpData.otpID).query('DELETE FROM otpStore WHERE otpID = @otpID');
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new one.'
      });
    }
    
    // Check if OTP has been used
    if (otpData.isUsed) {
      return res.status(400).json({
        success: false,
        message: 'This verification code has already been used. Please request a new one.'
      });
    }
    
    // Check if max attempts reached (3 attempts)
    if (otpData.attempts >= 3) {
      await pool.request()
        .input('otpID', sql.Int, otpData.otpID)
        .query('DELETE FROM otpStore WHERE otpID = @otpID');

      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. Please request a new verification code.'
      });
    }
    
    // Check if OTP matches
    const otpMatch = await bcrypt.compare(otp, otpData.otpCode);
    if (!otpMatch) {
      // Increment attempts in the database
      await pool.request()
        .input('otpID', sql.Int, otpData.otpID)
        .query('UPDATE otpStore SET attempts = attempts + 1 WHERE otpID = @otpID');

      addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: userID,
        actions: 'verify-otp-failure',
        oldValue: null,
        newValue: `username: ${username}`,
        descriptions: 'OTP verification failed'
    });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }
    
    addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: userID,
        actions: 'verify-otp-success',
        oldValue: null,
        newValue: `username: ${username}`,
        descriptions: 'OTP verification successful'
    });
    
    return res.json({
      success: true,
      message: 'Verification successful'
    });
  } catch (error) {
    console.error('OTP verification error');
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
});

// Reset password
router.post('/reset', async (req, res) => {
  try {
    const { username, otp, newPassword } = req.body;
    
    if (!username || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT userID FROM userInfo WHERE username = @username');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { userID } = userResult.recordset[0];

    // Fetch the latest, unused OTP for the user
    const otpResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query(`
        SELECT * FROM otpStore 
        WHERE userID = @userID AND isUsed = 0 
        ORDER BY createdAt DESC
      `);
    const otpData = otpResult.recordset[0];
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'No verification code found. Please request a new one.'
      });
    }
    
    // Check if OTP has expired
    if (new Date() > new Date(otpData.expiresAt)) {
      await pool.request().input('otpID', sql.Int, otpData.otpID).query('DELETE FROM otpStore WHERE otpID = @otpID');
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new one.'
      });
    }
    
    // Check if OTP matches
    const otpMatch = await bcrypt.compare(otp, otpData.otpCode);
    if (!otpMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }
    
    // Validate password
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,16}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet requirements'
      });
    }
    
    // Atomically mark the OTP as used to prevent race conditions
    const updateOtpResult = await pool.request()
      .input('otpID', sql.Int, otpData.otpID)
      .query('UPDATE otpStore SET isUsed = 1 WHERE otpID = @otpID AND isUsed = 0');

    if (updateOtpResult.rowsAffected[0] === 0) {
      return res.status(400).json({
        success: false,
        message: 'This verification code has already been used or is invalid.'
      });
    }

    // Hash the password with bcrypt using a standard salt round value (e.g., 12)
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update passKey with the hashed password
    await pool.request()
      .input('username', sql.VarChar, username)
      .input('passKey', sql.VarChar, hashedPassword)
      .query('UPDATE userInfo SET passKey = @passKey WHERE username = @username');

    addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: userID,
        actions: 'reset-password',
        oldValue: null,
        newValue: null,
        descriptions: 'User reset their password'
    });
    
    return res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Password reset error');
    return res.status(500).json({
      success: false,
      message: 'An error occurred'
    });
  }
});

module.exports = router;
