const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { deleteBlob, projectBatchContainerName } = require('../Storage/storage');

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



// DELETE a project cycle (cascading delete)
router.delete('/cycles/:cycleID', authMiddleware, async (req, res) => {
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

        // Get blob names (projName) to delete from Azure Blob Storage before deleting from DB
        const blobsCheck = await request
            .input('cycleID', sql.Int, cycleID)
            .query('SELECT projName FROM projectBatch WHERE cycleID = @cycleID');

        const blobNames = blobsCheck.recordset.map(row => row.projName).filter(name => name);

        // Delete blobs from Azure Storage
        for (const blobName of blobNames) {
            try {
                await deleteBlob(projectBatchContainerName, blobName);
            } catch (blobErr) {
                console.warn(`Failed to delete blob ${blobName} but continuing with database deletion`, blobErr);
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const reqTx = new sql.Request(transaction);
            reqTx.input('cycleID', sql.Int, cycleID);

            const deleteBatchChildren = `
                DECLARE @batchIDs TABLE (batchID INT);
                INSERT INTO @batchIDs SELECT batchID FROM projectBatch WHERE cycleID = @cycleID;
                
                DELETE FROM projectABYIP WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                DELETE FROM projectCBYDP WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                DELETE FROM projectBatch WHERE cycleID = @cycleID;
                DELETE FROM projectCycles WHERE cycleID = @cycleID;
            `;
            await reqTx.query(deleteBatchChildren);

            await transaction.commit();

            const c = cycleCheck.recordset[0];
            const displayName = `Term ${c.termStartYear}-${c.termEndYear} (FY ${c.targetFiscalYear})`;

            addAuditTrail({
                actor: 'A',
                module: 'D',
                userID: req.user.userId,
                actions: 'delete-cycle',
                descriptions: `Admin ${req.user.fullName} deleted project cycle: ${displayName}`
            });

            res.json({ success: true, message: 'Project cycle deleted successfully.' });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (error) {
        console.error(`Error deleting project cycle ${cycleID}:`, error);
        res.status(500).json({ success: false, message: 'Failed to delete project cycle.' });
    }
});



module.exports = router;
