const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getFileSasUrl } = require('../Storage/storage');
const { decrypt } = require('../utils/crypto');

const getMimeType = (fileName) => {
    if (!fileName) return 'application/octet-stream';
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
        case 'pdf':
            return 'application/pdf';
        case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case 'doc':
            return 'application/msword';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        case 'mp4':
            return 'video/mp4';
        default:
            return 'application/octet-stream';
    }
};

router.get('/:projectId/post/:postId', async (req, res) => {
    const { projectId, postId } = req.params;

    try {
        const pool = await getConnection();

        // 1. Check for public view permission on the post
        const permissionResult = await pool.request()
            .input('postID', sql.Int, postId)
            .query('SELECT opforPubProj FROM viewOption WHERE postID = @postID');

        if (permissionResult.recordset.length === 0 || !permissionResult.recordset[0].opforPubProj) {
            return res.status(403).json({ success: false, message: 'This project is not public.' });
        }

        // 2. If permission is granted, fetch project details
        const result = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query(`
                SELECT 
                    p.projectID, p.reference_number, p.title, p.description, p.file_path, p.file_name,
                    s.StatusName as status,
                    t.postID as relatedPostID,
                    po.title as relatedPostTitle
                FROM projects p
                LEFT JOIN StatusLookup s ON p.status = s.StatusID
                LEFT JOIN tagProjOnPost t ON p.projectID = t.projectID
                LEFT JOIN posts po ON t.postID = po.postID
                WHERE p.projectID = @projectID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const projectData = {
            projectID: result.recordset[0].projectID,
            reference_number: result.recordset[0].reference_number,
            title: decrypt(result.recordset[0].title),
            description: decrypt(result.recordset[0].description),
            status: result.recordset[0].status,
            attachments: [],
            relatedPosts: []
        };

        if (result.recordset[0].file_path) {
            const fileName = result.recordset[0].file_name;
            const fileType = getMimeType(fileName);

            projectData.attachments.push({
                attachmentID: -1, // Placeholder ID
                fileType: fileType,
                filePath: await getFileSasUrl(result.recordset[0].file_path),
                isSecure: false 
            });
        }

        const relatedPostsMap = new Map();
        result.recordset.forEach(row => {
            if (row.relatedPostID && !relatedPostsMap.has(row.relatedPostID)) {
                relatedPostsMap.set(row.relatedPostID, {
                    postID: row.relatedPostID,
                    title: decrypt(row.relatedPostTitle)
                });
            }
        });
        projectData.relatedPosts = Array.from(relatedPostsMap.values());
        
        res.json({ success: true, project: projectData });

    } catch (err) {
        console.error('Error fetching public project details:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch project details.' });
    }
});

module.exports = router;
