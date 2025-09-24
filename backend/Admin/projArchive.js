const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const routeGuard = require('../routeGuard/routeGuard');

// Middleware to ensure only admins can access these routes
router.use(authMiddleware, routeGuard.isAdmin);

// POST to archive a project
router.post('/:projectId', async (req, res) => {
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

        await request.execute('prjArchived');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'archive-project',
            oldValue: `reference_number: ${reference_number}`,
            newValue: `projectID: ${projectId}`,
            descriptions: `Admin archived project: ${reference_number}`
        });

        res.json({ success: true, message: 'Project archived successfully.' });
    } catch (error) {
        console.error(`Error archiving project ${projectId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive project.' });
    }
});

// POST to restore an archived project
router.post('/restore/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        request.input('projectID', sql.Int, projectId);

        const projectToRestore = await pool.request()
            .input('projectID', sql.Int, projectId)
            .query('SELECT reference_number FROM projectsARC WHERE projectID = @projectID');

        if (projectToRestore.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Archived project not found.' });
        }
        const { reference_number } = projectToRestore.recordset[0];

        await request.execute('prjReturn');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'restore-project',
            oldValue: `projectID: ${projectId}`,
            newValue: `reference_number: ${reference_number}`,
            descriptions: `Admin restored project: ${reference_number}`
        });

        res.json({ success: true, message: 'Project restored successfully.' });
    } catch (error) {
        console.error(`Error restoring project ${projectId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore project.' });
    }
});

module.exports = router;
