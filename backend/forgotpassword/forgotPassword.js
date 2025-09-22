const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const bcrypt = require('bcrypt');
const { sendPasswordResetEmail, verifyOTP } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');

// Store OTPs temporarily (in a real app, use a database)
const otpStore = new Map();

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
    
    // Store OTP with expiration (5 minutes instead of 1 minute)
    otpStore.set(username, {
      otp,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      used: false
    });
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
router.post('/verify-otp', (req, res) => {
  try {
    const { username, otp } = req.body;
    
    if (!username || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Username and verification code are required'
      });
    }
    
    const otpData = otpStore.get(username);
    
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'No verification code found. Please request a new one.'
      });
    }
    
    // Check if OTP has expired
    if (Date.now() > otpData.expires) {
      otpStore.delete(username);
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new one.'
      });
    }
    
    // Check if OTP has been used
    if (otpData.used) {
      return res.status(400).json({
        success: false,
        message: 'This verification code has already been used. Please request a new one.'
      });
    }
    
    // Increment attempts
    otpData.attempts += 1;
    
    // Check if max attempts reached (3 attempts)
    if (otpData.attempts > 3) {
      otpStore.delete(username);
      return res.status(400).json({
        success: false,
        message: 'Too many failed attempts. Please request a new verification code.'
      });
    }
    
    // Check if OTP matches
    if (otpData.otp !== otp) {
      // Update the otpData in the store with the incremented attempts
      otpStore.set(username, otpData);
      addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: null,
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
    
    // Mark OTP as used
    otpData.used = true;
    otpStore.set(username, otpData);
    addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: null,
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
    
    const otpData = otpStore.get(username);
    
    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'No verification code found. Please request a new one.'
      });
    }
    
    // Check if OTP has expired
    if (Date.now() > otpData.expires) {
      otpStore.delete(username);
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new one.'
      });
    }
    
    // Check if OTP matches
    if (otpData.otp !== otp) {
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
    
    // Hash the password with bcrypt using salt rounds of 17
    const hashedPassword = await bcrypt.hash(newPassword, 17);
    
    const pool = await getConnection();
    
    // Update passKey with the hashed password
    await pool.request()
      .input('username', sql.VarChar, username)
      .input('passKey', sql.VarChar, hashedPassword)
      .query('UPDATE userInfo SET passKey = @passKey WHERE username = @username');
    
    // Clear OTP
    otpStore.delete(username);
    addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: null,
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
