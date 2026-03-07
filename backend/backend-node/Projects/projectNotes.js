const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { decrypt } = require('../utils/crypto');

/**
 * Project Notes / Work Agenda Router
 * Mounted at /api/project-notes
 */

// GET /:batchID — Fetch all notes for a project batch
router.get('/:batchID', async (req, res) => {
    try {
        const { batchID } = req.params;
        const pool = await getConnection();
        const result = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`
                SELECT n.noteID, n.batchID, n.userID, n.content, n.createdAt,
                       u.fullName, r.roleName AS position
                FROM projectNotes n
                JOIN userInfo u ON n.userID = u.userID
                JOIN roles r ON u.position = r.roleID
                WHERE n.batchID = @batchID
                ORDER BY n.createdAt ASC
            `);

        const decryptedData = result.recordset.map(row => ({
            ...row,
            fullName: decrypt(row.fullName) || 'Unknown'
        }));

        res.json({ success: true, data: decryptedData });
    } catch (err) {
        console.error('[projectNotes] GET error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch notes.' });
    }
});

// POST /:batchID — Create a new note
router.post('/:batchID', async (req, res) => {
    try {
        const { batchID } = req.params;
        const { content } = req.body;
        const userID = req.user?.userID;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Note content is required.' });
        }

        const pool = await getConnection();
        const result = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('content', sql.NVarChar(sql.MAX), content.trim())
            .query(`
                INSERT INTO projectNotes (batchID, userID, content)
                OUTPUT INSERTED.noteID, INSERTED.batchID, INSERTED.userID, INSERTED.content, INSERTED.createdAt
                VALUES (@batchID, @userID, @content)
            `);

        const newNote = result.recordset[0];

        // Fetch user info for the response
        const userResult = await pool.request()
            .input('userID', sql.Int, userID)
            .query(`
                SELECT u.fullName, r.roleName AS position
                FROM userInfo u
                JOIN roles r ON u.position = r.roleID
                WHERE u.userID = @userID
            `);

        const enrichedNote = {
            ...newNote,
            fullName: decrypt(userResult.recordset[0]?.fullName) || 'Unknown',
            position: userResult.recordset[0]?.position || '',
        };

        res.status(201).json({ success: true, data: enrichedNote });
    } catch (err) {
        console.error('[projectNotes] POST error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save note.' });
    }
});

module.exports = router;
