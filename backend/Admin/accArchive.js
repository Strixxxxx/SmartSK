const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const routeGuard = require('../routeGuard/routeGuard');

// Middleware to ensure only admins can access these routes
router.use(authMiddleware, routeGuard.isAdmin);

// POST to archive an account
router.post('/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        request.input('userID', sql.Int, userId);

        const userToArchive = await pool.request()
            .input('userID', sql.Int, userId)
            .query('SELECT username FROM userInfo WHERE userID = @userID');

        if (userToArchive.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const { username } = userToArchive.recordset[0];

        await request.execute('accArchived');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'archive-account',
            oldValue: `username: ${username}`,
            newValue: `userID: ${userId}`,
            descriptions: `Admin archived account for user: ${username}`
        });

        res.json({ success: true, message: 'Account archived successfully.' });
    } catch (error) {
        console.error(`Error archiving account ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive account.' });
    }
});

// POST to restore an archived account
router.post('/restore/:userId', async (req, res) => {
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

        if (!isArchived) {
            return res.status(400).json({ success: false, message: 'User is not archived.' });
        }

        // If user is found and archived, proceed with restoration
        const request = pool.request();
        request.input('userID', sql.Int, userId);
        await request.execute('accReturn');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'restore-account',
            oldValue: `userID: ${userId}`,
            newValue: `username: ${username}`,
            descriptions: `Admin restored account for user: ${username}`
        });

        res.json({ success: true, message: 'Account restored successfully.' });
    } catch (error) {
        console.error(`Error restoring account ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore account.' });
    }
});

module.exports = router;
