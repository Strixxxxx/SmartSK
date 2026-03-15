const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/database');
const { generateSasUrl, docContainerName, listBlobsWithProperties } = require('../Storage/storage');

// Helper to fetch batches with finalized status (City Approval = 6, Procurement = 7, Execution = 8, Closure = 9)
// The prompt states "finalized ABYIP and CBYDP projects". I will consider status >= 6 as finalized/public.
router.get('/', async (req, res) => {
    try {
        const { barangay, type } = req.query;
        const pool = await getConnection();
        const request = pool.request();

        let query = `
            SELECT 
                pb.batchID, pb.barangayID, pb.projType, pb.projName, pb.targetYear, pb.budget,
                pb.createdAt,
                b.barangayName,
                sl.StatusID, sl.StatusName,
                st.isCurrent, st.termID
            FROM projectBatch pb
            JOIN barangays b ON pb.barangayID = b.barangayID
            LEFT JOIN skTerms st ON pb.termID = st.termID
            CROSS APPLY (
                SELECT TOP 1 pt.statusID 
                FROM projectTracker pt 
                WHERE pt.batchID = pb.batchID 
                ORDER BY pt.updatedAt DESC
            ) latestStatus
            JOIN StatusLookup sl ON latestStatus.statusID = sl.StatusID
            WHERE pb.isArchived = 0 AND sl.StatusID >= 6
        `;

        if (barangay) {
            request.input('barangayName', sql.NVarChar, barangay);
            query += ' AND b.barangayName = @barangayName';
        }

        if (type && (type === 'ABYIP' || type === 'CBYDP')) {
            request.input('projType', sql.NVarChar, type);
            query += ' AND pb.projType = @projType';
        }

        // Ordering is partially handled here, but grouped frontend side for nested requirement
        query += ' ORDER BY st.isCurrent DESC, st.termID DESC, pb.projType DESC, pb.targetYear DESC;';

        const result = await request.query(query);
        res.status(200).json({ success: true, data: result.recordset });

    } catch (error) {
        console.error('Error fetching disclosures:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch disclosures.' });
    }
});

// Fetch detailed rows for a specific batch disclosure
router.get('/:batchID/details', async (req, res) => {
    try {
        const { batchID } = req.params;
        const pool = await getConnection();

        // Ensure it exists and is finalized
        const batchCheck = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query(`
                SELECT pb.batchID, pb.projType, pb.projName, pb.targetYear, pb.budget, b.barangayName
                FROM projectBatch pb
                JOIN barangays b ON pb.barangayID = b.barangayID
                CROSS APPLY (
                    SELECT TOP 1 pt.statusID 
                    FROM projectTracker pt 
                    WHERE pt.batchID = pb.batchID 
                    ORDER BY pt.updatedAt DESC
                ) latestStatus
                WHERE pb.batchID = @batchID AND pb.isArchived = 0 AND latestStatus.statusID >= 6
            `);

        if (!batchCheck.recordset.length) {
            return res.status(404).json({ success: false, message: 'Public disclosure not found or not finalized.' });
        }

        const batchInfo = batchCheck.recordset[0];
        let details = {
            batchInfo,
            agenda: null,
            rows: []
        };

        if (batchInfo.projType === 'ABYIP') {
            const rowsRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query(`
                    SELECT referenceCode, centerOfParticipation, PPA, [Description], expectedResult,
                           performanceIndicator, period, PS, MOOE, CO, total, personResponsible
                    FROM projectABYIP
                    WHERE projbatchID = @batchID
                    ORDER BY abyipID ASC
                `);
            details.rows = rowsRes.recordset;
        } else {
            // CBYDP
            const agendaRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query('SELECT * FROM projectAgenda WHERE batchID = @batchID');
            
            if (agendaRes.recordset.length) {
                details.agenda = agendaRes.recordset[0];
            }

            const rowsRes = await pool.request()
                .input('batchID', sql.Int, batchID)
                .query(`
                    SELECT centerOfParticipation, sectionType, YDC, objective, performanceIndicator, 
                           target1, target2, target3, PPAs, budget, personResponsible
                    FROM projectCBYDP
                    WHERE projbatchID = @batchID
                    ORDER BY cbydpID ASC
                `);
            details.rows = rowsRes.recordset;
        }

        res.status(200).json({ success: true, data: details });

    } catch (error) {
        console.error('Error fetching disclosure details:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch disclosure details.' });
    }
});

// Fetch documents for a specific batch (Public)
router.get('/:batchID/documents', async (req, res) => {
    try {
        const { batchID } = req.params;
        const pool = await getConnection();
        
        const projectRes = await pool.request()
            .input('batchID', sql.Int, batchID)
            .query('SELECT projName, projType FROM projectBatch WHERE batchID = @batchID');
        
        if (projectRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        const { projName, projType } = projectRes.recordset[0];
        
        const PROJECT_CATEGORIES = {
            ABYIP: ['PPMP_or_APP', 'Activity_Design', 'SK_Resolution'],
            CBYDP: ['LYDP', 'KK_Minutes', 'Youth_Profile'],
        };

        // Match normalized type
        let mappedType = '';
        if (projType.includes('ABYIP')) mappedType = 'ABYIP';
        else if (projType.includes('CBYDP')) mappedType = 'CBYDP';

        const categories = PROJECT_CATEGORIES[mappedType];
        if (!categories) {
            return res.status(400).json({ success: false, message: `Invalid project type: ${projType}` });
        }

        const documents = {};
        
        for (const category of categories) {
            let prefix = `${projType}/${category}/${projName}/`;
            let blobs = await listBlobsWithProperties(docContainerName, { prefix });
            
            // Fallback 1: If no blobs found and projName has NO extension, try with .xlsx suffix
            if (blobs.length === 0 && !projName.includes('.')) {
                const altPrefix = `${projType}/${category}/${projName}.xlsx/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix });
            }
            
            // Fallback 2: If still no blobs and projName HAS an extension, try stripping it
            if (blobs.length === 0 && projName.includes('.')) {
                const strippedName = projName.split('.').slice(0, -1).join('.');
                const altPrefix2 = `${projType}/${category}/${strippedName}/`;
                blobs = await listBlobsWithProperties(docContainerName, { prefix: altPrefix2 });
            }
            
            documents[category] = await Promise.all(blobs.map(async (blob) => {
                const url = await generateSasUrl(docContainerName, blob.name);
                return {
                    name: blob.name.split('/').pop(),
                    path: blob.name,
                    url: url,
                    size: blob.properties.contentLength,
                    lastModified: blob.properties.lastModified
                };
            }));
        }

        res.json({ success: true, data: { projName, projType, categories: documents } });
    } catch (error) {
        console.error('Error fetching public documents:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch documents' });
    }
});

module.exports = router;
