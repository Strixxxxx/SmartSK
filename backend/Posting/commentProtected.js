const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');

// PUT (edit) a comment
router.put('/comments/:commentId', async (req, res) => {
    const { commentId } = req.params;
    const { commentText } = req.body;
    const { userID } = req.user; // User ID from auth token

    if (!commentText) {
        return res.status(400).json({ message: 'Comment text cannot be empty.' });
    }

    try {
        const db = await getConnection();
        const result = await db.request()
            .input('commentID', sql.Int, commentId)
            .input('userID', sql.Int, userID)
            .input('commentText', sql.NVarChar(sql.MAX), commentText)
            .query(`
                UPDATE postComment 
                SET commentText = @commentText 
                WHERE commentID = @commentID AND userID = @userID;
            `);

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'Comment updated successfully.' });
        } else {
            // This means either the comment doesn't exist or the user doesn't have permission
            res.status(404).json({ message: 'Comment not found or user not authorized to edit.' });
        }
    } catch (error) {
        console.error('Error updating comment:', error);
        res.status(500).json({ message: 'Error updating comment' });
    }
});

module.exports = router;
