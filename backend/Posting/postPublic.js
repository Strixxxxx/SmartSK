const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getFileSasUrl } = require('../Storage/storage');
const { decrypt } = require('../utils/crypto');

// GET /api/posts/barangays - Fetch all barangay names
router.get('/barangays', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT barangayName FROM barangays ORDER BY barangayName ASC');
        const barangayNames = result.recordset.map(row => row.barangayName);
        res.status(200).json(barangayNames);
    } catch (error) {
        console.error('Error fetching barangays:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch barangays.' });
    }
});

// GET /api/posts - Fetch All Posts, optionally filtered by barangay
router.get('/', async (req, res) => {
    try {
        const { barangay } = req.query;
        const pool = await getConnection();
        const request = pool.request();

        let query = `
            SELECT 
                p.postID,
                p.title,
                p.description,
                u.fullName AS author,
                b.barangayName,
                pa.attachmentID,
                pa.fileType,
                pa.filePath
            FROM posts p
            JOIN userInfo u ON p.userID = u.userID
            JOIN barangays b ON u.barangay = b.barangayID
            LEFT JOIN postAttachments pa ON p.postID = pa.postID
        `;

        if (barangay) {
            request.input('barangayName', sql.NVarChar, barangay);
            query += ' WHERE b.barangayName = @barangayName';
        }

        query += ' ORDER BY p.postID DESC;';

        const result = await request.query(query);

        const postsMap = {};

        result.recordset.forEach(row => {
            if (!postsMap[row.postID]) {
                postsMap[row.postID] = {
                    postID: row.postID,
                    title: row.title,
                    description: row.description,
                    author: decrypt(row.author),
                    barangayName: row.barangayName,
                    attachments: []
                };
            }
            if (row.attachmentID && row.filePath) {
                postsMap[row.postID].attachments.push({
                    attachmentID: row.attachmentID,
                    fileType: row.fileType,
                    filePath: row.filePath
                });
            }
        });

        const posts = Object.values(postsMap);

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