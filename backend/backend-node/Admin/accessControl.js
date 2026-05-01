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
          ISNULL(ac.docsControl, 0) as docsControl,
          ISNULL(ac.budgetControl, 0) as budgetControl
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
        docsControl: Boolean(user.docsControl),
        budgetControl: Boolean(user.budgetControl)
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
    const { targetUserID, templateControl, trackerControl, docsControl, budgetControl } = req.body;
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
    } catch (e) { }

    // 1. Fetch current permissions for comparison
    const currentPermsRes = await pool.request()
      .input('userID', sql.Int, targetUserID)
      .query('SELECT templateControl, trackerControl, docsControl, budgetControl FROM accessControl WHERE userID = @userID');

    const current = currentPermsRes.recordset[0] || {
      templateControl: false, trackerControl: false, docsControl: false, budgetControl: false
    };

    // 2. Build specific messages
    const messages = [];
    const check = (key, label, newMode) => {
      const oldMode = Boolean(current[key]);
      if (oldMode !== newMode) {
        messages.push(newMode
          ? `You are now allowed to ${label}.`
          : `You are no longer allowed to ${label}.`
        );
      }
    };

    check('templateControl', 'create new projects', Boolean(templateControl));
    check('trackerControl', 'manage project tracker', Boolean(trackerControl));
    check('docsControl', 'manage supporting documents', Boolean(docsControl));
    check('budgetControl', 'manage budget allocations', Boolean(budgetControl));

    // 3. Update/Insert in DB
    if (currentPermsRes.recordset.length > 0) {
      await pool.request()
        .input('userID', sql.Int, targetUserID)
        .input('templateControl', sql.Bit, templateControl ? 1 : 0)
        .input('trackerControl', sql.Bit, trackerControl ? 1 : 0)
        .input('docsControl', sql.Bit, docsControl ? 1 : 0)
        .input('budgetControl', sql.Bit, budgetControl ? 1 : 0)
        .query(`
          UPDATE accessControl 
          SET templateControl = @templateControl, trackerControl = @trackerControl, docsControl = @docsControl, budgetControl = @budgetControl
          WHERE userID = @userID
        `);
    } else {
      await pool.request()
        .input('userID', sql.Int, targetUserID)
        .input('templateControl', sql.Bit, templateControl ? 1 : 0)
        .input('trackerControl', sql.Bit, trackerControl ? 1 : 0)
        .input('docsControl', sql.Bit, docsControl ? 1 : 0)
        .input('budgetControl', sql.Bit, budgetControl ? 1 : 0)
        .query(`
          INSERT INTO accessControl (userID, templateControl, trackerControl, docsControl, budgetControl)
          VALUES (@userID, @templateControl, @trackerControl, @docsControl, @budgetControl)
        `);
    }

    // Add audit trail
    await addAuditTrail({
      actor: 'C',
      module: 'A', // Access Control
      userID: req.user.userID,
      actions: 'update-access',
      descriptions: `SKC ${req.user.fullName} updated access controls for ${decodedFullName}. Template: ${templateControl}, Tracker: ${trackerControl}, Docs: ${docsControl}, Budget: ${budgetControl}`
    });

    // Notify the target user via WebSocket with specific messages
    try {
      const { sendToUser } = require('../websockets/websocket');
      sendToUser(targetUserID, {
        type: 'user_update',
        userID: targetUserID,
        messages: messages.length > 0 ? messages : ['Your account settings have been updated.']
      });
    } catch (wsError) {
      console.error('Failed to send WebSocket notification:', wsError);
    }

    return res.json({ success: true, message: 'Access control updated successfully.' });

  } catch (error) {
    console.error('Error updating access control:', error);
    return res.status(500).json({ success: false, message: 'Server error updating access control' });
  }
});

module.exports = router;
