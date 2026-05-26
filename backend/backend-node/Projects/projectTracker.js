const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { authMiddleware } = require('../session/session');
const { hasAccessControl } = require('../routeGuard/routeGuard');
const { broadcast, broadcastToRoom } = require('../websockets/websocket');
const { decrypt } = require('../utils/crypto');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { uploadBlob, listBlobsWithProperties, generateSasUrl, docContainerName, deleteBlob } = require('../Storage/storage');
const { sendProjectReviewVerdictEmail, sendBcptOverrideEmail, sendExecutionCompleteEmailToBCPT, sendMeetingScheduledEmail, sendMeetingRescheduledEmail } = require('../Email/email');
const templateService = require('../utils/templateService');

/**
 * Custom Checkpoint-based Project Tracker Router
 * Mounted at /api/project-tracker
 */

// helper to check if a user is BCPT
function isBCPT(req) {
    return req.user && (req.user.position === 'BCPT' || req.user.positionName === 'BCPT');
}

// helper to check if a user is SKC
function isSKC(req) {
    return req.user && (req.user.position === 'SKC' || req.user.positionName === 'SKC');
}

// ── Annual Project Cycle Initializer ─────────────────────────────────────────
// Placed here (before all /:id parameterized routes) to prevent Express
// path-matching collisions per deployment safety rules.

// POST /api/project-tracker/initialize-cycle
// Initializes a new annual project cycle for the authenticated SKC user.
// Guards: role check → term duration math → fiscal boundary math → DB uniqueness.
router.post('/initialize-cycle', authMiddleware, async (req, res) => {
    try {
        const { termStartYear, termEndYear, targetFiscalYear } = req.body;
        const { userID, barangay: barangayID, termID } = req.user;

        // Guard 1: Required fields
        if (termStartYear === undefined || termEndYear === undefined || targetFiscalYear === undefined) {
            return res.status(400).json({ success: false, message: 'termStartYear, termEndYear, and targetFiscalYear are required.' });
        }

        const tStart = parseInt(termStartYear, 10);
        const tEnd = parseInt(termEndYear, 10);
        const tFiscal = parseInt(targetFiscalYear, 10);

        if (isNaN(tStart) || isNaN(tEnd) || isNaN(tFiscal)) {
            return res.status(400).json({ success: false, message: 'All year values must be valid 4-digit integers.' });
        }

        // Guard 2: Role check — SKC only
        if (!isSKC(req)) {
            return res.status(403).json({ success: false, message: 'Only the SK Chairperson can initialize a project cycle.' });
        }

        // Guard 3: Term duration (must span exactly 3 years)
        if (tEnd - tStart !== 2) {
            return res.status(400).json({
                success: false,
                message: `The SK term must span exactly 3 years (termEndYear - termStartYear = 2). Received difference: ${tEnd - tStart}.`
            });
        }

        // Guard 4: Fiscal year must fall within term bounds
        if (tFiscal < tStart || tFiscal > tEnd) {
            return res.status(400).json({
                success: false,
                message: `The target fiscal year must fall within the term range (${tStart}–${tEnd}). Received: ${tFiscal}.`
            });
        }

        // Guard 5: DB uniqueness & active cycle check
        const pool = await getConnection();
        
        // Check for active cycle
        const activeCycleCheck = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT cycleID, targetFiscalYear FROM projectCycles
                WHERE barangayID = @barangayID
                  AND currentStatusID < 14
                  AND isArchived = 0
            `);

        if (activeCycleCheck.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: `An active project cycle (Fiscal Year: ${activeCycleCheck.recordset[0].targetFiscalYear}) is currently in progress. You must reach Checkpoint 14 (Project Closure) before initializing a new cycle.`
            });
        }

        // Check for duplicate fiscal year in the same term
        const existingCheck = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .input('termID', sql.Int, termID)
            .input('targetFiscalYear', sql.Int, tFiscal)
            .query(`
                SELECT cycleID FROM projectCycles
                WHERE barangayID = @barangayID
                  AND termID = @termID
                  AND targetFiscalYear = @targetFiscalYear
                  AND isArchived = 0
            `);

        if (existingCheck.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: `A project cycle for fiscal year ${tFiscal} already exists for this barangay and term.`
            });
        }

        // Insert the new cycle record — statusID 1 = 'Youth Profiling' (StatusLookup)
        const insertRes = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .input('termID', sql.Int, termID)
            .input('termStartYear', sql.Int, tStart)
            .input('termEndYear', sql.Int, tEnd)
            .input('targetFiscalYear', sql.Int, tFiscal)
            .input('createdBy', sql.Int, userID)
            .query(`
                INSERT INTO projectCycles
                    (barangayID, termID, termStartYear, termEndYear, targetFiscalYear, currentStatusID, createdBy)
                OUTPUT
                    INSERTED.cycleID,
                    INSERTED.barangayID,
                    INSERTED.termID,
                    INSERTED.termStartYear,
                    INSERTED.termEndYear,
                    INSERTED.targetFiscalYear,
                    INSERTED.currentStatusID
                VALUES
                    (@barangayID, @termID, @termStartYear, @termEndYear, @targetFiscalYear, 1, @createdBy)
            `);

        const newCycle = insertRes.recordset[0];

        // Insert initial state (statusID 1) into projectTracker
        await pool.request()
            .input('cycleID', sql.Int, newCycle.cycleID)
            .input('statusID', sql.Int, 1)
            .input('updatedBy', sql.Int, userID)
            .query(`INSERT INTO projectTracker (cycleID, statusID, updatedBy) VALUES (@cycleID, @statusID, @updatedBy)`);

        // Auto-create CBYDP and ABYIP batches
        const abbr = templateService.getBarangayAbbr(barangayID);
        
        const cbydpFileName = `CBYDP_${abbr}_${tStart}-${tEnd}_Rev${tFiscal}_V1.0.xlsx`;
        await templateService.initializeNewProject({
            barangayID,
            userID,
            cycleID: newCycle.cycleID,
            projType: 'CBYDP',
            targetYear: `${tStart}-${tEnd}`,
            fileName: cbydpFileName
        });

        const abyipFileName = `ABYIP_${abbr}_${tFiscal}_V1.0.xlsx`;
        await templateService.initializeNewProject({
            barangayID,
            userID,
            cycleID: newCycle.cycleID,
            projType: 'ABYIP',
            targetYear: `${tFiscal}`,
            fileName: abyipFileName
        });

        res.status(201).json({
            success: true,
            message: `Project cycle for fiscal year ${tFiscal} initialized successfully.`,
            cycle: newCycle
        });

    } catch (err) {
        console.error('[projectTracker] POST /initialize-cycle error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to initialize project cycle. Please try again.' });
    }
});

// GET /api/project-tracker/active-cycle
// Returns the most recent active Checkpoint 1 cycle for the authenticated user's
// barangay + term. Used as a fallback when /projects is loaded without navigation state.
router.get('/active-cycle', authMiddleware, async (req, res) => {
    try {
        const { barangay: barangayID, termID } = req.user;

        const pool = await getConnection();

        const result = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .input('termID', sql.Int, termID)
            .query(`
                SELECT TOP 1
                    cycleID, barangayID, termID, termStartYear, termEndYear,
                    targetFiscalYear, currentStatusID, createdBy, createdAt, updatedAt
                FROM projectCycles
                WHERE barangayID = @barangayID
                  AND termID = @termID
                  AND currentStatusID < 14
                  AND isArchived = 0
                ORDER BY createdAt DESC
            `);

        if (!result.recordset.length) {
            return res.json({ success: true, data: null });
        }

        res.json({ success: true, data: result.recordset[0] });

    } catch (err) {
        console.error('[projectTracker] GET /active-cycle error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch active cycle.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

// GET /cycles — Fetch project cycles and aggregate their batches
router.get('/cycles', authMiddleware, async (req, res) => {
    try {
        const { barangay: barangayID } = req.user;
        const pool = await getConnection();

        const cycleRes = await pool.request()
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT *
                FROM projectCycles
                WHERE barangayID = @barangayID
                  AND isArchived = 0
                ORDER BY targetFiscalYear DESC
            `);

        const cycles = cycleRes.recordset;

        if (!cycles.length) {
            return res.json({ success: true, data: [] });
        }

        for (let i = 0; i < cycles.length; i++) {
            const batchRes = await pool.request()
                .input('cycleID', sql.Int, cycles[i].cycleID)
                .query(`
                    SELECT batchID, projType, projName, targetYear, meetingDate, budget
                    FROM projectBatch
                    WHERE cycleID = @cycleID
                `);
            cycles[i].batches = batchRes.recordset;
        }

        res.json({ success: true, data: cycles });
    } catch (err) {
        console.error('[projectTracker] GET /cycles error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch project cycles.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

// 1. GET /status/:batchID — Fetch project checkpoint detailed status
router.get('/status/:batchID', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.params;
        const pool = await getConnection();

        // Fetch batch details
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT batchID, cycleID, barangayID, projType, projName, targetYear, budget, termID, meetingDate FROM projectBatch WHERE batchID = @batchID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const batch = batchRes.recordset[0];

        // Fetch latest status using cycleID
        const statusRes = await pool.request()
            .input('cycleID', sql.Int, batch.cycleID)
            .query(`
                SELECT TOP 1 statusID 
                FROM projectTracker 
                WHERE cycleID = @cycleID 
                ORDER BY updatedAt DESC
            `);

        const currentStatusID = statusRes.recordset.length ? statusRes.recordset[0].statusID : 2;

        // Fetch active term members (excluding Admin and BCPT positions)
        // Admin roleID = 1, BCPT role is named 'BCPT'
        let termMembers = [];
        let activeTermID = batch.termID;
        if (!activeTermID) {
            const activeTermRes = await pool.request()
                .input('barangayID', sql.Int, batch.barangayID)
                .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');
            if (activeTermRes.recordset.length) {
                activeTermID = activeTermRes.recordset[0].termID;
            }
        }

        if (activeTermID) {
            const usersRes = await pool.request()
                .input('termID', sql.Int, activeTermID)
                .query(`
                    SELECT u.userID, u.fullName, r.roleName 
                    FROM userInfo u
                    JOIN roles r ON u.position = r.roleID
                    WHERE u.termID = @termID AND u.isArchived = 0 AND r.roleName NOT IN ('Admin', 'BCPT')
                `);

            termMembers = usersRes.recordset.map(u => ({
                userID: u.userID,
                fullName: decrypt(u.fullName) || 'Unknown',
                position: u.roleName
            }));
        }

        // Fetch attendance approvals
        const approvalsRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT userID, attended, comments FROM projectCheckpointApprovals WHERE batchID = @batchID');

        const approvalsMap = {};
        const commentsMap = {};
        approvalsRes.recordset.forEach(a => {
            approvalsMap[a.userID] = a.attended;
            commentsMap[a.userID] = a.comments || '';
        });

        // Combine term members with their attendance and comments
        const attendees = termMembers.map(m => ({
            ...m,
            attended: approvalsMap[m.userID] === true,
            comments: commentsMap[m.userID] || ''
        }));

        // Fetch PPAs if Step 11 (Project Execution) or 12 (Closure)
        let ppas = [];
        if ([11, 12, 13, 14].includes(currentStatusID)) {
            if (batch.projType === 'ABYIP') {
                const ppasRes = await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .query('SELECT abyipID as rowID, PPA, [Description], expectedResult, total, isExecuted, centerOfParticipation, period FROM projectABYIP WHERE projbatchID = @batchID ORDER BY abyipID ASC');
                ppas = ppasRes.recordset;
            } else {
                const ppasRes = await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .query('SELECT cbydpID as rowID, YDC, objective, PPAs, budget, isExecuted, centerOfParticipation FROM projectCBYDP WHERE projbatchID = @batchID ORDER BY cbydpID ASC');
                ppas = ppasRes.recordset;
            }
        }

        // Fetch LYDP presence if at Checkpoint 2
        let hasLYDP = false;
        if (currentStatusID === 2 && batch.projType === 'CBYDP') {
            try {
                const category = 'LYDP';
                // Primary check: new brgyID/cycleID structure
                const newPrefix = `${batch.projType}/${category}/${batch.barangayID}/${batch.cycleID}/`;
                let blobs = await listBlobsWithProperties(docContainerName, { prefix: newPrefix });
                
                // Legacy check
                if (blobs.length === 0) {
                    const prefix1 = `${batch.projType}/${category}/${batch.projName}/`;
                    blobs = await listBlobsWithProperties(docContainerName, { prefix: prefix1 });
                    
                    if (blobs.length === 0 && batch.projName.includes('.')) {
                        const altPrefix2 = `${batch.projType}/${category}/${batch.projName.split('.').slice(0, -1).join('.')}/`;
                        blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix2 });
                    }
                }
                
                const validBlobs = blobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);
                if (validBlobs.length > 0) {
                    hasLYDP = true;
                }
            } catch (err) {
                console.error('[projectTracker] Error checking LYDP:', err.message);
            }
        }
        
        // Fetch ABYIP Documents presence if at Checkpoint 5
        let hasABYIPDocs = false;
        if (currentStatusID === 5) {
            try {
                const estIncomePrefix = `ABYIP/EstIncomeCert/${batch.barangayID}/${batch.cycleID}/`;
                const incomePrefix = `ABYIP/IncomeCert/${batch.barangayID}/${batch.cycleID}/`;
                
                const estBlobs = await listBlobsWithProperties(docContainerName, { prefix: estIncomePrefix });
                const validEstBlobs = estBlobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);
                
                const incomeBlobs = await listBlobsWithProperties(docContainerName, { prefix: incomePrefix });
                const validIncomeBlobs = incomeBlobs.filter(b => !b.name.endsWith('/') && b.properties?.contentLength > 0);
                
                if (validEstBlobs.length > 0 && validIncomeBlobs.length > 0) {
                    hasABYIPDocs = true;
                }
            } catch (err) {
                console.error('[projectTracker] Error checking ABYIP Docs:', err.message);
            }
        }

        res.json({
            success: true,
            data: {
                batch,
                currentStatusID,
                attendees,
                ppas,
                hasLYDP,
                hasABYIPDocs
            }
        });
    } catch (err) {
        console.error('[projectTracker] GET /status error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch status details.' });
    }
});

