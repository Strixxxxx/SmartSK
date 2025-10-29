const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { getFileSasUrl } = require('../Storage/storage');
const { decrypt } = require('../utils/crypto');

router.get('/statuses', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT StatusName, description FROM StatusLookup ORDER BY StatusID ASC');
        res.json({
            success: true,
            statuses: result.recordset
        });
    } catch (err) {
        console.error('Error fetching statuses:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch statuses' });
    }
});

router.get('/for-tagging', authMiddleware, async (req, res) => {
    try {
        const userID = req.user.userID;
        const pool = await getConnection();
        const result = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT projectID, reference_number, title FROM projects WHERE userID = @userID AND isArchived = 0 ORDER BY submittedDate DESC');
        
        const decryptedProjects = result.recordset.map(p => ({
            ...p,
            title: decrypt(p.title)
        }));

        res.json({
            success: true,
            projects: decryptedProjects
        });
    } catch (err) {
        console.error('Error fetching projects for tagging:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch projects for tagging' });
    }
});

router.get('/details/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, id)
            .query(`
                SELECT 
                    p.projectID, p.reference_number, p.title, p.description, p.file_path, p.file_name,
                    s.StatusName as status
                FROM projects p
                LEFT JOIN StatusLookup s ON p.status = s.StatusID
                WHERE p.projectID = @projectID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const project = result.recordset[0];

        // Decrypt sensitive fields
        const decryptedProject = {
            ...project,
            title: decrypt(project.title),
            description: decrypt(project.description)
        };

        // Get SAS URL for the main project file if it exists
        if (decryptedProject.file_path) {
            decryptedProject.fileUrl = await getFileSasUrl(decryptedProject.file_path);
        }

        res.json({ success: true, project: decryptedProject });
    } catch (err) {
        console.error('Error fetching project details:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch project details.' });
    }
});

module.exports = router;