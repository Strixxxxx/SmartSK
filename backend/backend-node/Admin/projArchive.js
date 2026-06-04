const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { addAuditTrail } = require('../audit/auditService');
const { authMiddleware } = require('../session/session');
const { deleteBlob, projectBatchContainerName, docContainerName } = require('../Storage/storage');

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
        const blobsCheck = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .query('SELECT projName FROM projectBatch WHERE cycleID = @cycleID');

        const blobNames = blobsCheck.recordset.map(row => row.projName).filter(name => name);

        // Get sk_session_photos blob names before deleting from DB
        const sessionPhotosCheck = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .query(`
                SELECT sp.blobName 
                FROM sk_session_photos sp
                JOIN projectBatch pb ON sp.batchID = pb.batchID
                WHERE pb.cycleID = @cycleID AND sp.blobName IS NOT NULL
            `);
        const sessionPhotoBlobNames = sessionPhotosCheck.recordset.map(row => row.blobName).filter(name => name);

        // Fetch blobs for youth profiling
        const ypBlobsCheck = await pool.request().input('cycleID', sql.Int, cycleID).query(`
            SELECT noticeLetterBlobName, masterDatasetBlobName, submissionID 
            FROM youth_profiling_submissions WHERE cycleID = @cycleID
        `);
        
        let blobsToDeleteDocContainer = [];
        if (ypBlobsCheck.recordset.length > 0) {
            const sub = ypBlobsCheck.recordset[0];
            if (sub.noticeLetterBlobName) blobsToDeleteDocContainer.push(sub.noticeLetterBlobName);
            if (sub.masterDatasetBlobName) blobsToDeleteDocContainer.push(sub.masterDatasetBlobName);
            
            const ypProofs = await pool.request().input('submissionID', sql.Int, sub.submissionID).query(`
                SELECT imageBlobName FROM youth_profiling_proof_attachments WHERE submissionID = @submissionID
            `);
            ypProofs.recordset.forEach(row => { if (row.imageBlobName) blobsToDeleteDocContainer.push(row.imageBlobName) });
        }

        // Fetch blobs for KK General Assembly
        const kkBlobsCheck = await pool.request().input('cycleID', sql.Int, cycleID).query(`
            SELECT attendanceSheetBlobName, kkMinutesBlobName, submissionID 
            FROM kk_general_assembly_submissions WHERE cycleID = @cycleID
        `);
        if (kkBlobsCheck.recordset.length > 0) {
            const sub = kkBlobsCheck.recordset[0];
            if (sub.attendanceSheetBlobName) blobsToDeleteDocContainer.push(sub.attendanceSheetBlobName);
            if (sub.kkMinutesBlobName) blobsToDeleteDocContainer.push(sub.kkMinutesBlobName);
            
            const kkProofs = await pool.request().input('submissionID', sql.Int, sub.submissionID).query(`
                SELECT imageBlobName FROM kk_general_assembly_proof_attachments WHERE submissionID = @submissionID
            `);
            kkProofs.recordset.forEach(row => { if (row.imageBlobName) blobsToDeleteDocContainer.push(row.imageBlobName) });
        }

        // Fetch blobs for SK Resolution
        const skResBlobsCheck = await pool.request().input('cycleID', sql.Int, cycleID).query(`
            SELECT blobName FROM sk_resolution_proponent WHERE cycleID = @cycleID
        `);
        skResBlobsCheck.recordset.forEach(row => { if (row.blobName) blobsToDeleteDocContainer.push(row.blobName) });

        // Delete blobs from project batch container
        for (const blobName of blobNames) {
            try {
                await deleteBlob(projectBatchContainerName, blobName);
            } catch (blobErr) {
                console.warn(`Failed to delete blob ${blobName} from projectBatchContainerName`, blobErr);
            }
        }

        // Delete sk_session_photos blobs from project batch container
        for (const blobName of sessionPhotoBlobNames) {
            try {
                await deleteBlob(projectBatchContainerName, blobName);
            } catch (blobErr) {
                console.warn(`Failed to delete session photo blob ${blobName} from projectBatchContainerName`, blobErr);
            }
        }
        
        // Delete blobs from documents container
        for (const blobName of blobsToDeleteDocContainer) {
            try {
                await deleteBlob(docContainerName, blobName);
            } catch (blobErr) {
                console.warn(`Failed to delete blob ${blobName} from docContainerName`, blobErr);
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
                
                -- 1. Delete non-cascading dependencies of project batches
                DELETE FROM projectAgenda WHERE batchID IN (SELECT batchID FROM @batchIDs);
                DELETE FROM projectABYIP WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                DELETE FROM projectCBYDP WHERE projbatchID IN (SELECT batchID FROM @batchIDs);
                DELETE FROM sk_session_photos WHERE batchID IN (SELECT batchID FROM @batchIDs);
                DELETE FROM userNotificationReads WHERE notifID IN (SELECT notificationID FROM projectNotifications WHERE batchID IN (SELECT batchID FROM @batchIDs) OR cycleID = @cycleID);
                DELETE FROM projectBatch WHERE cycleID = @cycleID;
                
                -- 2. Delete dependencies of general assembly submissions
                DELETE FROM kk_general_assembly_proof_attachments 
                WHERE submissionID IN (SELECT submissionID FROM kk_general_assembly_submissions WHERE cycleID = @cycleID);
                
                -- 3. Delete general assembly and youth profiling submissions tied to the cycle
                DELETE FROM kk_general_assembly_submissions WHERE cycleID = @cycleID;
                DELETE FROM youth_profiling_submissions WHERE cycleID = @cycleID;
                
                -- 4. Delete SK Resolution proponent tied to the cycle
                DELETE FROM sk_resolution_proponent WHERE cycleID = @cycleID;
                
                -- 5. Finally, delete the parent cycle
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