// 2. POST /schedule-meeting — Schedule the finalization meeting (Checkpoint 2 -> 3)
router.post('/schedule-meeting', authMiddleware, async (req, res) => {
    try {
        const { batchID, meetingDate } = req.body;
        const { userID, barangay: barangayID } = req.user;

        if (!batchID || !meetingDate) {
            return res.status(400).json({ success: false, message: 'Batch ID and meeting date are required.' });
        }

        // Backend Validation: Cannot schedule for today or in the past
        const requestedDate = new Date(meetingDate);
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); // Start of today

        // Create a copy of requestedDate with hours zeroed out for date comparison
        const requestedDateOnly = new Date(requestedDate);
        requestedDateOnly.setHours(0, 0, 0, 0);

        if (requestedDateOnly.getTime() <= currentDate.getTime()) {
            return res.status(400).json({ success: false, message: 'The SK Session cannot be scheduled for today or in the past. Please select tomorrow or a future date.' });
        }

        const pool = await getConnection();

        // Verify batch exists and fetch currentStatusID
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT b.projName, b.termID, c.currentStatusID 
                FROM projectBatch b 
                JOIN projectCycles c ON b.cycleID = c.cycleID 
                WHERE b.batchID = @batchID AND b.barangayID = @barangayID
            `);

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const batch = batchRes.recordset[0];
        const currentStatusID = batch.currentStatusID;
        const nextStatusID = currentStatusID === 5 ? 6 : 3;

        // Ensure user has trackerControl or is SKC
        const userRoleRes = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT r.roleName, a.trackerControl FROM userInfo u JOIN roles r ON u.position = r.roleID LEFT JOIN accessControl a ON u.userID = a.userID WHERE u.userID = @userID');

        const role = userRoleRes.recordset[0];
        const hasControl = role && (role.roleName === 'SKC' || role.trackerControl === true);

        if (!hasControl) {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only the SK Chairperson or users with tracker control can schedule meetings.' });
        }

        // Update meetingDate and insert next status
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('meetingDate', sql.DateTime, new Date(meetingDate))
            .query('UPDATE projectBatch SET meetingDate = @meetingDate WHERE batchID = @batchID');

        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, nextStatusID)
            .input('userID', sql.Int, userID)
            .query('INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @userID FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);');

        // Format meeting date for readable notification
        const formattedDate = new Date(meetingDate).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

        // Insert notification
        const notifMsg = `A finalization meeting for project plan "${batch.projName}" has been scheduled on ${formattedDate}. Please make sure to attend and check your calendar.`;
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .input('message', sql.NVarChar(sql.MAX), notifMsg)
            .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, \'MEETING_SCHEDULED\', @message)');

        // Broadcast notifications & socket updates
        broadcast({ type: 'new_notification', barangayID });
        broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: nextStatusID, meetingDate });
        
        // Send email notification
        await sendMeetingScheduledEmail(barangayID, batch.projName, formattedDate);

        res.json({ success: true, message: `Meeting scheduled and project advanced to Checkpoint ${nextStatusID}.` });
    } catch (err) {
        console.error('[projectTracker] POST /schedule-meeting error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to schedule meeting.' });
    }
});

// 2.5 POST /reschedule-meeting — Reschedule the finalization meeting
router.post('/reschedule-meeting', authMiddleware, async (req, res) => {
    try {
        const { batchID, meetingDate, reason } = req.body;
        const { userID, barangay: barangayID } = req.user;

        if (!batchID || !meetingDate || !reason) {
            return res.status(400).json({ success: false, message: 'Batch ID, meeting date, and reason are required.' });
        }

        // Backend Validation: Must not be in the past
        const requestedDate = new Date(meetingDate);
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0); // Start of today

        // Calculate difference in days
        const diffTime = requestedDate.getTime() - currentDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays <= 0) {
            return res.status(400).json({ success: false, message: 'The meeting must be scheduled for a future date (tomorrow onwards).' });
        }

        const pool = await getConnection();

        // Verify batch exists
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT projName, termID FROM projectBatch WHERE batchID = @batchID AND barangayID = @barangayID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const batch = batchRes.recordset[0];

        // Ensure user has trackerControl or is SKC
        const userRoleRes = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT r.roleName, a.trackerControl FROM userInfo u JOIN roles r ON u.position = r.roleID LEFT JOIN accessControl a ON u.userID = a.userID WHERE u.userID = @userID');

        const role = userRoleRes.recordset[0];
        const hasControl = role && (role.roleName === 'SKC' || role.trackerControl === true);

        if (!hasControl) {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only the SK Chairperson or users with tracker control can reschedule meetings.' });
        }

        // Update meetingDate
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('meetingDate', sql.DateTime, new Date(meetingDate))
            .query('UPDATE projectBatch SET meetingDate = @meetingDate WHERE batchID = @batchID');

        // Format meeting date for readable notification
        const formattedDate = new Date(meetingDate).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

        // Insert notification
        const notifMsg = `The finalization meeting for project plan "${batch.projName}" has been rescheduled to ${formattedDate}. Reason: ${reason}`;
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .input('message', sql.NVarChar(sql.MAX), notifMsg)
            .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, \'MEETING_RESCHEDULED\', @message)');

        // Broadcast notifications & socket updates
        broadcast({ type: 'new_notification', barangayID });
        broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: 3, meetingDate });
        
        // Send email notification
        await sendMeetingRescheduledEmail(barangayID, batch.projName, formattedDate, reason);

        res.json({ success: true, message: 'Meeting rescheduled successfully.' });
    } catch (err) {
        console.error('[projectTracker] POST /reschedule-meeting error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to reschedule meeting.' });
    }
});

// 3. POST /submit-attendance — Save attendance and check automatic progression to Checkpoint 4
router.post('/submit-attendance', authMiddleware, async (req, res) => {
    try {
        const { batchID, attendance } = req.body; // attendance: Array of { userID, attended: boolean }
        const { userID, barangay: barangayID } = req.user;

        if (!batchID || !Array.isArray(attendance)) {
            return res.status(400).json({ success: false, message: 'Batch ID and attendance list are required.' });
        }

        const pool = await getConnection();

        // Verify batch exists
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT batchID, barangayID, projName, termID FROM projectBatch WHERE batchID = @batchID AND barangayID = @barangayID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const batch = batchRes.recordset[0];

        // Ensure user is authorized
        const userRoleRes = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT r.roleName, a.trackerControl FROM userInfo u JOIN roles r ON u.position = r.roleID LEFT JOIN accessControl a ON u.userID = a.userID WHERE u.userID = @userID');

        const role = userRoleRes.recordset[0];
        const hasControl = role && (role.roleName === 'SKC' || role.trackerControl === true);

        if (!hasControl) {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only the SK Chairperson or users with tracker control can submit attendance.' });
        }

        // Save attendance approvals in transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Delete existing checkpoint approvals
            await transaction.request()
                .input('batchID', sql.Int, batchID)
                .query('DELETE FROM projectCheckpointApprovals WHERE batchID = @batchID');

            // Insert new ones
            for (const att of attendance) {
                await transaction.request()
                    .input('batchID', sql.Int, batchID)
                    .input('userID', sql.Int, att.userID)
                    .input('attended', sql.Bit, att.attended ? 1 : 0)
                    .query('INSERT INTO projectCheckpointApprovals (batchID, userID, attended) VALUES (@batchID, @userID, @attended)');
            }

            await transaction.commit();
        } catch (trxErr) {
            await transaction.rollback();
            throw trxErr;
        }

        // Check if all active term members are present
        let activeTermID = batch.termID;
        if (!activeTermID) {
            const activeTermRes = await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');
            if (activeTermRes.recordset.length) {
                activeTermID = activeTermRes.recordset[0].termID;
            }
        }

        let totalActiveTermMembers = 0;
        if (activeTermID) {
            const membersCountRes = await pool.request()
                .input('termID', sql.Int, activeTermID)
                .query(`
                    SELECT COUNT(*) as count 
                    FROM userInfo u
                    JOIN roles r ON u.position = r.roleID
                    WHERE u.termID = @termID AND u.isArchived = 0 AND r.roleName NOT IN ('Admin', 'BCPT')
                `);
            totalActiveTermMembers = membersCountRes.recordset[0].count;
        }

        const presentAttendees = attendance.filter(a => a.attended === true).length;
        let advanced = false;

        if (totalActiveTermMembers > 0 && presentAttendees >= totalActiveTermMembers) {
            // Everyone attended! Automatically advance to Checkpoint 4 (Brgy. Captain's Approval)
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('statusID', sql.Int, 4)
                .input('userID', sql.Int, userID)
                .query('INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @userID FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);');

            // Create notification
            const notifMsg = `All SK Council members have approved the project plan "${batch.projName}". It has automatically progressed to Checkpoint 4: Brgy. Captain's Approval.`;
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('barangayID', sql.Int, barangayID)
                .input('message', sql.NVarChar(sql.MAX), notifMsg)
                .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, \'INTERNAL_FINALIZED\', @message)');

            broadcast({ type: 'new_notification', barangayID });
            broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: 4 });
            advanced = true;
        } else {
            // Broadcast standard refresh
            broadcastToRoom(batchID, { type: 'attendance_updated', presentAttendees, totalActiveTermMembers });
        }

        res.json({
            success: true,
            message: advanced ? 'Attendance saved and project automatically progressed to Checkpoint 4.' : 'Attendance updated successfully.',
            advanced
        });
    } catch (err) {
        console.error('[projectTracker] POST /submit-attendance error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to submit attendance.' });
    }
});

