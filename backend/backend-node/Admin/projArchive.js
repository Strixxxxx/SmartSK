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
            WHERE pt.cycleID = pb.cycleID
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

// GET all unarchived project cycles
router.get('/cycles', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayID', sql.Int, req.user.barangay)
            .query(`
                SELECT cycleID, targetFiscalYear, termStartYear, termEndYear, createdAt
                FROM projectCycles
                WHERE isArchived = 0 AND barangayID = @barangayID
                ORDER BY createdAt DESC
            `);
            
        const cycles = result.recordset.map(c => ({
            ...c,
            displayName: `Term ${c.termStartYear}-${c.termEndYear} (FY ${c.targetFiscalYear})`
        }));

        res.json({ success: true, cycles });
    } catch (error) {
        console.error('Error fetching unarchived project cycles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch unarchived project cycles.' });
    }
});

// GET all archived project cycles
router.get('/archived-cycles', authMiddleware, async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('barangayID', sql.Int, req.user.barangay)
            .query(`
                SELECT cycleID, targetFiscalYear, termStartYear, termEndYear, createdAt
                FROM projectCycles
                WHERE isArchived = 1 AND barangayID = @barangayID
                ORDER BY createdAt DESC
            `);
            
        const cycles = result.recordset.map(c => ({
            ...c,
            displayName: `Term ${c.termStartYear}-${c.termEndYear} (FY ${c.targetFiscalYear})`
        }));

        res.json({ success: true, cycles });
    } catch (error) {
        console.error('Error fetching archived project cycles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch archived project cycles.' });
    }
});

