const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { decrypt } = require('../utils/crypto');

// GET all archived accounts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        u.userID, 
        u.username, 
        u.fullName, 
        r.roleName as position, 
        b.barangayName as barangay, 
        u.emailAddress, 
        u.phoneNumber,
        u.isArchived
      FROM userInfo u
      LEFT JOIN roles r ON u.position = r.roleID
      LEFT JOIN barangays b ON u.barangay = b.barangayID
      WHERE u.isArchived = 1
      ORDER BY u.fullName
    `);

    const decryptedData = result.recordset.map(user => ({
        ...user,
        username: decrypt(user.username),
        fullName: decrypt(user.fullName),
        emailAddress: decrypt(user.emailAddress),
        phoneNumber: decrypt(user.phoneNumber),
    }));

    res.json({ success: true, data: decryptedData });
  } catch (error) {
    console.error('Error fetching archived accounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch archived accounts.' });
  }
});

// POST to archive an account
router.post('/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const userToArchiveResult = await transaction.request()
            .input('userID', sql.Int, userId)
            .query('SELECT username FROM userInfo WHERE userID = @userID');

        if (userToArchiveResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const decryptedUsername = decrypt(userToArchiveResult.recordset[0].username);

        // 1. Archive the user account
        await transaction.request()
            .input('userID', sql.Int, userId)
            .query('UPDATE userInfo SET isArchived = 1 WHERE userID = @userID');

        // 2. Archive all posts by that user
        await transaction.request()
            .input('userID', sql.Int, userId)
            .input('archivedAt', sql.DateTime, new Date())
            .query('UPDATE posts SET isArchived = 1, archivedAt = @archivedAt WHERE userID = @userID');

        await transaction.commit();

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'archive-account',
            descriptions: `Admin ${req.user.fullName} archived account for user: ${decryptedUsername}. All associated posts were also archived.`
        });

        res.json({ success: true, message: 'Account and all associated posts have been archived successfully.' });

    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error(`Error rolling back transaction for account archive ${userId}:`, rollbackError);
        }
        console.error(`Error archiving account ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive account.' });
    }
});

// POST to restore an archived account
router.post('/restore/:userId', authMiddleware, async (req, res) => {
    const { userId } = req.params;
    try {
        const pool = await getConnection();
        
        // Check if the user exists and is actually archived
        const userToRestore = await pool.request()
            .input('userID', sql.Int, userId)
            .query('SELECT username, isArchived FROM userInfo WHERE userID = @userID');

        if (userToRestore.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const { username, isArchived } = userToRestore.recordset[0];
        const decryptedUsername = decrypt(username);

        if (!isArchived) {
            return res.status(400).json({ success: false, message: 'User is not archived.' });
        }

        // Update the isArchived flag to restore the user
        await pool.request()
            .input('userID', sql.Int, userId)
            .query('UPDATE userInfo SET isArchived = 0 WHERE userID = @userID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'restore-account',
            descriptions: `Admin ${req.user.fullName} restored account for user: ${decryptedUsername}`
        });

        res.json({ success: true, message: 'Account restored successfully.' });
    } catch (error) {
        console.error(`Error restoring account ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore account.' });
    }
});

module.exports = router;
