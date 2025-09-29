const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getFileSasUrl } = require('../Storage/storage');

// GET /api/posts - Fetch All Posts
router.get('/', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT 
                p.postID,
                p.title,
                p.description,
                u.fullName AS author,
                pa.attachmentID,
                pa.fileType,
                pa.filePath
            FROM posts p
            JOIN userInfo u ON p.userID = u.userID
            LEFT JOIN postAttachments pa ON p.postID = pa.postID
            ORDER BY p.postID DESC;
        `);

        const postsMap = {};

        result.recordset.forEach(row => {
            if (!postsMap[row.postID]) {
                postsMap[row.postID] = {
                    postID: row.postID,
                    title: row.title,
                    description: row.description,
                    author: row.author,
                    attachments: []
                };
            }
            if (row.attachmentID && row.filePath) {
                postsMap[row.postID].attachments.push({
                    attachmentID: row.attachmentID,
                    fileType: row.fileType,
                    filePath: row.filePath // Keep blob name for now
                });
            }
        });

        const posts = Object.values(postsMap);

        // Generate SAS URLs for all attachments in parallel
        for (const post of posts) {
            post.attachments = await Promise.all(post.attachments.map(async (attachment) => {
                const sasUrl = await getFileSasUrl(attachment.filePath, attachment.fileType);
                return {
                    ...attachment,
                    filePath: sasUrl
                };
            }));
        }

        res.status(200).json(posts);

    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch posts.', error: error.message });
    }
});

module.exports = router;