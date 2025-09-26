const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { getFileSasUrl } = require('../Storage/storage');

// This route fetches projects for the admin's barangay.
router.get('/projects', async (req, res) => {
    if (!req.user || req.user.barangay === undefined || req.user.barangay === null) {
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
                    p.reference_number AS referenceNumber,
                    u.fullName AS proposerName,
                    p.title,
                    sl.StatusName AS status,
                    p.submittedDate,
                    p.reviewedBy,
                    p.remarks,
                    p.file_name AS fileName
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

// New route to get a SAS URL for a file
router.get('/projects/file-url/:projectID', async (req, res) => {
    const { projectID } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectID)
            .query('SELECT file_name FROM projects WHERE projectID = @projectID');

        if (result.recordset.length === 0 || !result.recordset[0].file_name) {
            return res.status(404).json({ success: false, message: 'File not found for this project.' });
        }

        const blobName = result.recordset[0].file_name;
        const sasUrl = await getFileSasUrl(blobName);

        res.json({ success: true, url: sasUrl });

    } catch (error) {
        console.error('Error generating SAS URL:', error);
        res.status(500).json({ success: false, message: 'Could not generate file URL.' });
    }
});

module.exports = router;
