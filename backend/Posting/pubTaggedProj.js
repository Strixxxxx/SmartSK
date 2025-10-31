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

router.get('/:projectId', async (req, res) => {
    const { projectId } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query(`
                SELECT 
                    p.projectID, p.reference_number, p.title, p.description, p.file_path, p.file_name,
                    s.StatusName as status,
                    u.fullName as authorName
                FROM projects p
                LEFT JOIN StatusLookup s ON p.status = s.StatusID
                LEFT JOIN userInfo u ON p.userID = u.userID
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
            author: decrypt(result.recordset[0].authorName),
            status: result.recordset[0].status,
            attachments: []
        };

        if (result.recordset[0].file_path) {
            const filePath = result.recordset[0].file_path;
            const fileName = result.recordset[0].file_name;
            const fileType = getMimeType(fileName);

            projectData.attachments.push({
                attachmentID: -1, // Placeholder ID
                fileType: fileType,
                filePath: await getFileSasUrl(filePath, fileType, true, 'project')
            });
        }

        res.json({ success: true, project: projectData });

    } catch (err) {
        console.error('Error fetching public project details:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch project details.' });
    }
});

router.get('/:projectId/related-posts', async (req, res) => {
    const { projectId } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query(`
                SELECT po.postID, po.title
                FROM tagProjOnPost t
                JOIN posts po ON t.postID = po.postID
                LEFT JOIN viewOption vo ON po.postID = vo.postID
                WHERE t.projectID = @projectID AND (vo.opforPubProj = 1 OR vo.postVOID IS NULL)
            `);

        const decryptedPosts = result.recordset.map(p => ({
            postID: p.postID,
            title: p.title
        }));

        res.json({ success: true, relatedPosts: decryptedPosts });
    } catch (err) {
        console.error('Error fetching public related posts:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch public related posts.' });
    }
});

module.exports = router;