// POST to archive a project cycle (cascading)
router.post('/cycles/:cycleID', authMiddleware, async (req, res) => {
    const { cycleID } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        
        const cycleCheck = await request
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, req.user.barangay)
            .query('SELECT * FROM projectCycles WHERE cycleID = @cycleID AND barangayID = @barangayID');
            
        if (cycleCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project cycle not found.' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const reqTx = new sql.Request(transaction);
            reqTx.input('cycleID', sql.Int, cycleID);

            await reqTx.query('UPDATE projectCycles SET isArchived = 1 WHERE cycleID = @cycleID');
            await reqTx.query('UPDATE projectBatch SET isArchived = 1 WHERE cycleID = @cycleID');
            
            const updateBatchChildren = `
                DECLARE @batchIDs TABLE (batchID INT);
                INSERT INTO @batchIDs SELECT batchID FROM projectBatch WHERE cycleID = @cycleID;
                
                UPDATE projectABYIP SET isArchived = 1 WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                UPDATE projectCBYDP SET isArchived = 1 WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                UPDATE projectNotifications SET isArchived = 1 WHERE batchID IN (SELECT batchID FROM @batchIDs);
                UPDATE projectCheckpointApprovals SET isArchived = 1 WHERE batchID IN (SELECT batchID FROM @batchIDs);
            `;
            await reqTx.query(updateBatchChildren);
            
            await reqTx.query('UPDATE youth_profile_analytics SET isArchived = 1 WHERE termID = (SELECT termID FROM projectCycles WHERE cycleID = @cycleID)');
            await reqTx.query('UPDATE youth_profiling_submissions SET isArchived = 1 WHERE cycleID = @cycleID');
            await reqTx.query('UPDATE kk_general_assembly_submissions SET isArchived = 1 WHERE cycleID = @cycleID');
            
            const updateSubChildren = `
                DECLARE @ypSubIDs TABLE (subID INT);
                INSERT INTO @ypSubIDs SELECT submissionID FROM youth_profiling_submissions WHERE cycleID = @cycleID;
                UPDATE youth_profiling_proof_attachments SET isArchived = 1 WHERE submissionID IN (SELECT subID FROM @ypSubIDs);
                
                DECLARE @kkSubIDs TABLE (subID INT);
                INSERT INTO @kkSubIDs SELECT submissionID FROM kk_general_assembly_submissions WHERE cycleID = @cycleID;
                UPDATE kk_general_assembly_proof_attachments SET isArchived = 1 WHERE submissionID IN (SELECT subID FROM @kkSubIDs);
            `;
            await reqTx.query(updateSubChildren);

            await transaction.commit();

            const c = cycleCheck.recordset[0];
            const displayName = `Term ${c.termStartYear}-${c.termEndYear} (FY ${c.targetFiscalYear})`;

            addAuditTrail({
                actor: 'A',
                module: 'D',
                userID: req.user.userId,
                actions: 'archive-cycle',
                descriptions: `Admin ${req.user.fullName} archived project cycle: ${displayName}`
            });

            res.json({ success: true, message: 'Project cycle archived successfully.' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (error) {
        console.error(`Error archiving project cycle ${cycleID}:`, error);
        res.status(500).json({ success: false, message: 'Failed to archive project cycle.' });
    }
});

// POST to restore a project cycle (cascading)
router.post('/restore/cycles/:cycleID', authMiddleware, async (req, res) => {
    const { cycleID } = req.params;
    try {
        const pool = await getConnection();
        const request = pool.request();
        
        const cycleCheck = await request
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, req.user.barangay)
            .query('SELECT * FROM projectCycles WHERE cycleID = @cycleID AND barangayID = @barangayID');
            
        if (cycleCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project cycle not found.' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const reqTx = new sql.Request(transaction);
            reqTx.input('cycleID', sql.Int, cycleID);

            await reqTx.query('UPDATE projectCycles SET isArchived = 0 WHERE cycleID = @cycleID');
            await reqTx.query('UPDATE projectBatch SET isArchived = 0 WHERE cycleID = @cycleID');
            
            const updateBatchChildren = `
                DECLARE @batchIDs TABLE (batchID INT);
                INSERT INTO @batchIDs SELECT batchID FROM projectBatch WHERE cycleID = @cycleID;
                
                UPDATE projectABYIP SET isArchived = 0 WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                UPDATE projectCBYDP SET isArchived = 0 WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                UPDATE projectNotifications SET isArchived = 0 WHERE batchID IN (SELECT batchID FROM @batchIDs);
                UPDATE projectCheckpointApprovals SET isArchived = 0 WHERE batchID IN (SELECT batchID FROM @batchIDs);
            `;
            await reqTx.query(updateBatchChildren);
            
            await reqTx.query('UPDATE youth_profile_analytics SET isArchived = 0 WHERE termID = (SELECT termID FROM projectCycles WHERE cycleID = @cycleID)');
            await reqTx.query('UPDATE youth_profiling_submissions SET isArchived = 0 WHERE cycleID = @cycleID');
            await reqTx.query('UPDATE kk_general_assembly_submissions SET isArchived = 0 WHERE cycleID = @cycleID');
            
            const updateSubChildren = `
                DECLARE @ypSubIDs TABLE (subID INT);
                INSERT INTO @ypSubIDs SELECT submissionID FROM youth_profiling_submissions WHERE cycleID = @cycleID;
                UPDATE youth_profiling_proof_attachments SET isArchived = 0 WHERE submissionID IN (SELECT subID FROM @ypSubIDs);
                
                DECLARE @kkSubIDs TABLE (subID INT);
                INSERT INTO @kkSubIDs SELECT submissionID FROM kk_general_assembly_submissions WHERE cycleID = @cycleID;
                UPDATE kk_general_assembly_proof_attachments SET isArchived = 0 WHERE submissionID IN (SELECT subID FROM @kkSubIDs);
            `;
            await reqTx.query(updateSubChildren);

            await transaction.commit();

            const c = cycleCheck.recordset[0];
            const displayName = `Term ${c.termStartYear}-${c.termEndYear} (FY ${c.targetFiscalYear})`;

            addAuditTrail({
                actor: 'A',
                module: 'D',
                userID: req.user.userId,
                actions: 'restore-cycle',
                descriptions: `Admin ${req.user.fullName} restored archived project cycle: ${displayName}`
            });

            res.json({ success: true, message: 'Project cycle restored successfully.' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (error) {
        console.error(`Error restoring project cycle ${cycleID}:`, error);
        res.status(500).json({ success: false, message: 'Failed to restore project cycle.' });
    }
});

module.exports = router;
