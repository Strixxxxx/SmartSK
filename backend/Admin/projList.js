const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const routeGuard = require('../routeGuard/routeGuard');
const path = require('path');
const fs = require('fs');

// This route fetches projects for the admin's barangay.
// It's assumed that the `routeGuard` middleware verifies the user is an admin
// and attaches user information (including their barangay ID) to the request object.
router.get('/projects', routeGuard, async (req, res) => {
    if (!req.user || !req.user.barangay) {
        return res.status(403).json({ success: false, message: 'Unauthorized: User barangay not specified.' });
    }

    const userBarangayId = req.user.barangay;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayId', sql.Int, userBarangayId)
            .query(`
                SELECT
                    p.projectID,
                    p.reference_number,
                    p.userID,
                    u.fullName AS proposerName,
                    p.title,
                    sl.StatusName AS status,
                    p.submittedDate,
                    p.reviewedBy,
                    p.remarks,
                    p.file_name
                FROM 
                    dbo.projects p
                JOIN 
                    dbo.userInfo u ON p.userID = u.userID
                JOIN 
                    dbo.StatusLookup sl ON p.status = sl.StatusID
                WHERE 
                    u.barangay = @barangayId
                ORDER BY
                    p.submittedDate DESC;
            `);

        res.json({ success: true, projects: result.recordset });

    } catch (error) {
        console.error('Error fetching projects for admin:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch projects due to a server error.' });
    }
});

// GET a specific project file for download/viewing
router.get('/projects/file/:projectID', routeGuard, async (req, res) => {
    const { projectID } = req.params;

    if (!projectID) {
        return res.status(400).json({ success: false, message: 'Project ID is required.' });
    }

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectID)
            .query('SELECT file_name FROM projects WHERE projectID = @projectID');

        if (result.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const fileInfo = result.recordset[0];
        const projectsDir = path.join(__dirname, '..', '..', 'projects');
        const filePath = path.join(projectsDir, fileInfo.file_name);

        if (fs.existsSync(filePath)) {
            res.download(filePath, fileInfo.file_name, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    if (!res.headersSent) {
                        res.status(500).send({ success: false, message: 'Could not download the file.' });
                    }
                }
            });
        } else {
            res.status(404).json({ success: false, message: 'File not found on server.' });
        }

    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ success: false, message: 'Server error while retrieving file.' });
    }
});


module.exports = router;