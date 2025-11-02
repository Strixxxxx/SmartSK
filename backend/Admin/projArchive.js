const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { getFileSasUrl } = require('../Storage/storage');
const { authMiddleware } = require('../session/session');
const { decrypt } = require('../utils/crypto');

// GET all archived projects
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
        SELECT 
            p.projectID, 
            p.reference_number, 
            p.title,
            p.description,
            p.status,
            p.submittedDate,
            p.file_path,
            p.file_name,
            p.remarks,
            p.reviewedBy,
            u.fullName as submittedBy,
            s.StatusName as statusName
        FROM projects p
        LEFT JOIN userInfo u ON p.userID = u.userID
        LEFT JOIN StatusLookup s ON p.status = s.StatusID
        WHERE p.isArchived = 1
        ORDER BY p.submittedDate DESC
    `);

    const decryptedData = result.recordset.map(p => ({
        ...p,
        title: decrypt(p.title),
        description: decrypt(p.description),
        remarks: decrypt(p.remarks),
        reviewedBy: decrypt(p.reviewedBy),
        submittedBy: decrypt(p.submittedBy),
    }));

    res.json({ success: true, data: decryptedData });
  } catch (error) {
    console.error('Error fetching archived projects:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch archived projects.' });
  }
});

// POST to archive a project
router.post('/:projectId', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        request.input('projectID', sql.Int, projectId);

        const projectToArchive = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query('SELECT reference_number FROM projects WHERE projectID = @projectID');

        if (projectToArchive.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }
        const { reference_number } = projectToArchive.recordset[0];

        await request.query('UPDATE projects SET isArchived = 1 WHERE projectID = @projectID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'archive-project',
            descriptions: `Admin ${req.user.fullName} archived project: ${reference_number}`
        });

        res.json({ success: true, message: 'Project archived successfully.' });
    } catch (error) {
        console.error(`Error archiving project ${projectId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive project.' });
    }
});

// POST to restore an archived project
router.post('/restore/:projectId', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        request.input('projectID', sql.Int, projectId);

        const projectToRestore = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query('SELECT reference_number FROM projects WHERE projectID = @projectID');

        if (projectToRestore.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Archived project not found.' });
        }
        const { reference_number } = projectToRestore.recordset[0];

        await request.query('UPDATE projects SET isArchived = 0 WHERE projectID = @projectID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'restore-project',
            descriptions: `Admin ${req.user.fullName} restored project: ${reference_number}`
        });

        res.json({ success: true, message: 'Project restored successfully.' });
    } catch (error) {
        console.error(`Error restoring project ${projectId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore project.' });
    }
});

// New route to get a SAS URL for an archived file
router.get('/file-url/:projectID', authMiddleware, async (req, res) => {
    const { projectID } = req.params;

    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('projectID', sql.Int, projectID)
            .query('SELECT file_path FROM projects WHERE projectID = @projectID');

        if (result.recordset.length === 0 || !result.recordset[0].file_path) {
            return res.status(404).json({ success: false, message: 'File not found for this project.' });
        }

        const blobName = result.recordset[0].file_path;
        const sasUrl = await getFileSasUrl(blobName);

        res.json({ success: true, url: sasUrl });

    } catch (error) {
        console.error('Error generating SAS URL for archived file:', error);
        res.status(500).json({ success: false, message: 'Could not generate file URL.' });
    }
});

module.exports = router;