// 3.5 POST /submit-self-attendance — Allow individual SK officials to check-in their own attendance and save comments
router.post('/submit-self-attendance', authMiddleware, async (req, res) => {
    try {
        const { batchID, attended, comments } = req.body;
        const { userID, barangay: barangayID } = req.user;

        if (!batchID || attended === undefined) {
            return res.status(400).json({ success: false, message: 'Batch ID and attendance state are required.' });
        }

        const pool = await getConnection();

        // Verify batch exists and matches the user's barangayID
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT projName, termID FROM projectBatch WHERE batchID = @batchID AND barangayID = @barangayID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const batch = batchRes.recordset[0];

        // Retrieve active term fallback if batch.termID is null
        let activeTermID = batch.termID;
        if (!activeTermID) {
            const activeTermRes = await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .query('SELECT TOP 1 termID FROM skTerms WHERE barangayID = @barangayID AND isCurrent = 1 ORDER BY termID DESC');
            if (activeTermRes.recordset.length) {
                activeTermID = activeTermRes.recordset[0].termID;
            }
        }

        // Ensure user belongs to the current term of the batch (excluding Admin & BCPT)
        const userCheckRes = await pool.request()
            .input('userID', sql.Int, userID)
            .input('termID', sql.Int, activeTermID)
            .query(`
                SELECT u.userID 
                FROM userInfo u
                JOIN roles r ON u.position = r.roleID
                WHERE u.userID = @userID AND u.termID = @termID AND u.isArchived = 0 AND r.roleName NOT IN ('Admin', 'BCPT')
            `);

        if (!userCheckRes.recordset.length) {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only active SK officials for this term can submit self-attendance.' });
        }

        // Upsert self-attendance status and comments
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('attended', sql.Bit, attended ? 1 : 0)
            .input('comments', sql.NVarChar(sql.MAX), comments || null)
            .query(`
                MERGE projectCheckpointApprovals AS target
                USING (SELECT @batchID AS batchID, @userID AS userID) AS source
                ON (target.batchID = source.batchID AND target.userID = source.userID)
                WHEN MATCHED THEN
                    UPDATE SET attended = @attended, comments = @comments
                WHEN NOT MATCHED THEN
                    INSERT (batchID, userID, attended, comments) VALUES (source.batchID, source.userID, @attended, @comments);
            `);

        // Get total active term members count (excluding Admin/BCPT)
        const membersCountRes = await pool.request()
            .input('termID', sql.Int, activeTermID)
            .query(`
                SELECT COUNT(*) as count 
                FROM userInfo u
                JOIN roles r ON u.position = r.roleID
                WHERE u.termID = @termID AND u.isArchived = 0 AND r.roleName NOT IN ('Admin', 'BCPT')
            `);
        const totalActiveTermMembers = membersCountRes.recordset[0].count;

        // Get count of present attendees for this batch
        const presentAttendeesRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT COUNT(*) as count FROM projectCheckpointApprovals WHERE batchID = @batchID AND attended = 1');
        const presentAttendees = presentAttendeesRes.recordset[0].count;

        let advanced = false;
        if (totalActiveTermMembers > 0 && presentAttendees >= totalActiveTermMembers) {
            // Automatically advance to Checkpoint 4 (Brgy. Captain's Approval)
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('statusID', sql.Int, 4)
                .input('userID', sql.Int, userID)
                .query('INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @userID FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);');

            // Create notification
            const notifMsg = `All SK Council members have approved the project plan "${batch.projName}". It has automatically progressed to Checkpoint 4: Brgy. Captain's Approval.`;
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('barangayID', sql.Int, barangayID)
                .input('message', sql.NVarChar(sql.MAX), notifMsg)
                .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, \'INTERNAL_FINALIZED\', @message)');

            broadcast({ type: 'new_notification', barangayID });
            broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: 4 });
            advanced = true;
        } else {
            // Broadcast live attendance change in room
            broadcastToRoom(batchID, { type: 'attendance_updated' });
        }

        res.json({
            success: true,
            message: advanced ? 'Your check-in has been submitted and project progressed to Checkpoint 4.' : 'Your check-in has been updated successfully.',
            advanced
        });
    } catch (err) {
        console.error('[projectTracker] POST /submit-self-attendance error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to submit self-attendance.' });
    }
});

// 4. POST /override-finalization — Barangay Captain override of Checkpoint 3 (Manual override to Checkpoint 4)
router.post('/override-finalization', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.body;
        const { userID, barangay: barangayID } = req.user;

        if (!batchID) {
            return res.status(400).json({ success: false, message: 'Batch ID is required.' });
        }

        const pool = await getConnection();

        // Verify BCPT role
        const userRes = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT r.roleName FROM userInfo u JOIN roles r ON u.position = r.roleID WHERE u.userID = @userID');

        const role = userRes.recordset[0]?.roleName;
        if (role !== 'BCPT') {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only the Barangay Captain can perform a finalization override.' });
        }

        // Fetch batch info and cycleID
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName, cycleID FROM projectBatch WHERE batchID = @batchID');
        
        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const batchName = batchRes.recordset[0].projName;
        const cycleID = batchRes.recordset[0].cycleID;

        // Verify current checkpoint is 3
        const statusRes = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .query('SELECT TOP 1 statusID FROM projectTracker WHERE cycleID = @cycleID ORDER BY updatedAt DESC');

        const currentStatus = statusRes.recordset[0]?.statusID;
        if (currentStatus !== 3) {
            return res.status(400).json({ success: false, message: 'Project finalization can only be overridden if the project is in Checkpoint 3.' });
        }

        // Override and advance to step 4
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, 4)
            .input('userID', sql.Int, userID)
            .query('INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @userID FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);');

        // Add note indicating the manual override
        const noteContent = "Manual Override: Barangay Captain has approved progression past Checkpoint 3 SK Session.";
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('content', sql.NVarChar(sql.MAX), noteContent)
            .query('INSERT INTO projectNotes (batchID, userID, content) VALUES (@batchID, @userID, @content)');

        // Notification
        const notifMsg = `Barangay Captain has manually overridden the SK Session checkpoint for project plan "${batchName}". The project has progressed to Checkpoint 4: Brgy. Captain's Approval.`;
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .input('message', sql.NVarChar(sql.MAX), notifMsg)
            .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, \'BCPT_OVERRIDE\', @message)');

        broadcast({ type: 'new_notification', barangayID });
        broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: 4 });
        broadcastToRoom(batchID, {
            type: 'bcpt_override_applied',
            projName: batchName,
            message: `⚠️ Barangay Captain has used the Force Advance override for "${batchName}". The project has been moved to Checkpoint 4: Brgy. Captain's Approval. Please check the Work Notes & Agenda for details.`
        });

        // Send async transparency email to SKC/SKS
        sendBcptOverrideEmail(barangayID, batchName).catch(err => {
            console.error('[OverrideEmail] Failed to send override email:', err.message);
        });

        res.json({ success: true, message: 'Barangay Captain override successful. Project advanced to Checkpoint 4.' });

    } catch (err) {
        console.error('[projectTracker] POST /override-finalization error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to override finalization.' });
    }
});

// 5. POST /endorse-project — Barangay Captain Endorsement (Checkpoint 4 Approval / Reversion to Checkpoint 2)
router.post('/endorse-project', authMiddleware, async (req, res) => {
    try {
        const { batchID, action, notes } = req.body; // action: 'approve' or 'revise', notes: reasoning content
        const { userID, barangay: barangayID } = req.user;

        if (!batchID || !action || !notes || !notes.trim()) {
            return res.status(400).json({ success: false, message: 'Batch ID, action, and reasoning note are required.' });
        }

        if (action !== 'approve' && action !== 'revise') {
            return res.status(400).json({ success: false, message: 'Invalid action. Must be either \'approve\' or \'revise\'.' });
        }

        const pool = await getConnection();

        // Verify BCPT role
        const userRes = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT r.roleName FROM userInfo u JOIN roles r ON u.position = r.roleID WHERE u.userID = @userID');

        const role = userRes.recordset[0]?.roleName;
        if (role !== 'BCPT') {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only the Barangay Captain can endorse or request revisions.' });
        }

        // Fetch batch details
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName, cycleID FROM projectBatch WHERE batchID = @batchID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }
        const { projName, cycleID } = batchRes.recordset[0];

        // Verify current checkpoint is 7
        const statusRes = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .query('SELECT TOP 1 statusID FROM projectTracker WHERE cycleID = @cycleID ORDER BY updatedAt DESC');

        const currentStatus = statusRes.recordset[0]?.statusID;
        if (currentStatus !== 7) {
            return res.status(400).json({ success: false, message: "Project can only be endorsed/approved if it is in Checkpoint 7 (Brgy. Captain's Approval)." });
        }

        let nextStatusID = 8;
        let notifType = 'BCPT_ENDORSED';
        let notifMsg = '';

        if (action === 'approve') {
            nextStatusID = 8; // QCYDO Review (Checkpoint 8)
            notifType = 'BCPT_ENDORSED';
            notifMsg = `Barangay Captain has APPROVED/ENDORSED project plan "${projName}". It has proceeded to Checkpoint 8: QCYDO Review. Please check the work notes & agenda.`;
        } else {
            nextStatusID = 5; // Return to ABYIP Budget Draft (Checkpoint 5)
            notifType = 'BCPT_REVISION_REQUESTED';
            notifMsg = `Barangay Captain has requested REVISIONS for project plan "${projName}". It has reverted to Checkpoint 5: ABYIP Budget Draft. Please review the captain's feedback in the work notes.`;
        }

        // 1. Save Captain's reasoning note in projectNotes
        const fullContent = `[Barangay Captain Verdict: ${action === 'approve' ? 'ENDORSED' : 'REVISIONS REQUIRED'}]\nReasoning:\n${notes.trim()}`;
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('content', sql.NVarChar(sql.MAX), fullContent)
            .query('INSERT INTO projectNotes (batchID, userID, content) VALUES (@batchID, @userID, @content)');

        // 2. Log status change in projectTracker
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, nextStatusID)
            .input('userID', sql.Int, userID)
            .query('INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @userID FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);');

        if (nextStatusID === 5) {
            // Revert request means a whole new session is required. Delete old attendance.
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('DELETE FROM projectCheckpointApprovals WHERE batchID = @batchID');
        }

        // 3. Create Notification
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .input('notifType', sql.NVarChar, notifType)
            .input('message', sql.NVarChar(sql.MAX), notifMsg)
            .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, @notifType, @message)');

        // Trigger automatic email notification asynchronously
        sendProjectReviewVerdictEmail(barangayID, projName, action, notes).catch(err => {
            console.error('[VerdictEmail] Failed to send email:', err.message);
        });

        // Broadcast notifications & updates
        broadcast({ type: 'new_notification', barangayID });
        broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: nextStatusID });
        broadcastToRoom(batchID, {
            type: 'bcpt_verdict_submitted',
            action,
            projName,
            message: `Brgy. Captain has reviewed the plan (${action === 'approve' ? 'Approved' : 'Revision Requested'}). Please check the work notes & agenda section to view the verdict.`
        });

        res.json({
            success: true,
            message: action === 'approve'
                ? 'Project endorsed successfully. Advanced to Checkpoint 8.'
                : 'Project returned to Checkpoint 5 for revisions.',
            nextStatusID
        });
    } catch (err) {
        console.error('[projectTracker] POST /endorse-project error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to endorse project.' });
    }
});

// 6. POST /update-ppa-execution — Toggle PPA isExecuted state in Checkpoint 8
router.post('/update-ppa-execution', authMiddleware, hasAccessControl('trackerControl'), async (req, res) => {
    try {
        const { batchID, rowID, isExecuted } = req.body;
        const { barangay: barangayID } = req.user;

        if (!batchID || !rowID || isExecuted === undefined) {
            return res.status(400).json({ success: false, message: 'Batch ID, PPA row ID, and execution state are required.' });
        }

        const pool = await getConnection();

        // Get batch type
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .query('SELECT projType FROM projectBatch WHERE batchID = @batchID AND barangayID = @barangayID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }

        const { projType } = batchRes.recordset[0];

        // Ensure project is at checkpoint 13 (Project Execution)
        const statusRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT TOP 1 pt.statusID FROM projectTracker pt JOIN projectBatch pb ON pt.cycleID = pb.cycleID WHERE pb.batchID = @batchID ORDER BY pt.updatedAt DESC');

        const currentStatus = statusRes.recordset[0]?.statusID;
        if (currentStatus !== 13) {
            return res.status(400).json({ success: false, message: 'PPA execution checklist can only be toggled during Checkpoint 13 (Project Execution).' });
        }

        // Update the execution status in the correct table
        if (projType === 'ABYIP') {
            await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .input('isExecuted', sql.Bit, isExecuted ? 1 : 0)
                .query('UPDATE projectABYIP SET isExecuted = @isExecuted WHERE abyipID = @rowID AND projbatchID = @batchID');
        } else {
            await pool.request()
                .input('rowID', sql.Int, rowID)
                .input('batchID', sql.Int, batchID)
                .input('isExecuted', sql.Bit, isExecuted ? 1 : 0)
                .query('UPDATE projectCBYDP SET isExecuted = @isExecuted WHERE cbydpID = @rowID AND projbatchID = @batchID');
        }

        // Broadcast the update to anyone viewing the tracker in real-time
        broadcastToRoom(batchID, { type: 'ppa_execution_updated', rowID, isExecuted });

        // If this item was marked Done, check if all PPAs are now completed
        if (isExecuted) {
            let unexecutedRes;
            if (projType === 'ABYIP') {
                unexecutedRes = await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .query('SELECT COUNT(*) as count FROM projectABYIP WHERE projbatchID = @batchID AND isExecuted = 0');
            } else {
                unexecutedRes = await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .query('SELECT COUNT(*) as count FROM projectCBYDP WHERE projbatchID = @batchID AND isExecuted = 0');
            }

            const unexecutedCount = unexecutedRes.recordset[0]?.count || 0;
            if (unexecutedCount === 0) {
                const batchInfoRes = await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .query('SELECT projName FROM projectBatch WHERE batchID = @batchID');
                const projName = batchInfoRes.recordset[0]?.projName || 'Unknown Project';

                // Insert system notification for BCPT review
                const notifMsg = `The SK Council has completed all items in the PPA Execution Checklist for project plan "${projName}". Please review, validate, and sign off on project closure.`;
                await pool.request()
                    .input('batchID', sql.Int, batchID)
                    .input('barangayID', sql.Int, barangayID)
                    .input('message', sql.NVarChar(sql.MAX), notifMsg)
                    .query("INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, 'EXECUTION_COMPLETE', @message)");

                // Send email to BCPT
                sendExecutionCompleteEmailToBCPT(barangayID, projName).catch(emailErr => {
                    console.error('[ExecutionEmail] Failed to notify BCPT via email:', emailErr.message);
                });

                // WebSocket broadcast for live updates and flash alert trigger
                broadcast({ type: 'new_notification', barangayID });
                broadcastToRoom(batchID, { type: 'execution_checklist_completed', message: notifMsg });
            }
        }

        res.json({ success: true, message: 'PPA execution state updated.' });
    } catch (err) {
        console.error('[projectTracker] POST /update-ppa-execution error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update PPA execution state.' });
    }
});

