const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getPHTimestamp } = require('../utils/time');
const { decrypt } = require('../utils/crypto'); // Import decrypt

// GET all comments for a specific post
router.get('/posts/:postId/comments', async (req, res) => {
    const { postId } = req.params;
    try {
        const db = await getConnection();
        const result = await db.request()
            .input('PostID', sql.Int, postId)
            .query(`
                SELECT c.commentID, c.parentCommentID, c.commentText, c.isAnonymous, c.alias, c.commentDate as createdAt, u.fullName, c.userID 
                FROM postComment c
                LEFT JOIN userInfo u ON c.userID = u.userID
                WHERE c.PostID = @PostID
                ORDER BY c.commentDate ASC
            `);
        
        // Decrypt fullnames before sending
        const decryptedComments = result.recordset.map(comment => {
            if (comment.fullName) {
                return { ...comment, fullName: decrypt(comment.fullName) };
            }
            return comment;
        });

        res.status(200).json(decryptedComments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Error fetching comments' });
    }
});

// POST a new comment to a post
router.post('/posts/:postId/comments', async (req, res) => {
    const { postId } = req.params;
    const { userID, parentCommentID, commentText, isAnonymous, alias } = req.body;

    if (!commentText) {
        return res.status(400).json({ message: 'Comment text is required.' });
    }

    try {
        const db = await getConnection();
        const timestamp = getPHTimestamp();

        const request = db.request()
            .input('PostID', sql.Int, postId)
            .input('commentText', sql.NVarChar(sql.MAX), commentText)
            .input('isAnonymous', sql.Bit, isAnonymous)
            .input('commentDate', sql.DateTime, timestamp);

        if (isAnonymous) {
            request.input('alias', sql.NVarChar(50), alias || 'Anonymous');
            request.input('userID', sql.Int, null);
        } else {
            if (!userID) {
                return res.status(400).json({ message: 'User ID is required for non-anonymous comments.' });
            }
            request.input('userID', sql.Int, userID);
            request.input('alias', sql.NVarChar(50), null);
        }

        if (parentCommentID) {
            request.input('parentCommentID', sql.Int, parentCommentID);
        } else {
            request.input('parentCommentID', sql.Int, null);
        }

        const result = await request.query(`
            INSERT INTO postComment (PostID, userID, parentCommentID, commentText, isAnonymous, alias, commentDate)
            OUTPUT INSERTED.commentID, INSERTED.commentDate as createdAt, INSERTED.parentCommentID
            VALUES (@PostID, @userID, @parentCommentID, @commentText, @isAnonymous, @alias, @commentDate)
        `);

        res.status(201).json({ 
            message: 'Comment added successfully', 
            comment: result.recordset[0] 
        });

    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: 'Error adding comment' });
    }
});

module.exports = router;
