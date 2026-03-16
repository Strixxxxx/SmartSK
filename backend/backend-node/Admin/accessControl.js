const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { decrypt } = require('../utils/crypto');
const { addAuditTrail } = require('../audit/auditService');

// Get access control list for the current SKC's barangay and term
router.get('/', async (req, res) => {
  try {
    const userBarangay = req.user.barangay; 
    const termID = req.user.termID;

    if (!userBarangay || !termID) {
      return res.status(400).json({ success: false, message: 'Barangay or Term ID is missing from user session.' });
    }

    const pool = await getConnection();

    // Get all users in the same barangay and term, along with their access control settings
    const result = await pool.request()
      .input('barangay', sql.Int, userBarangay)
      .input('termID', sql.Int, termID)
      .query(`
        SELECT 
          u.userID, 
          u.fullName, 
          r.roleName as position,
          ISNULL(ac.templateControl, 0) as templateControl,
          ISNULL(ac.trackerControl, 0) as trackerControl,
          ISNULL(ac.docsControl, 0) as docsControl
        FROM userInfo u
        LEFT JOIN roles r ON u.position = r.roleID
        LEFT JOIN accessControl ac ON u.userID = ac.userID
        WHERE u.barangay = @barangay 
          AND u.termID = @termID 
          AND u.isArchived = 0
          AND r.roleName != 'SKC' 
          AND r.roleName != 'Admin'
        ORDER BY r.roleID, u.fullName
      `);

    const decryptedUsers = result.recordset.map(user => {
      let decodedFullName = user.fullName;
      try {
        decodedFullName = decrypt(user.fullName);
      } catch (e) {
        console.error('Error decrypting full name', e);
      }
      return {
        ...user,
        fullName: decodedFullName,
        templateControl: Boolean(user.templateControl),
        trackerControl: Boolean(user.trackerControl),
        docsControl: Boolean(user.docsControl)
      };
    });

    return res.json({
      success: true,
      data: decryptedUsers
    });

  } catch (error) {
    console.error('Error fetching access control list:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching access control data' });
  }
});

// Update access control settings for a user
router.post('/update', async (req, res) => {
  try {
    const { targetUserID, templateControl, trackerControl, docsControl } = req.body;
    const userBarangay = req.user.barangay;
    const termID = req.user.termID;

    if (!targetUserID) {
      return res.status(400).json({ success: false, message: 'Target User ID is required.' });
    }

    const pool = await getConnection();

    // Verify the target user belongs to the same barangay and term
    const verifyResult = await pool.request()
      .input('targetUserID', sql.Int, targetUserID)
      .input('barangay', sql.Int, userBarangay)
      .input('termID', sql.Int, termID)
      .query(`
        SELECT fullName FROM userInfo 
        WHERE userID = @targetUserID AND barangay = @barangay AND termID = @termID AND isArchived = 0
      `);

    if (verifyResult.recordset.length === 0) {
      return res.status(403).json({ success: false, message: 'Cannot modify access for this user.' });
    }

    const targetUser = verifyResult.recordset[0];
    let decodedFullName = targetUser.fullName;
    try {
      decodedFullName = decrypt(targetUser.fullName);
    } catch (e) {}

    // Check if record exists in accessControl
    const existingCheck = await pool.request()
      .input('userID', sql.Int, targetUserID)
      .query('SELECT acID FROM accessControl WHERE userID = @userID');

    if (existingCheck.recordset.length > 0) {
      // Update
      await pool.request()
        .input('userID', sql.Int, targetUserID)
        .input('templateControl', sql.Bit, templateControl ? 1 : 0)
        .input('trackerControl', sql.Bit, trackerControl ? 1 : 0)
        .input('docsControl', sql.Bit, docsControl ? 1 : 0)
        .query(`
          UPDATE accessControl 
          SET templateControl = @templateControl, trackerControl = @trackerControl, docsControl = @docsControl
          WHERE userID = @userID
        `);
    } else {
      // Insert
      await pool.request()
        .input('userID', sql.Int, targetUserID)
        .input('templateControl', sql.Bit, templateControl ? 1 : 0)
        .input('trackerControl', sql.Bit, trackerControl ? 1 : 0)
        .input('docsControl', sql.Bit, docsControl ? 1 : 0)
        .query(`
          INSERT INTO accessControl (userID, templateControl, trackerControl, docsControl)
          VALUES (@userID, @templateControl, @trackerControl, @docsControl)
        `);
    }

    // Add audit trail
    await addAuditTrail({
      actor: 'C',
      module: 'A', // Access Control
      userID: req.user.userID,
      actions: 'update-access',
      descriptions: `SKC ${req.user.fullName} updated access controls for ${decodedFullName}. Template: ${templateControl}, Tracker: ${trackerControl}, Docs: ${docsControl}`
    });

    return res.json({ success: true, message: 'Access control updated successfully.' });

  } catch (error) {
    console.error('Error updating access control:', error);
    return res.status(500).json({ success: false, message: 'Server error updating access control' });
  }
});

module.exports = router;