// 7. POST /validate-closure — BCPT validation of Checkpoint 8 checklist and sign off to advance to Checkpoint 9
router.post('/validate-closure', authMiddleware, async (req, res) => {
    try {
        const { batchID } = req.body;
        const { userID, barangay: barangayID } = req.user;

        if (!batchID) {
            return res.status(400).json({ success: false, message: 'Batch ID is required.' });
        }

        const pool = await getConnection();

        // Verify BCPT role
        const userRes = await pool.request()
            .input('userID', sql.Int, userID)
            .query('SELECT r.roleName FROM userInfo u JOIN roles r ON u.position = r.roleID WHERE u.userID = @userID');

        const role = userRes.recordset[0]?.roleName;
        if (role !== 'BCPT') {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only the Barangay Captain can sign off on project closure.' });
        }

        // Verify current checkpoint is 13
        const statusRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT TOP 1 pt.statusID FROM projectTracker pt JOIN projectBatch pb ON pt.cycleID = pb.cycleID WHERE pb.batchID = @batchID ORDER BY pt.updatedAt DESC');

        const currentStatus = statusRes.recordset[0]?.statusID;
        if (currentStatus !== 13) {
            return res.status(400).json({ success: false, message: 'Closure can only be validated if the project is in Checkpoint 13 (Project Execution).' });
        }

        // Fetch batch details
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName, projType FROM projectBatch WHERE batchID = @batchID');

        if (!batchRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Project batch not found.' });
        }
        const { projName, projType } = batchRes.recordset[0];

        // Double check if there are unexecuted PPAs
        let unexecutedCount = 0;
        if (projType === 'ABYIP') {
            const countRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT COUNT(*) as count FROM projectABYIP WHERE projbatchID = @batchID AND isExecuted = 0');
            unexecutedCount = countRes.recordset[0].count;
        } else {
            const countRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT COUNT(*) as count FROM projectCBYDP WHERE projbatchID = @batchID AND isExecuted = 0');
            unexecutedCount = countRes.recordset[0].count;
        }

        if (unexecutedCount > 0) {
            return res.status(400).json({ success: false, message: `Cannot validate closure. There are still ${unexecutedCount} unexecuted PPAs in this plan.` });
        }

        // Advance to Checkpoint 14 (Project Closure & Evaluation)
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('statusID', sql.Int, 14)
            .input('userID', sql.Int, userID)
            .query('INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @userID FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);');

        // Log closure note
        const noteMsg = "Project Closure Validated: Barangay Captain has audited the execution checklist and signed off on project closure.";
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('userID', sql.Int, userID)
            .input('content', sql.NVarChar(sql.MAX), noteMsg)
            .query('INSERT INTO projectNotes (batchID, userID, content) VALUES (@batchID, @userID, @content)');

        // Create Notification
        const notifMsg = `Barangay Captain has validated the closure checklist for project plan "${projName}". It has been successfully advanced to Checkpoint 14: Project Closure & Evaluation.`;
        await pool.request()
            .input('batchID', sql.Int, batchID)
            .input('barangayID', sql.Int, barangayID)
            .query('INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, \'PROJECT_CLOSED\', @message)');

        // Broadcast notifications & updates
        broadcast({ type: 'new_notification', barangayID });
        broadcastToRoom(batchID, { type: 'checkpoint_updated', statusID: 14 });

        res.json({ success: true, message: 'Project closure validated. Advanced to Checkpoint 14.' });
    } catch (err) {
        console.error('[projectTracker] POST /validate-closure error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to validate project closure.' });
    }
});

// --- Checkpoint Proof Upload & Validation (CP5-CP10) ---

const CHECKPOINT_FOLDER_MAP = {
    4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve'
};

function getAttemptSuffix(count) {
    const num = count + 1;
    if (num === 1) return '1st';
    if (num === 2) return '2nd';
    if (num === 3) return '3rd';
    return `${num}th`;
}

// 1. POST /upload-checkpoint-proof
router.post('/upload-checkpoint-proof', authMiddleware, hasAccessControl('trackerControl'), upload.single('proofFile'), async (req, res) => {
    try {
        const batchID = parseInt(req.body.batchID, 10);
        const checkpointID = parseInt(req.body.checkpointID, 10);
        
        if (!batchID || isNaN(checkpointID) || !CHECKPOINT_FOLDER_MAP[checkpointID]) {
            return res.status(400).json({ success: false, message: 'Invalid batch ID or checkpoint ID.' });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No proof file provided.' });
        }

        // Validate file extension
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.webm', '.pdf'];
        const fileExt = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));
        if (!allowedExtensions.includes(fileExt)) {
            return res.status(400).json({ success: false, message: 'Invalid file format. Only png, jpg, jpeg, webp, webm, and pdf files are allowed.' });
        }
        
        const folderName = CHECKPOINT_FOLDER_MAP[checkpointID];
        const timestamp = Date.now();
        // Sanitize original filename (replace spaces with underscores, etc)
        const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        
        const pool = await getConnection();
        const batchCheck = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`SELECT barangayID, cycleID FROM projectBatch WHERE batchID = @batchID`);
            
        if (batchCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }
        
        const { barangayID, cycleID } = batchCheck.recordset[0];
        
        let blobName;
        if (checkpointID >= 8 && checkpointID <= 12) {
            // Count existing tracker arrivals to determine the active attempt suffix
            const trackerCheck = await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('statusID', sql.Int, checkpointID)
                .query(`SELECT COUNT(*) as count FROM projectTracker WHERE batchID = @batchID AND statusID = @statusID`);
            const arrivalsCount = trackerCheck.recordset[0].count;
            const attemptSuffix = getAttemptSuffix(Math.max(0, arrivalsCount - 1));
            blobName = `Checkpoints/${folderName}/${barangayID}/${cycleID}/${attemptSuffix}/${timestamp}-${safeFilename}`;
        } else {
            blobName = `Checkpoints/${folderName}/${barangayID}/${cycleID}/${timestamp}-${safeFilename}`;
        }
        
        await uploadBlob(docContainerName, blobName, req.file.buffer, req.file.mimetype);
        
        res.json({ success: true, message: `Proof file uploaded successfully.`, path: blobName });
    } catch (err) {
        console.error('[projectTracker] POST /upload-checkpoint-proof error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to upload proof file.' });
    }
});

// 2. GET /checkpoint-proof/:batchID/:checkpointID
router.get('/checkpoint-proof/:batchID/:checkpointID', authMiddleware, async (req, res) => {
    try {
        const { batchID, checkpointID } = req.params;
        const folderName = CHECKPOINT_FOLDER_MAP[checkpointID];
        
        if (!folderName) {
            return res.status(400).json({ success: false, message: 'Invalid checkpoint ID.' });
        }
        
        const pool = await getConnection();
        const batchCheck = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`SELECT barangayID, cycleID FROM projectBatch WHERE batchID = @batchID`);
            
        if (batchCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }
        
        const { barangayID, cycleID } = batchCheck.recordset[0];
        let prefix = `Checkpoints/${folderName}/${barangayID}/${cycleID}/`;
        
        const blobs = await listBlobsWithProperties(docContainerName, { prefix });
        
        const files = [];
        for (const blob of blobs) {
            const parts = blob.name.split('/');
            let attempt = null;
            const sasUrl = await generateSasUrl(docContainerName, blob.name);
            const filename = parts.pop();
            let originalName = filename;
            
            if (checkpointID < 8 || checkpointID > 12) {
                const nameParts = filename.split('-');
                nameParts.shift(); // remove timestamp
                originalName = nameParts.join('-') || filename;
            }
            
            files.push({
                name: originalName,
                path: blob.name,
                url: sasUrl,
                size: blob.properties.contentLength,
                uploadedAt: blob.properties.lastModified,
                attempt: attempt
            });
        }
        
        res.json({ success: true, data: files });
    } catch (err) {
        console.error('[projectTracker] GET /checkpoint-proof error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch proof files.' });
    }
});

// POST /validate-budget
router.post('/validate-budget', authMiddleware, async (req, res) => {
    try {
        if (!isBCPT(req)) {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only Barangay Captain can validate the budget.' });
        }

        const { batchID, action, remarks } = req.body;
        const { userID, barangay: barangayID } = req.user;

        if (!batchID || !action) {
            return res.status(400).json({ success: false, message: 'batchID and action are required.' });
        }

        const pool = await getConnection();
        
        // Ensure batch is currently at status 5
        const batchRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`
                SELECT pc.currentStatusID, pb.projType as currentProjType 
                FROM projectBatch pb
                JOIN projectCycles pc ON pb.cycleID = pc.cycleID
                WHERE pb.batchID = @batchID
            `);
            
        if (batchRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Batch not found.' });
        }
        
        const batch = batchRes.recordset[0];
        if (batch.currentStatusID !== 5) {
            return res.status(400).json({ success: false, message: 'Budget validation is only available at Checkpoint 5.' });
        }

        // We also need the cycle info to get the project name to use in emails
        const cycleRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`
                SELECT pc.targetFiscalYear 
                FROM projectCycles pc
                JOIN projectBatch pb ON pc.cycleID = pb.cycleID
                WHERE pb.batchID = @batchID
            `);
            
        const fiscalYear = cycleRes.recordset[0]?.targetFiscalYear || 'Unknown';
        const projName = `${batch.currentProjType} ${fiscalYear}`;

        if (action === 'approve') {
            // Advance to Checkpoint 6
            const newStatusID = 6;
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('statusID', sql.Int, newStatusID)
                .query(`UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID)`);

            await pool.request()
                .input('batchID', sql.Int, batchID)
                .input('statusID', sql.Int, newStatusID)
                .input('updatedBy', sql.Int, userID)
                .query(`INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @updatedBy FROM projectBatch WHERE batchID = @batchID`);

            // Also clear any stuck notifications
            await pool.request()
                .input('batchID', sql.Int, batchID)
                .query(`UPDATE projectNotifications SET isRead = 1 WHERE batchID = @batchID AND notifType IN ('URGENT', 'DEADLINE')`);

            res.json({ success: true, message: 'Estimated Annual Budget approved. Advanced to Checkpoint 6.' });
        } else if (action === 'reject') {
            // Keep at Checkpoint 5, send rejection email, and insert notification
            const { sendBudgetRejectionEmail } = require('../Email/email');
            await sendBudgetRejectionEmail(barangayID, projName, remarks || 'No remarks provided.');
            
            // Send system notification to SKC/SKS
            await pool.request()
                .input('barangayID', sql.Int, barangayID)
                .input('batchID', sql.Int, batchID)
                .input('remarks', sql.NVarChar, remarks || 'No remarks provided.')
                .query(`
                    INSERT INTO projectNotifications (userID, notifType, message, batchID, isRead, createdAt)
                    SELECT userID, 'SYSTEM', 'Budget Rejected: ' + @remarks, @batchID, 0, GETDATE()
                    FROM userInfo
                    WHERE barangay = @barangayID AND position IN (SELECT roleID FROM roles WHERE roleName IN ('SKC', 'SKS')) AND isArchived = 0
                `);

            res.json({ success: true, message: 'Budget rejected. Notification sent to SK Council.' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action.' });
        }

    } catch (err) {
        console.error('[projectTracker] POST /validate-budget error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to process budget validation.' });
    }
});

