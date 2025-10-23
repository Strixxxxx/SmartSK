const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const bcrypt = require('bcrypt');
const { sendPasswordResetEmail } = require('../Email/email');
const { addAuditTrail } = require('../audit/auditService');
const { generateEmailHash, generateUsernameHash, decrypt } = require('../utils/crypto');

function sanitizeInput(input) {
  return typeof input === 'string' ? input.trim() : input;
}

// Request password reset
router.post('/request', async (req, res) => {
  try {
    const identifier = sanitizeInput(req.body.identifier);
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Username or email address is required'
      });
    }
    
    const pool = await getConnection();
    const request = pool.request();
    let userQuery;

    if (identifier.includes('@')) {
        const emailHash = generateEmailHash(identifier);
        request.input('hash', sql.VarChar, emailHash);
        userQuery = 'WHERE emailHash = @hash';
    } else {
        const usernameHash = generateUsernameHash(identifier);
        request.input('hash', sql.VarChar, usernameHash);
        userQuery = 'WHERE usernameHash = @hash';
    }
    
    const userResult = await request.query(`SELECT userID, username, emailAddress FROM userInfo ${userQuery}`);
    
    if (userResult.recordset.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account with this identifier exists, a verification code has been sent.'
      });
    }
    
    const { userID, username, emailAddress: encryptedEmail } = userResult.recordset[0];
    
    let decryptedEmail;
    try {
        if (!encryptedEmail) {
            throw new Error('User email address is missing.');
        }
        decryptedEmail = decrypt(encryptedEmail);
        if (!decryptedEmail) {
            throw new Error('Decryption resulted in an empty email address.');
        }
    } catch (e) {
        console.error(`Failed to decrypt email for user ID ${userID} during password reset:`, e.message);
        // We still return a generic success message to not reveal if the user exists or has a corrupted email
        return res.status(200).json({
            success: true,
            message: 'If an account with this identifier exists, a verification code has been sent.'
        });
    }

    const { otp, success, message } = await sendPasswordResetEmail(decryptedEmail, userID);
    
    if (!success) {
      return res.status(500).json({ success: false, message: message || 'Failed to send verification code' });
    }
    
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.request().input('userID', sql.Int, userID).query('DELETE FROM otpStore WHERE userID = @userID');

    await pool.request()
      .input('userID', sql.Int, userID)
      .input('hashedOtp', sql.VarChar, hashedOtp)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`INSERT INTO otpStore (userID, otpCode, expiresAt, attempts, isUsed) VALUES (@userID, @hashedOtp, @expiresAt, 0, 0)`);

    addAuditTrail({
        actor: 'C',
        module: 'F',
        userID: userID,
        actions: 'request-password-reset',
        oldValue: null,
        newValue: null,
        descriptions: `User ${decrypt(username)} requested a password reset`
    });
    
    return res.json({
      success: true,
      message: 'If an account with this identifier exists, a verification code has been sent.'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const identifier = sanitizeInput(req.body.identifier);
    const otp = sanitizeInput(req.body.otp);
    
    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: 'Identifier and verification code are required' });
    }
    
    const pool = await getConnection();
    const request = pool.request();
    let userQuery;

    if (identifier.includes('@')) {
        const emailHash = generateEmailHash(identifier);
        request.input('hash', sql.VarChar, emailHash);
        userQuery = 'WHERE emailHash = @hash';
    } else {
        const usernameHash = generateUsernameHash(identifier);
        request.input('hash', sql.VarChar, usernameHash);
        userQuery = 'WHERE usernameHash = @hash';
    }

    const userResult = await request.query(`SELECT userID FROM userInfo ${userQuery}`);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { userID } = userResult.recordset[0];

    const otpResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query(`SELECT * FROM otpStore WHERE userID = @userID AND isUsed = 0 ORDER BY createdAt DESC`);
    const otpData = otpResult.recordset[0];

    if (!otpData) {
      return res.status(400).json({ success: false, message: 'No verification code found. Please request a new one.' });
    }
    
    if (new Date() > new Date(otpData.expiresAt)) {
      await pool.request().input('otpID', sql.Int, otpData.otpID).query('DELETE FROM otpStore WHERE otpID = @otpID');
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }
    
    if (otpData.isUsed) {
      return res.status(400).json({ success: false, message: 'This verification code has already been used.' });
    }
    
    if (otpData.attempts >= 3) {
      await pool.request().input('otpID', sql.Int, otpData.otpID).query('DELETE FROM otpStore WHERE otpID = @otpID');
      return res.status(400).json({ success: false, message: 'Too many failed attempts. Please request a new code.' });
    }
    
    const otpMatch = await bcrypt.compare(otp, otpData.otpCode);
    if (!otpMatch) {
      await pool.request().input('otpID', sql.Int, otpData.otpID).query('UPDATE otpStore SET attempts = attempts + 1 WHERE otpID = @otpID');
      addAuditTrail({ actor: 'C', module: 'F', userID: userID, actions: 'verify-otp-failure', descriptions: 'OTP verification failed' });
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }
    
    addAuditTrail({ actor: 'C', module: 'F', userID: userID, actions: 'verify-otp-success', descriptions: 'OTP verification successful' });
    
    return res.json({ success: true, message: 'Verification successful' });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred' });
  }
});

// Reset password
router.post('/reset', async (req, res) => {
  try {
    const identifier = sanitizeInput(req.body.identifier);
    const otp = sanitizeInput(req.body.otp);
    const { newPassword } = req.body;
    
    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    const pool = await getConnection();
    const request = pool.request();
    let userQuery;

    if (identifier.includes('@')) {
        const emailHash = generateEmailHash(identifier);
        request.input('hash', sql.VarChar, emailHash);
        userQuery = 'WHERE emailHash = @hash';
    } else {
        const usernameHash = generateUsernameHash(identifier);
        request.input('hash', sql.VarChar, usernameHash);
        userQuery = 'WHERE usernameHash = @hash';
    }

    const userResult = await request.query(`SELECT userID FROM userInfo ${userQuery}`);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { userID } = userResult.recordset[0];

    const otpResult = await pool.request()
      .input('userID', sql.Int, userID)
      .query(`SELECT * FROM otpStore WHERE userID = @userID AND isUsed = 0 ORDER BY createdAt DESC`);
    const otpData = otpResult.recordset[0];

    if (!otpData) {
      return res.status(400).json({ success: false, message: 'No verification code found. Please request a new one.' });
    }
    
    if (new Date() > new Date(otpData.expiresAt)) {
      await pool.request().input('otpID', sql.Int, otpData.otpID).query('DELETE FROM otpStore WHERE otpID = @otpID');
      return res.status(400).json({ success: false, message: 'Verification code has expired.' });
    }
    
    const otpMatch = await bcrypt.compare(otp, otpData.otpCode);
    if (!otpMatch) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,16}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password does not meet requirements' });
    }
    
    const updateOtpResult = await pool.request()
      .input('otpID', sql.Int, otpData.otpID)
      .query('DELETE FROM otpStore WHERE otpID = @otpID AND isUsed = 0');

    if (updateOtpResult.rowsAffected[0] === 0) {
      return res.status(400).json({ success: false, message: 'This verification code has already been used.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await pool.request()
      .input('userID', sql.Int, userID)
      .input('passKey', sql.VarChar, hashedPassword)
      .query('UPDATE userInfo SET passKey = @passKey WHERE userID = @userID');

    addAuditTrail({ actor: 'C', module: 'F', userID: userID, actions: 'reset-password', descriptions: 'User reset their password' });
    
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred' });
  }
});

module.exports = router;
