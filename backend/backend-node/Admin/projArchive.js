const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');

// GET all archived project batches
router.get('/', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
        SELECT 
            pb.batchID,
            pb.projName AS title,
            pb.projType,
            pb.targetYear,
            pb.budget,
            pb.createdAt AS submittedDate,
            b.barangayName,
            sl.StatusName AS statusName,
            ls.statusID AS currentStatusID
        FROM projectBatch pb
        JOIN barangays b ON pb.barangayID = b.barangayID
        CROSS APPLY (
            SELECT TOP 1 pt.statusID
            FROM projectTracker pt
            WHERE pt.batchID = pb.batchID
            ORDER BY pt.updatedAt DESC
        ) ls
        JOIN StatusLookup sl ON ls.statusID = sl.StatusID
        WHERE pb.isArchived = 1
        ORDER BY pb.createdAt DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching archived project batches:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch archived project batches.' });
  }
});

// GET all project status checkpoints
router.get('/statuses', authMiddleware, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
        SELECT StatusID, StatusName, description
        FROM StatusLookup
        ORDER BY StatusID
    `);
    res.json({ success: true, statuses: result.recordset });
  } catch (error) {
    console.error('Error fetching project statuses:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project statuses.' });
  }
});

// POST to archive a project batch
router.post('/batch/:batchID', authMiddleware, async (req, res) => {
    const { batchID } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        request.input('batchID', sql.Int, batchID);

        const batchToArchive = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName FROM projectBatch WHERE batchID = @batchID');

        if (batchToArchive.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }
        const { projName } = batchToArchive.recordset[0];

        await request.query('UPDATE projectBatch SET isArchived = 1 WHERE batchID = @batchID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'archive-batch',
            descriptions: `Admin ${req.user.fullName} archived project batch: ${projName}`
        });

        res.json({ success: true, message: 'Project batch archived successfully.' });
    } catch (error) {
        console.error(`Error archiving project batch ${batchID}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive project batch.' });
    }
});

// POST to restore an archived project batch
router.post('/restore/batch/:batchID', authMiddleware, async (req, res) => {
    const { batchID } = req.params;
    try {
        const pool = await getConnection();
        const batchToRestore = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName FROM projectBatch WHERE batchID = @batchID');

        if (batchToRestore.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Archived project batch not found.' });
        }
        const { projName } = batchToRestore.recordset[0];

        await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('UPDATE projectBatch SET isArchived = 0 WHERE batchID = @batchID');

        addAuditTrail({
            actor: 'A',
            module: 'D',
            userID: req.user.userId,
            actions: 'restore-batch',
            descriptions: `Admin ${req.user.fullName} restored archived project batch: ${projName}`
        });

        res.json({ success: true, message: 'Project batch restored successfully.' });
    } catch (error) {
        console.error(`Error restoring project batch ${batchID}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore project batch.' });
    }
});

module.exports = router;