// 3. POST /validate-checkpoint
router.post('/validate-checkpoint', authMiddleware, async (req, res) => {
    try {
        if (!isBCPT(req)) {
            return res.status(403).json({ success: false, message: 'Unauthorized. Only Barangay Captain can validate checkpoints.' });
        }
        
                const { batchID, fromCheckpoint, validationNote, action } = req.body;
        const fromCP = parseInt(fromCheckpoint, 10);
        
        if (!batchID || isNaN(fromCP) || (!CHECKPOINT_FOLDER_MAP[fromCP] && fromCP !== 12)) {
            return res.status(400).json({ success: false, message: 'Invalid parameters. fromCheckpoint must be a valid checkpoint ID (4-12).' });
        }
        if (!validationNote || validationNote.trim() === '') {
            return res.status(400).json({ success: false, message: 'Remarks/Note is required.' });
        }

        const act = action === 'reject' ? 'reject' : 'approve';
        
        const pool = await getConnection();
        
        // Ensure current status matches fromCheckpoint
        const batchCheck = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`SELECT projName, barangayID, cycleID FROM projectBatch WHERE batchID = @batchID`);
            
        if (batchCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const projName = batchCheck.recordset[0].projName;
        const barangayID = batchCheck.recordset[0].barangayID;
        const cycleID = batchCheck.recordset[0].cycleID;
        
        const folderName = CHECKPOINT_FOLDER_MAP[fromCP];
        let prefix = `Checkpoints/${folderName}/${barangayID}/${cycleID}/`;
        
        const activeBlobs = await listBlobsWithProperties(docContainerName, { prefix });
        
        if (activeBlobs.length === 0) {
            return res.status(400).json({ success: false, message: `Cannot process: No proof files have been uploaded.` });
        }

        const statusRes = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .query(`SELECT TOP 1 statusID FROM projectTracker WHERE cycleID = @cycleID ORDER BY updatedAt DESC`);

        const currentStatusID = statusRes.recordset.length ? statusRes.recordset[0].statusID : 2;
        
        if (currentStatusID !== fromCP) {
            return res.status(400).json({ success: false, message: `Project is not at checkpoint ${fromCP}.` });
        }
        
        let nextStatusID = fromCP + 1;
        let taggedNote = '';
        let notifMessage = '';
        let notifType = 'CHECKPOINT_VALIDATED';
        
        if (act === 'approve') {
            nextStatusID = fromCP + 1;
            taggedNote = `[BCPT Validation: CP${fromCP}] ${validationNote}`;
            notifMessage = `Barangay Captain has validated Checkpoint ${fromCP} for project "${projName}". Status advanced to Checkpoint ${nextStatusID}.`;
            notifType = 'CHECKPOINT_VALIDATED';
        } else {
            // Rejection / Revert request
            nextStatusID = fromCP;
            notifMessage = `Barangay Captain requested REVISIONS for project "${projName}" during Checkpoint ${fromCP} validation. Status remains at Checkpoint ${fromCP}.`;
            notifType = 'BCPT_REVISION_REQUESTED';
            taggedNote = `[BCPT Rejection: CP${fromCP}] ${validationNote}`;
        }
        
        // Perform updates inside a transaction
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
            // Insert projectTracker record
            await transaction.request()
                .input('batchID', sql.Int, batchID)
                .input('statusID', sql.Int, nextStatusID)
                .input('updatedBy', sql.Int, req.user.userID)
                .query(`INSERT INTO projectTracker (cycleID, statusID, updatedBy) SELECT cycleID, @statusID, @updatedBy FROM projectBatch WHERE batchID = @batchID; UPDATE projectCycles SET currentStatusID = @statusID, updatedAt = GETDATE() WHERE cycleID = (SELECT cycleID FROM projectBatch WHERE batchID = @batchID);`);
                
                
            // Insert validation/rejection note in projectNotes (using correct column names: userID, content)
            await transaction.request()
                .input('batchID', sql.Int, batchID)
                .input('userID', sql.Int, req.user.userID)
                .input('content', sql.NVarChar(sql.MAX), taggedNote)
                .query(`INSERT INTO projectNotes (batchID, userID, content) VALUES (@batchID, @userID, @content)`);
                
            // Insert Notification in projectNotifications with correct fields
            await transaction.request()
                .input('batchID', sql.Int, batchID)
                .input('barangayID', sql.Int, barangayID)
                .input('notifType', sql.VarChar(50), notifType)
                .input('message', sql.NVarChar(sql.MAX), notifMessage)
                .query(`INSERT INTO projectNotifications (batchID, barangayID, notifType, message) VALUES (@batchID, @barangayID, @notifType, @message)`);
                
            await transaction.commit();
            
            // Broadcasts
            broadcastToRoom(batchID.toString(), { type: 'checkpoint_updated', statusID: nextStatusID });
            broadcastToRoom(batchID.toString(), { type: 'new_note' });
            broadcast({ type: 'new_notification', barangayID });
            
            res.json({ success: true, message: act === 'approve' ? `Checkpoint ${fromCP} validated. Project advanced to Checkpoint ${nextStatusID}.` : `Checkpoint ${fromCP} validation rejected. Project set to Checkpoint ${nextStatusID}.` });
        } catch (txnErr) {
            await transaction.rollback();
            throw txnErr;
        }
        
    } catch (err) {
        console.error('[projectTracker] POST /validate-checkpoint error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to process checkpoint validation.' });
    }
});


// ============================================================================
// CHECKPOINT 1: Youth Profiling Endpoints
// Implements DILG MC No. 2022-033 — Annex 4 upload, validation, and gating.
// ============================================================================

const axios = require('axios');
const uploadFields = upload.fields([
    { name: 'barangay_notice_letter', maxCount: 1 },
    { name: 'campaign_proof_images', maxCount: 20 },
    { name: 'master_youth_dataset', maxCount: 1 },
]);

// Helper: get or create the submission record for this term+barangay
async function getOrCreateSubmission(pool, cycleID, barangayID, userID) {
    const existing = await pool.request()
        .input('cycleID', sql.Int, cycleID)
        .input('barangayID', sql.Int, barangayID)
        .query(`
            SELECT submissionID, status, hasInformedConsentVerified, attemptCount
            FROM youth_profiling_submissions
            WHERE cycleID = @cycleID AND barangayID = @barangayID
        `);

    if (existing.recordset.length) {
        return existing.recordset[0];
    }

    const created = await pool.request()
        .input('cycleID', sql.Int, cycleID)
        .input('barangayID', sql.Int, barangayID)
        .query(`
            INSERT INTO youth_profiling_submissions (cycleID, barangayID)
            OUTPUT INSERTED.submissionID, INSERTED.status, INSERTED.hasInformedConsentVerified, INSERTED.attemptCount
            VALUES (@cycleID, @barangayID)
        `);

    return created.recordset[0];
}

// ---
// CP1-1: POST /api/project-tracker/profiling/upload
// Accepts the three file types, uploads them to Azure Blob Storage,
// and records blob references + optional DPA consent flag in the DB.
// ---
router.post('/profiling/upload', authMiddleware, uploadFields, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKS') {
            return res.status(403).json({ success: false, message: 'Access denied. Only the SK Secretary (SKS) is permitted to upload profiling documents.' });
        }
        const { cycleID, barangayID, hasInformedConsent } = req.body;
        const { userID } = req.user;

        if (!cycleID || !barangayID) {
            return res.status(400).json({ success: false, message: 'cycleID and barangayID are required.' });
        }

        const pool = await getConnection();

        // Verify the term belongs to this barangay
        const cycleCheck = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, barangayID)
            .query(`SELECT cycleID FROM projectCycles WHERE cycleID = @cycleID AND barangayID = @barangayID`);

        if (!cycleCheck.recordset.length) {
            return res.status(403).json({ success: false, message: 'The specified project cycle does not belong to your barangay.' });
        }

        const submission = await getOrCreateSubmission(pool, parseInt(cycleID), parseInt(barangayID), userID);
        const { submissionID, attemptCount } = submission;

        const container = docContainerName;
        const ts = Date.now();
        const updates = {};
        const attachmentBlobs = [];

        // Upload barangay notice letter (PDF)
        const noticeLetter = req.files['barangay_notice_letter']?.[0];
        if (noticeLetter) {
            const safe = noticeLetter.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Notice_Letter/${attemptCount}/${ts}-${safe}`;
            await uploadBlob(container, blobName, noticeLetter.buffer, noticeLetter.mimetype);
            updates.noticeLetterBlobName = blobName;
            updates.noticeLetterUploadedAt = new Date();
        }

        // Upload master youth dataset (XLSX)
        const masterDataset = req.files['master_youth_dataset']?.[0];
        if (masterDataset) {
            const safe = masterDataset.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Master_Dataset/${attemptCount}/${ts}-${safe}`;
            await uploadBlob(container, blobName, masterDataset.buffer, masterDataset.mimetype);
            updates.masterDatasetBlobName = blobName;
            updates.masterDatasetUploadedAt = new Date();
        }

        // Upload campaign proof images (JPEG/PNG)
        const proofImages = req.files['campaign_proof_images'] || [];
        for (const img of proofImages) {
            const safe = img.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Campaign_Proof/${attemptCount}/${ts}-${safe}`;
            await uploadBlob(container, blobName, img.buffer, img.mimetype);
            attachmentBlobs.push(blobName);
        }

        // --- SQL Transaction Setup ---
        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin();

            // Update submission record with blob names and DPA flag
            const consentBit = hasInformedConsent === 'true' || hasInformedConsent === true ? 1 : 0;

            let setClauses = ['hasInformedConsentVerified = @consent', 'updatedAt = GETDATE()'];
            const req2 = new sql.Request(transaction);
            req2.input('submissionID', sql.Int, submissionID)
                .input('consent', sql.Bit, consentBit);

            if (updates.noticeLetterBlobName) {
                setClauses.push('noticeLetterBlobName = @noticeBlobName', 'noticeLetterUploadedAt = @noticeUploadedAt');
                req2.input('noticeBlobName', sql.NVarChar(255), updates.noticeLetterBlobName);
                req2.input('noticeUploadedAt', sql.DateTime, updates.noticeLetterUploadedAt);
            }
            if (updates.masterDatasetBlobName) {
                setClauses.push('masterDatasetBlobName = @datasetBlobName', 'masterDatasetUploadedAt = @datasetUploadedAt');
                req2.input('datasetBlobName', sql.NVarChar(255), updates.masterDatasetBlobName);
                req2.input('datasetUploadedAt', sql.DateTime, updates.masterDatasetUploadedAt);
            }

            await req2.query(`
                UPDATE youth_profiling_submissions
                SET ${setClauses.join(', ')}
                WHERE submissionID = @submissionID
            `);

            // Insert campaign proof attachments into the junction table
            for (const blobName of attachmentBlobs) {
                const proofReq = new sql.Request(transaction);
                proofReq.input('submissionID', sql.Int, submissionID)
                        .input('imageBlobName', sql.NVarChar(255), blobName);
                await proofReq.query(`INSERT INTO youth_profiling_proof_attachments (submissionID, imageBlobName, isIncluded) VALUES (@submissionID, @imageBlobName, 1)`);
            }

            // Auto-transition to SUBMITTED if all 3 annexes are now present
            const checkReq = new sql.Request(transaction);
            checkReq.input('submissionID', sql.Int, submissionID);
            const checkRes = await checkReq.query(`
                SELECT 
                    noticeLetterBlobName, 
                    masterDatasetBlobName,
                    (SELECT COUNT(*) FROM youth_profiling_proof_attachments WHERE submissionID = @submissionID AND isIncluded = 1) AS proofCount
                FROM youth_profiling_submissions
                WHERE submissionID = @submissionID
            `);

            let finalStatus = 'INCOMPLETE';
            if (checkRes.recordset.length) {
                const row = checkRes.recordset[0];
                if (row.noticeLetterBlobName && row.masterDatasetBlobName && row.proofCount > 0) {
                    finalStatus = 'SUBMITTED';
                    const transitionReq = new sql.Request(transaction);
                    transitionReq.input('submissionID', sql.Int, submissionID);
                    await transitionReq.query(`
                        UPDATE youth_profiling_submissions 
                        SET status = 'SUBMITTED', updatedAt = GETDATE() 
                        WHERE submissionID = @submissionID AND status IN ('INCOMPLETE', 'REVISION_REQUESTED')
                    `);
                }
            }

            await transaction.commit();

            res.json({
                success: true,
                message: 'Files uploaded successfully.',
                submissionID,
                status: finalStatus,
                uploadedFiles: {
                    noticeLetter: updates.noticeLetterBlobName || null,
                    masterDataset: updates.masterDatasetBlobName || null,
                    campaignProofs: attachmentBlobs,
                },
            });

        } catch (dbErr) {
            console.error('[projectTracker] Database transaction failed, rolling back...', dbErr.message);
            await transaction.rollback();

            // Azure Blob Rollback (Cleanup orphaned files)
            if (updates.noticeLetterBlobName) await deleteBlob(container, updates.noticeLetterBlobName).catch(console.error);
            if (updates.masterDatasetBlobName) await deleteBlob(container, updates.masterDatasetBlobName).catch(console.error);
            for (const blobName of attachmentBlobs) {
                await deleteBlob(container, blobName).catch(console.error);
            }

            throw dbErr; // Let the outer catch handle sending the 500 response
        }

    } catch (err) {
        console.error('[projectTracker] POST /profiling/upload error:', err.message);
        res.status(500).json({ success: false, message: 'File upload failed. Please try again.' });
    }
});

// ---
// CP1-2: POST /api/project-tracker/profiling/validate
// Retrieves the submission record and approves manual SKC validation.
// Transitions status to CHECKPOINT_1_COMPLETE, clears revisionComment,
// and triggers non-blocking background demographics analytics computation.
// ---
router.post('/profiling/validate', authMiddleware, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKC') {
            return res.status(403).json({ success: false, message: 'Access denied. Only the SK Chairperson (SKC) is permitted to validate the profiling dataset.' });
        }
        const { submissionID } = req.body;
        const { barangay: barangayID } = req.user;

        if (!submissionID) {
            return res.status(400).json({ success: false, message: 'submissionID is required.' });
        }

        const pool = await getConnection();

        // Fetch the full submission record
        const subRes = await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT
                    s.submissionID, s.cycleID, s.barangayID,
                    s.noticeLetterBlobName, s.masterDatasetBlobName,
                    s.hasInformedConsentVerified, s.status
                FROM youth_profiling_submissions s
                WHERE s.submissionID = @submissionID AND s.barangayID = @barangayID
            `);

        if (!subRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Submission record not found.' });
        }

        const sub = subRes.recordset[0];

        // Verify required files are uploaded before validation approval
        if (!sub.noticeLetterBlobName || !sub.masterDatasetBlobName) {
            return res.status(400).json({
                success: false,
                message: 'Cannot approve: Notice Letter and Master Dataset must be uploaded first.',
            });
        }

        // Fetch campaign proof count
        const proofsRes = await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .query(`SELECT COUNT(*) as count FROM youth_profiling_proof_attachments WHERE submissionID = @submissionID AND isIncluded = 1`);

        if (!proofsRes.recordset.length || proofsRes.recordset[0].count === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot approve: At least one campaign proof image must be uploaded.',
            });
        }

        const revisionYear = new Date().getFullYear();
        let minorVersion = 1;

        // Update status to CHECKPOINT_1_COMPLETE, clear revisionComment
        await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .input('revisionYear', sql.Int, revisionYear)
            .input('minorVersion', sql.Int, minorVersion)
            .query(`
                UPDATE youth_profiling_submissions
                SET status = 'CHECKPOINT_1_COMPLETE',
                    revisionComment = NULL,
                    revisionYear = ISNULL(revisionYear, @revisionYear),
                    minorVersion = ISNULL(minorVersion, @minorVersion),
                    updatedAt = GETDATE()
                WHERE submissionID = @submissionID
            `);

        // Fetch active cycle for this term + barangay
        const cycleRes = await pool.request()
            .input('cycleID', sql.Int, sub.cycleID)
            .input('barangayID', sql.Int, sub.barangayID)
            .query(`
                SELECT cycleID, termID, termStartYear, termEndYear, targetFiscalYear, currentStatusID
                FROM projectCycles
                WHERE cycleID = @cycleID AND barangayID = @barangayID
            `);

        let activeCycle = null;
        if (cycleRes.recordset.length > 0) {
            activeCycle = cycleRes.recordset[0];
            const barangayPrefix = sub.barangayID > 100 ? 'NN' : 'SB';
            const cbydpFilename = `CBYDP_${barangayPrefix}_${activeCycle.termStartYear}-${activeCycle.termEndYear}_Rev${activeCycle.targetFiscalYear}_v1.0.xlsx`;

            // Update submission with Checkpoint 2 initialization info
            await pool.request()
                .input('submissionID', sql.Int, sub.submissionID)
                .input('termStart', sql.Int, activeCycle.termStartYear)
                .input('termEnd', sql.Int, activeCycle.termEndYear)
                .query(`
                    UPDATE youth_profiling_submissions
                    SET termStart = @termStart, termEnd = @termEnd
                    WHERE submissionID = @submissionID
                `);

            // Only advance to CP2 if cycle is still at CP1 (idempotency guard)
            if (activeCycle.currentStatusID === 1) {
                // Advance project cycle to Checkpoint 2
                await pool.request()
                    .input('cycleID', sql.Int, activeCycle.cycleID)
                    .query(`UPDATE projectCycles SET currentStatusID = 2, updatedAt = GETDATE() WHERE cycleID = @cycleID`);

                // Insert into projectTracker
                await pool.request()
                    .input('cycleID', sql.Int, activeCycle.cycleID)
                    .input('updatedBy', sql.Int, req.user.userID)
                    .query(`INSERT INTO projectTracker (cycleID, statusID, updatedBy) VALUES (@cycleID, 2, @updatedBy)`);
            }
        }

        // Trigger fire-and-forget background analytics computation in Python FastAPI service
        const pyUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8080'}/api/v1/checkpoints/profiling/analytics`;
        const pyPayload = {
            term_id: activeCycle ? activeCycle.termID : null, // AI backend uses term_id parameter
            barangay_id: sub.barangayID,
            submission_id: sub.submissionID,
            master_dataset_blob: sub.masterDatasetBlobName,
        };

        axios.post(pyUrl, pyPayload, { timeout: 30000 }).catch(err => {
            console.error('[projectTracker] Background async analytics computation failed:', err.message);
        });

        res.json({
            success: true,
            message: 'Youth profiling dataset validated manually. Checkpoint 1 is complete.',
        });

    } catch (err) {
        console.error('[projectTracker] POST /profiling/validate error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to run profiling validation.' });
    }
});

// ---
// CP1-2a: POST /api/project-tracker/profiling/request-revision
// Requests a revision with a mandatory comment. Sets status = 'REVISION_REQUESTED'.
// ---
router.post('/profiling/request-revision', authMiddleware, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKC') {
            return res.status(403).json({ success: false, message: 'Access denied. Only the SK Chairperson (SKC) is permitted to request revisions.' });
        }
        const { submissionID, comment } = req.body;
        const { barangay: barangayID } = req.user;

        if (!submissionID || !comment || !comment.trim()) {
            return res.status(400).json({ success: false, message: 'submissionID and a non-empty revision comment are required.' });
        }

        const pool = await getConnection();

        // Verify submission exists
        const check = await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .input('barangayID', sql.Int, barangayID)
            .query(`SELECT submissionID FROM youth_profiling_submissions WHERE submissionID = @submissionID AND barangayID = @barangayID`);

        if (!check.recordset.length) {
            return res.status(404).json({ success: false, message: 'Submission record not found.' });
        }

        // Update status and store comment
        await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .input('comment', sql.NVarChar(sql.MAX), comment.trim())
            .query(`
                UPDATE youth_profiling_submissions
                SET status = 'REVISION_REQUESTED',
                    revisionComment = @comment,
                    attemptCount = attemptCount + 1,
                    updatedAt = GETDATE()
                WHERE submissionID = @submissionID;
                
                UPDATE youth_profiling_proof_attachments
                SET isIncluded = 0
                WHERE submissionID = @submissionID;
            `);

        res.json({
            success: true,
            message: 'Revision requested successfully. SKS will be notified of the changes needed.',
        });

    } catch (err) {
        console.error('[projectTracker] POST /profiling/request-revision error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to request revision.' });
    }
});

// ---
// CP1-2b: PATCH /api/project-tracker/profiling/replace-annex
// Accepts files for replacement. Restrict to SKS/Admin.
// ---
router.patch('/profiling/replace-annex', authMiddleware, uploadFields, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKS') {
            return res.status(403).json({ success: false, message: 'Access denied. Only the SK Secretary (SKS) is permitted to replace profiling documents.' });
        }
        const { cycleID, barangayID, annexType } = req.body;

        if (!cycleID || !barangayID || !annexType) {
            return res.status(400).json({ success: false, message: 'cycleID, barangayID, and annexType are required.' });
        }

        const pool = await getConnection();

        // Fetch submission record
        const subRes = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT submissionID, status, noticeLetterBlobName, masterDatasetBlobName, attemptCount
                FROM youth_profiling_submissions 
                WHERE cycleID = @cycleID AND barangayID = @barangayID
            `);

        if (!subRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Submission record not found.' });
        }

        const sub = subRes.recordset[0];
        const { submissionID, attemptCount } = sub;
        const container = docContainerName;
        const ts = Date.now();

        if (annexType === 'noticeLetter') {
            const noticeLetter = req.files['barangay_notice_letter']?.[0];
            if (!noticeLetter) {
                return res.status(400).json({ success: false, message: 'Notice letter file is required for replacement.' });
            }

            // Delete old notice letter from storage
            if (sub.noticeLetterBlobName) {
                try {
                    await deleteBlob(container, sub.noticeLetterBlobName);
                } catch (delErr) {
                    console.error('[projectTracker] Failed to delete old notice letter:', delErr.message);
                }
            }

            // Upload new notice letter
            const safe = noticeLetter.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Notice_Letter/${attemptCount}/${ts}-${safe}`;
            await uploadBlob(container, blobName, noticeLetter.buffer, noticeLetter.mimetype);

            // Update database
            await pool.request()
                .input('submissionID', sql.Int, submissionID)
                .input('blobName', sql.NVarChar(255), blobName)
                .query(`
                    UPDATE youth_profiling_submissions
                    SET noticeLetterBlobName = @blobName, noticeLetterUploadedAt = GETDATE(), updatedAt = GETDATE()
                    WHERE submissionID = @submissionID AND isIncluded = 1
                `);

        } else if (annexType === 'masterDataset') {
            const masterDataset = req.files['master_youth_dataset']?.[0];
            if (!masterDataset) {
                return res.status(400).json({ success: false, message: 'Master dataset file is required for replacement.' });
            }

            // Delete old dataset from storage
            if (sub.masterDatasetBlobName) {
                try {
                    await deleteBlob(container, sub.masterDatasetBlobName);
                } catch (delErr) {
                    console.error('[projectTracker] Failed to delete old master dataset:', delErr.message);
                }
            }

            // Upload new dataset
            const safe = masterDataset.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Master_Dataset/${attemptCount}/${ts}-${safe}`;
            await uploadBlob(container, blobName, masterDataset.buffer, masterDataset.mimetype);

            // Update database
            await pool.request()
                .input('submissionID', sql.Int, submissionID)
                .input('blobName', sql.NVarChar(255), blobName)
                .query(`
                    UPDATE youth_profiling_submissions
                    SET masterDatasetBlobName = @blobName, masterDatasetUploadedAt = GETDATE(), updatedAt = GETDATE()
                    WHERE submissionID = @submissionID
                `);

        } else if (annexType === 'campaignProofs') {
            // Campaign proofs: newly uploaded get isIncluded=1, existing checked ones get isIncluded=1, unchecked get isIncluded=0.
            // Also supports deletion from the library.
            
            let reusedAttachmentIDs = [];
            if (req.body.reusedAttachmentIDs) {
                try {
                    reusedAttachmentIDs = typeof req.body.reusedAttachmentIDs === 'string' 
                        ? JSON.parse(req.body.reusedAttachmentIDs) 
                        : req.body.reusedAttachmentIDs;
                } catch (e) {
                    console.error('[projectTracker] Failed to parse reusedAttachmentIDs:', e.message);
                    return res.status(400).json({ success: false, message: 'Invalid format for reusedAttachmentIDs.' });
                }
            }

            let deletedAttachmentIDs = [];
            if (req.body.deletedAttachmentIDs) {
                try {
                    deletedAttachmentIDs = typeof req.body.deletedAttachmentIDs === 'string'
                        ? JSON.parse(req.body.deletedAttachmentIDs)
                        : req.body.deletedAttachmentIDs;
                } catch (e) {
                    console.error('[projectTracker] Failed to parse deletedAttachmentIDs:', e.message);
                }
            }

            // 1. Process permanent deletions first
            if (deletedAttachmentIDs.length > 0) {
                for (const attachmentID of deletedAttachmentIDs) {
                    const proofRes = await pool.request()
                        .input('attachmentID', sql.Int, attachmentID)
                        .input('submissionID', sql.Int, submissionID)
                        .query(`SELECT imageBlobName FROM youth_profiling_proof_attachments WHERE attachmentID = @attachmentID AND submissionID = @submissionID`);
                    
                    if (proofRes.recordset.length > 0) {
                        try {
                            await deleteBlob(container, proofRes.recordset[0].imageBlobName);
                        } catch (delErr) {
                            console.error(`[projectTracker] Failed to delete blob ${proofRes.recordset[0].imageBlobName}:`, delErr.message);
                        }
                        await pool.request()
                            .input('attachmentID', sql.Int, attachmentID)
                            .query(`DELETE FROM youth_profiling_proof_attachments WHERE attachmentID = @attachmentID`);
                    }
                }
            }

            // 2. Set isIncluded = 0 for ALL existing proofs for this submission
            await pool.request()
                .input('submissionID', sql.Int, submissionID)
                .query(`UPDATE youth_profiling_proof_attachments SET isIncluded = 0 WHERE submissionID = @submissionID AND isIncluded = 1`);

            // 3. Set isIncluded = 1 for the checked reused proofs
            if (reusedAttachmentIDs.length > 0) {
                for (const attachmentID of reusedAttachmentIDs) {
                    await pool.request()
                        .input('attachmentID', sql.Int, attachmentID)
                        .input('submissionID', sql.Int, submissionID)
                        .query(`UPDATE youth_profiling_proof_attachments SET isIncluded = 1 WHERE attachmentID = @attachmentID AND submissionID = @submissionID`);
                }
            }

            // 4. Upload newly added proofs and insert with isIncluded = 1
            const newProofs = req.files['campaign_proof_images'] || [];
            for (const img of newProofs) {
                const safe = img.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                const blobName = `CBYDP/Youth_Profile/${barangayID}/${cycleID}/Campaign_Proof/${attemptCount}/${ts}-${safe}`;
                await uploadBlob(container, blobName, img.buffer, img.mimetype);

                await pool.request()
                    .input('submissionID', sql.Int, submissionID)
                    .input('imageBlobName', sql.NVarChar(255), blobName)
                    .query(`INSERT INTO youth_profiling_proof_attachments (submissionID, imageBlobName, isIncluded) VALUES (@submissionID, @imageBlobName, 1)`);
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid annexType specified.' });
        }

        res.json({
            success: true,
            message: 'Annex replaced successfully.',
            status: sub.status,
        });

    } catch (err) {
        console.error('[projectTracker] PATCH /profiling/replace-annex error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to replace profiling document.' });
    }
});

// ---
// POST /api/project-tracker/profiling/submit-revision
// Finalizes the revision and submits it to the SK Chairperson.
// ---
router.post('/profiling/submit-revision', authMiddleware, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKS') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        
        const { submissionID } = req.body;
        if (!submissionID) return res.status(400).json({ success: false, message: 'submissionID is required.' });

        const pool = await getConnection();
        
        // Ensure all required docs are present
        const checkRes = await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .query(`
                SELECT 
                    noticeLetterBlobName, 
                    masterDatasetBlobName,
                    (SELECT COUNT(*) FROM youth_profiling_proof_attachments WHERE submissionID = @submissionID AND isIncluded = 1) AS proofCount
                FROM youth_profiling_submissions
                WHERE submissionID = @submissionID
            `);
            
        if (!checkRes.recordset.length) {
            return res.status(404).json({ success: false, message: 'Submission not found.' });
        }
        
        const row = checkRes.recordset[0];
        if (!row.noticeLetterBlobName || !row.masterDatasetBlobName || row.proofCount === 0) {
            return res.status(400).json({ success: false, message: 'Cannot submit. Missing required documents.' });
        }

        await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .query(`
                UPDATE youth_profiling_submissions 
                SET status = 'SUBMITTED', revisionComment = NULL, updatedAt = GETDATE() 
                WHERE submissionID = @submissionID AND status = 'REVISION_REQUESTED'
            `);

        res.json({ success: true, message: 'Revision submitted successfully.' });
    } catch (err) {
        console.error('[projectTracker] POST /profiling/submit-revision error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to submit revision.' });
    }
});

// ---
// CP1-4: GET /api/project-tracker/profiling/submission/:cycleID
// Returns the current profiling submission state for the active term,
// including all uploaded file references and validation status.
// ---
router.get('/profiling/submission/:cycleID', authMiddleware, async (req, res) => {
    try {
        const { cycleID } = req.params;
        const { barangay: barangayID } = req.user;

        const pool = await getConnection();

        const subRes = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, barangayID)
            .query(`
                SELECT
                    s.submissionID, s.cycleID, s.barangayID, s.attemptCount,
                    s.noticeLetterBlobName, s.noticeLetterUploadedAt,
                    s.masterDatasetBlobName, s.masterDatasetUploadedAt,
                    s.hasInformedConsentVerified, s.status,
                    s.termStart, s.termEnd, s.revisionYear, s.minorVersion,
                    s.revisionComment,
                    s.createdAt, s.updatedAt,
                    c.termID
                FROM youth_profiling_submissions s
                JOIN projectCycles c ON s.cycleID = c.cycleID
                WHERE s.cycleID = @cycleID AND s.barangayID = @barangayID
            `);

        if (!subRes.recordset.length) {
            return res.json({ success: true, data: null });
        }

        const sub = subRes.recordset[0];

        // Fetch campaign proof attachments
        const proofsRes = await pool.request()
            .input('submissionID', sql.Int, sub.submissionID)
            .query(`SELECT attachmentID, imageBlobName, isIncluded, uploadedAt FROM youth_profiling_proof_attachments WHERE submissionID = @submissionID ORDER BY uploadedAt ASC`);

        // Generate SAS URLs for documents
        const container = docContainerName;

        let noticeLetterUrl = null;
        if (sub.noticeLetterBlobName) {
            try {
                noticeLetterUrl = await generateSasUrl(container, sub.noticeLetterBlobName);
            } catch (err) {
                console.error('[projectTracker] Failed to generate SAS URL for notice letter:', err.message);
            }
        }

        let masterDatasetUrl = null;
        if (sub.masterDatasetBlobName) {
            try {
                masterDatasetUrl = await generateSasUrl(container, sub.masterDatasetBlobName);
            } catch (err) {
                console.error('[projectTracker] Failed to generate SAS URL for master dataset:', err.message);
            }
        }

        const campaignProofs = [];
        for (const proof of proofsRes.recordset) {
            let url = null;
            if (proof.imageBlobName) {
                try {
                    url = await generateSasUrl(container, proof.imageBlobName);
                } catch (err) {
                    console.error('[projectTracker] Failed to generate SAS URL for campaign proof:', err.message);
                }
            }
            campaignProofs.push({
                ...proof,
                url,
            });
        }

        // Fetch analytics if Checkpoint 1 is complete
        let analytics = null;
        if (sub.status === 'CHECKPOINT_1_COMPLETE' && sub.revisionYear) {
            const analyticsRes = await pool.request()
                .input('termID', sql.Int, sub.termID)
                .input('barangayID', sql.Int, sub.barangayID)
                .input('revisionYear', sql.Int, sub.revisionYear)
                .input('minorVersion', sql.Int, sub.minorVersion)
                .query(`
                    SELECT totalCount, maleCount, femaleCount,
                           studentCount, outOfSchoolCount, employedCount, unemployedCount,
                           childYouthCount, coreYouthCount, youngAdultCount
                    FROM youth_profile_analytics
                    WHERE termID = @termID AND barangayID = @barangayID
                      AND revisionYear = @revisionYear AND minorVersion = @minorVersion
                `);
            if (analyticsRes.recordset.length) {
                analytics = analyticsRes.recordset[0];
            }
        }

        res.json({
            success: true,
            data: {
                ...sub,
                noticeLetterUrl,
                masterDatasetUrl,
                campaignProofs,
                analytics,
            },
        });

    } catch (err) {
        console.error('[projectTracker] GET /profiling/submission error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch submission details.' });
    }
});

// ============================================================================
// CHECKPOINT 4: KK General Assembly Endpoints
// ============================================================================

const uploadFieldsKk = upload.fields([
    { name: 'attendance_sheet', maxCount: 1 },
    { name: 'kk_minutes', maxCount: 1 },
    { name: 'photo_documentation', maxCount: 20 },
]);

// Helper: get or create KK submission
async function getOrCreateKkSubmission(pool, cycleID, barangayID) {
    const existing = await pool.request()
        .input('cycleID', sql.Int, cycleID)
        .input('barangayID', sql.Int, barangayID)
        .query(`
            SELECT submissionID, status
            FROM kk_general_assembly_submissions
            WHERE cycleID = @cycleID AND barangayID = @barangayID
        `);

    if (existing.recordset.length) return existing.recordset[0];

    const created = await pool.request()
        .input('cycleID', sql.Int, cycleID)
        .input('barangayID', sql.Int, barangayID)
        .query(`
            INSERT INTO kk_general_assembly_submissions (cycleID, barangayID)
            OUTPUT INSERTED.submissionID, INSERTED.status
            VALUES (@cycleID, @barangayID)
        `);
    return created.recordset[0];
}

// CP4-1: Upload
router.post('/kk-assembly/upload', authMiddleware, uploadFieldsKk, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKS') return res.status(403).json({ success: false, message: 'Access denied. Only SKS can upload.' });
        
        const { cycleID, barangayID } = req.body;
        if (!cycleID || !barangayID) return res.status(400).json({ success: false, message: 'cycleID and barangayID are required.' });

        const pool = await getConnection();
        const cycleCheck = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, barangayID)
            .query(`SELECT cycleID FROM projectCycles WHERE cycleID = @cycleID AND barangayID = @barangayID`);

        if (!cycleCheck.recordset.length) return res.status(403).json({ success: false, message: 'Cycle does not belong to your barangay.' });

        const submission = await getOrCreateKkSubmission(pool, parseInt(cycleID), parseInt(barangayID));
        const { submissionID } = submission;

        const container = docContainerName;
        const ts = Date.now();
        const updates = {};
        const attachmentBlobs = [];

        // Upload Attendance Sheet
        const attendanceSheet = req.files['attendance_sheet']?.[0];
        if (attendanceSheet) {
            const safe = attendanceSheet.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Attendance/${ts}-${safe}`;
            await uploadBlob(container, blobName, attendanceSheet.buffer, attendanceSheet.mimetype);
            updates.attendanceSheetBlobName = blobName;
        }

        // Upload KK Minutes
        const kkMinutes = req.files['kk_minutes']?.[0];
        if (kkMinutes) {
            const safe = kkMinutes.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Minutes/${ts}-${safe}`;
            await uploadBlob(container, blobName, kkMinutes.buffer, kkMinutes.mimetype);
            updates.kkMinutesBlobName = blobName;
        }

        // Upload Photo Documentations
        const photos = req.files['photo_documentation'] || [];
        for (const img of photos) {
            const safe = img.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Photos/${ts}-${safe}`;
            await uploadBlob(container, blobName, img.buffer, img.mimetype);
            attachmentBlobs.push(blobName);
        }

        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin();

            let setClauses = ['updatedAt = GETDATE()'];
            const req2 = new sql.Request(transaction);
            req2.input('submissionID', sql.Int, submissionID);

            if (updates.attendanceSheetBlobName) {
                setClauses.push('attendanceSheetBlobName = @attendance');
                req2.input('attendance', sql.NVarChar(255), updates.attendanceSheetBlobName);
            }
            if (updates.kkMinutesBlobName) {
                setClauses.push('kkMinutesBlobName = @minutes');
                req2.input('minutes', sql.NVarChar(255), updates.kkMinutesBlobName);
            }

            await req2.query(`
                UPDATE kk_general_assembly_submissions
                SET ${setClauses.join(', ')}
                WHERE submissionID = @submissionID
            `);

            for (const blobName of attachmentBlobs) {
                const pReq = new sql.Request(transaction);
                pReq.input('subID', sql.Int, submissionID)
                    .input('blobName', sql.NVarChar(255), blobName);
                await pReq.query(`INSERT INTO kk_general_assembly_proof_attachments (submissionID, imageBlobName, isIncluded) VALUES (@subID, @blobName, 1)`);
            }

            // Auto-transition to SUBMITTED
            const checkReq = new sql.Request(transaction);
            checkReq.input('submissionID', sql.Int, submissionID);
            const checkRes = await checkReq.query(`
                SELECT attendanceSheetBlobName, kkMinutesBlobName,
                    (SELECT COUNT(*) FROM kk_general_assembly_proof_attachments WHERE submissionID = @submissionID AND isIncluded = 1) as proofCount
                FROM kk_general_assembly_submissions WHERE submissionID = @submissionID
            `);

            let finalStatus = 'INCOMPLETE';
            if (checkRes.recordset.length) {
                const row = checkRes.recordset[0];
                if (row.attendanceSheetBlobName && row.kkMinutesBlobName && row.proofCount > 0) {
                    finalStatus = 'SUBMITTED';
                    const transitionReq = new sql.Request(transaction);
                    transitionReq.input('submissionID', sql.Int, submissionID);
                    await transitionReq.query(`
                        UPDATE kk_general_assembly_submissions 
                        SET status = 'SUBMITTED', updatedAt = GETDATE() 
                        WHERE submissionID = @submissionID AND status IN ('INCOMPLETE', 'REVISION_REQUESTED')
                    `);
                }
            }

            await transaction.commit();

            // Notify all connected clients in the project room that documents have been submitted.
            // This allows the SKC's view to update in real-time without a manual page refresh.
            if (finalStatus === 'SUBMITTED') {
                broadcastToRoom(cycleID.toString(), {
                    type: 'kk_assembly_submitted',
                    cycleID: parseInt(cycleID),
                });
            }

            res.json({ success: true, message: 'Files uploaded successfully.', status: finalStatus });

        } catch (dbErr) {
            await transaction.rollback();
            if (updates.attendanceSheetBlobName) await deleteBlob(container, updates.attendanceSheetBlobName).catch(console.error);
            if (updates.kkMinutesBlobName) await deleteBlob(container, updates.kkMinutesBlobName).catch(console.error);
            for (const blob of attachmentBlobs) await deleteBlob(container, blob).catch(console.error);
            throw dbErr;
        }

    } catch (err) {
        console.error('[projectTracker] POST /kk-assembly/upload error:', err.message);
        res.status(500).json({ success: false, message: 'File upload failed.' });
    }
});

// CP4-2: Validate
router.post('/kk-assembly/validate', authMiddleware, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKC') return res.status(403).json({ success: false, message: 'Access denied.' });
        
        const { submissionID } = req.body;
        const { barangay: barangayID } = req.user;

        if (!submissionID) return res.status(400).json({ success: false, message: 'submissionID required.' });

        const pool = await getConnection();
        const subRes = await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .input('barangayID', sql.Int, barangayID)
            .query(`SELECT s.* FROM kk_general_assembly_submissions s WHERE s.submissionID = @submissionID AND s.barangayID = @barangayID`);

        if (!subRes.recordset.length) return res.status(404).json({ success: false, message: 'Not found.' });
        const sub = subRes.recordset[0];

        if (!sub.attendanceSheetBlobName || !sub.kkMinutesBlobName) {
            return res.status(400).json({ success: false, message: 'Cannot approve: Missing documents.' });
        }

        await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .query(`
                UPDATE kk_general_assembly_submissions
                SET status = 'CHECKPOINT_4_COMPLETE', revisionComment = NULL, updatedAt = GETDATE()
                WHERE submissionID = @submissionID
            `);

        const cycleRes = await pool.request()
            .input('cycleID', sql.Int, sub.cycleID)
            .query(`SELECT cycleID, currentStatusID FROM projectCycles WHERE cycleID = @cycleID`);

        if (cycleRes.recordset.length > 0 && cycleRes.recordset[0].currentStatusID === 4) {
            const cID = cycleRes.recordset[0].cycleID;
            await pool.request()
                .input('cycleID', sql.Int, cID)
                .query(`UPDATE projectCycles SET currentStatusID = 5, updatedAt = GETDATE() WHERE cycleID = @cycleID`);

            await pool.request()
                .input('cycleID', sql.Int, cID)
                .input('updatedBy', sql.Int, req.user.userID)
                .query(`INSERT INTO projectTracker (cycleID, statusID, updatedBy) VALUES (@cycleID, 5, @updatedBy)`);
                
            broadcastToRoom(cID.toString(), { type: 'checkpoint_updated', statusID: 5 });
        }

        res.json({ success: true, message: 'KK General Assembly validated. Project advanced to Checkpoint 5.' });
    } catch (err) {
        console.error('[projectTracker] POST /kk-assembly/validate error:', err.message);
        res.status(500).json({ success: false, message: 'Validation failed.' });
    }
});

// CP4-3: Request Revision
router.post('/kk-assembly/request-revision', authMiddleware, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKC') return res.status(403).json({ success: false, message: 'Access denied.' });
        const { submissionID, comment } = req.body;
        
        if (!submissionID || !comment || !comment.trim()) return res.status(400).json({ success: false, message: 'Missing comment.' });

        const pool = await getConnection();
        await pool.request()
            .input('submissionID', sql.Int, submissionID)
            .input('comment', sql.NVarChar(sql.MAX), comment.trim())
            .query(`
                UPDATE kk_general_assembly_submissions
                SET status = 'REVISION_REQUESTED', revisionComment = @comment, updatedAt = GETDATE()
                WHERE submissionID = @submissionID;

                UPDATE kk_general_assembly_proof_attachments
                SET isIncluded = 0 WHERE submissionID = @submissionID;
            `);

        res.json({ success: true, message: 'Revision requested.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to request revision.' });
    }
});

// CP4-4: Replace Annex
router.patch('/kk-assembly/replace-annex', authMiddleware, uploadFieldsKk, async (req, res) => {
    try {
        const role = req.user.position;
        if (role !== 'Admin' && role !== 'SKS') return res.status(403).json({ success: false, message: 'Access denied.' });
        const { cycleID, barangayID, annexType } = req.body;

        const pool = await getConnection();
        const subRes = await pool.request()
            .input('cycleID', sql.Int, cycleID)
            .input('barangayID', sql.Int, barangayID)
            .query(`SELECT * FROM kk_general_assembly_submissions WHERE cycleID = @cycleID AND barangayID = @barangayID`);

        if (!subRes.recordset.length) return res.status(404).json({ success: false, message: 'Not found.' });
        const sub = subRes.recordset[0];
        const container = docContainerName;
        const ts = Date.now();

        if (annexType === 'attendanceSheet') {
            const file = req.files['attendance_sheet']?.[0];
            if (!file) return res.status(400).json({ success: false, message: 'File required.' });
            if (sub.attendanceSheetBlobName) await deleteBlob(container, sub.attendanceSheetBlobName).catch(console.error);
            const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Attendance/${ts}-${safe}`;
            await uploadBlob(container, blobName, file.buffer, file.mimetype);
            await pool.request().input('subID', sql.Int, sub.submissionID).input('blob', sql.NVarChar(255), blobName)
                .query(`UPDATE kk_general_assembly_submissions SET attendanceSheetBlobName = @blob, updatedAt = GETDATE() WHERE submissionID = @subID`);
        } else if (annexType === 'kkMinutes') {
            const file = req.files['kk_minutes']?.[0];
            if (!file) return res.status(400).json({ success: false, message: 'File required.' });
            if (sub.kkMinutesBlobName) await deleteBlob(container, sub.kkMinutesBlobName).catch(console.error);
            const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const blobName = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Minutes/${ts}-${safe}`;
            await uploadBlob(container, blobName, file.buffer, file.mimetype);
            await pool.request().input('subID', sql.Int, sub.submissionID).input('blob', sql.NVarChar(255), blobName)
                .query(`UPDATE kk_general_assembly_submissions SET kkMinutesBlobName = @blob, updatedAt = GETDATE() WHERE submissionID = @subID`);
        } else if (annexType === 'photoDocs') {
            let reusedAttachmentIDs = req.body.reusedAttachmentIDs ? JSON.parse(req.body.reusedAttachmentIDs) : [];
            let deletedAttachmentIDs = req.body.deletedAttachmentIDs ? JSON.parse(req.body.deletedAttachmentIDs) : [];

            if (deletedAttachmentIDs.length > 0) {
                for (const aID of deletedAttachmentIDs) {
                    const proofRes = await pool.request().input('aID', sql.Int, aID).input('subID', sql.Int, sub.submissionID)
                        .query(`SELECT imageBlobName FROM kk_general_assembly_proof_attachments WHERE attachmentID = @aID AND submissionID = @subID`);
                    if (proofRes.recordset.length > 0) {
                        await deleteBlob(container, proofRes.recordset[0].imageBlobName).catch(console.error);
                        await pool.request().input('aID', sql.Int, aID).query(`DELETE FROM kk_general_assembly_proof_attachments WHERE attachmentID = @aID`);
                    }
                }
            }

            await pool.request().input('subID', sql.Int, sub.submissionID)
                .query(`UPDATE kk_general_assembly_proof_attachments SET isIncluded = 0 WHERE submissionID = @subID AND isIncluded = 1`);
            
            for (const aID of reusedAttachmentIDs) {
                await pool.request().input('aID', sql.Int, aID).input('subID', sql.Int, sub.submissionID)
                    .query(`UPDATE kk_general_assembly_proof_attachments SET isIncluded = 1 WHERE attachmentID = @aID AND submissionID = @subID`);
            }

            const newProofs = req.files['photo_documentation'] || [];
            for (const img of newProofs) {
                const safe = img.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
                const blobName = `CBYDP/KK_Assembly/${barangayID}/${cycleID}/Photos/${ts}-${safe}`;
                await uploadBlob(container, blobName, img.buffer, img.mimetype);
                await pool.request().input('subID', sql.Int, sub.submissionID).input('blob', sql.NVarChar(255), blobName)
                    .query(`INSERT INTO kk_general_assembly_proof_attachments (submissionID, imageBlobName, isIncluded) VALUES (@subID, @blob, 1)`);
            }
        }
        res.json({ success: true, message: 'Annex replaced successfully.', status: sub.status });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to replace.' });
    }
});

// CP4-5: Submit Revision
router.post('/kk-assembly/submit-revision', authMiddleware, async (req, res) => {
    try {
        const { submissionID } = req.body;
        const pool = await getConnection();
        await pool.request().input('subID', sql.Int, submissionID)
            .query(`UPDATE kk_general_assembly_submissions SET status = 'SUBMITTED', revisionComment = NULL, updatedAt = GETDATE() WHERE submissionID = @subID AND status = 'REVISION_REQUESTED'`);
        res.json({ success: true, message: 'Revision submitted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to submit.' });
    }
});

// CP4-6: GET Submission
router.get('/kk-assembly/submission/:cycleID', authMiddleware, async (req, res) => {
    try {
        const { cycleID } = req.params;
        const { barangay: barangayID } = req.user;
        const pool = await getConnection();

        const subRes = await pool.request().input('cycleID', sql.Int, cycleID).input('barangayID', sql.Int, barangayID)
            .query(`SELECT * FROM kk_general_assembly_submissions WHERE cycleID = @cycleID AND barangayID = @barangayID`);

        if (!subRes.recordset.length) return res.json({ success: true, data: null });
        const sub = subRes.recordset[0];

        const container = docContainerName;
        let attendanceSheetUrl = sub.attendanceSheetBlobName ? await generateSasUrl(container, sub.attendanceSheetBlobName).catch(()=>null) : null;
        let kkMinutesUrl = sub.kkMinutesBlobName ? await generateSasUrl(container, sub.kkMinutesBlobName).catch(()=>null) : null;

        const proofsRes = await pool.request().input('subID', sql.Int, sub.submissionID)
            .query(`SELECT * FROM kk_general_assembly_proof_attachments WHERE submissionID = @subID ORDER BY uploadedAt ASC`);
        
        const photoDocs = [];
        for (const proof of proofsRes.recordset) {
            photoDocs.push({
                ...proof,
                url: proof.imageBlobName ? await generateSasUrl(container, proof.imageBlobName).catch(()=>null) : null
            });
        }

        res.json({ success: true, data: { ...sub, attendanceSheetUrl, kkMinutesUrl, photoDocs } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch.' });
    }
});

module.exports = router;
