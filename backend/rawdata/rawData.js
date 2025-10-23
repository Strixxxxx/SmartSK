const express = require('express');
const router = express.Router();
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getConnection, sql } = require('../database/database');
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');
const { authMiddleware } = require('../session/session'); // Import authMiddleware
const { addAuditTrail } = require('../audit/auditService');

// Multer setup for CSV file upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only .csv files are allowed.'), false);
        }
    }
}).single('file');

/**
 * Helper function to extract years from CSV headers
 */
const extractYearsFromHeaders = (headers) => {
    const years = new Set();
    const yearPattern = /\b(20\d{2})\b/g; // Matches years like 2023, 2024, etc.
    
    headers.forEach(header => {
        const matches = header.match(yearPattern);
        if (matches) {
            matches.forEach(year => years.add(parseInt(year)));
        }
    });
    
    return Array.from(years).sort();
};

/**
 * Helper function to get next available dataID range
 */
const getNextDataIDRange = async (transaction) => {
    const result = await transaction.request()
        .query('SELECT ISNULL(MAX(dataID), 0) as maxID FROM rawData');
    
    const currentMaxID = result.recordset[0].maxID;
    const dataIDStart = currentMaxID + 1;
    
    return { dataIDStart };
};

/**
 * @route   GET /api/rawdata/options
 * @desc    Get available filter options (committees, categories)
 * @access  Private
 */
router.get('/options', async (req, res) => {
    try {
        const pool = await getConnection();
        
        // Get distinct committees
        const committeesResult = await pool.request().query(
            'SELECT DISTINCT committee FROM rawDataDetails WHERE committee IS NOT NULL AND committee != \'\' ORDER BY committee'
        );
        
        // Get distinct categories
        const categoriesResult = await pool.request().query(
            'SELECT DISTINCT category FROM rawDataDetails WHERE category IS NOT NULL AND category != \'\' ORDER BY category'
        );
        
        res.json({
            committees: committeesResult.recordset.map(row => row.committee),
            categories: categoriesResult.recordset.map(row => row.category)
        });
        
    } catch (err) {
        console.error('Error fetching options');
        res.status(500).json({
            error: 'Server Error',
            message: err.message
        });
    }
});

/**
 * @route   GET /api/rawdata
 * @desc    Get raw data with compact year-in-cell format
 * @access  Private
 */
router.get('/', async (req, res) => {
    const { ppa, committee, category } = req.query;

    try {
        const pool = await getConnection();
        console.log('Raw data request with filters');

        // Get all distinct years for the frontend, which expects a list of years
        const yearsResult = await pool.request().query('SELECT DISTINCT year FROM rawData WHERE year IS NOT NULL ORDER BY year');
        const years = yearsResult.recordset.map(row => row.year);

        // Execute the stored procedure
        const request = pool.request();
        request.input('ppaFilter', sql.NVarChar, ppa || null);
        request.input('committeeFilter', sql.NVarChar, committee || null);
        request.input('categoryFilter', sql.NVarChar, category || null);

        const result = await request.execute('[Raw Data]');
        
        console.log('Stored procedure result count');

        const responseData = {
            data: result.recordset,
            years: years,
            totalCount: result.recordset.length,
            filters: { ppa, committee, category }
        };
        
        res.json(responseData);

    } catch (err) {
        console.error('Error fetching raw data');
        res.status(500).json({
            error: 'Server Error',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

/**
 * @route   POST /api/rawdata/upload
 * @desc    Upload and process CSV file to update rawData with proper tracking
 * @access  Private
 */
router.post('/upload', authMiddleware, (req, res) => { // Added authMiddleware
    upload(req, res, async (err) => {
        if (err) {
            console.error('Multer error');
            return res.status(400).json({
                message: err.message,
                error: 'File upload error'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        console.log('Processing uploaded file');

        const results = [];
        const headers = [];
        let headersExtracted = false;
        
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        bufferStream
            .pipe(csv())
            .on('headers', (headerList) => {
                headers.push(...headerList);
                headersExtracted = true;
                console.log('CSV headers extracted');
            })
            .on('data', (data) => {
                // Clean up the data keys (remove extra spaces and normalize)
                const cleanedData = {};
                Object.keys(data).forEach(key => {
                    const cleanKey = key.trim();
                    cleanedData[cleanKey] = data[key] ? data[key].toString().trim() : '';
                });
                results.push(cleanedData);
            })
            .on('end', async () => {
                console.log('Parsed rows from CSV');
                
                if (results.length === 0) {
                    return res.status(400).json({
                        message: 'No valid data found in CSV file.',
                        error: 'Empty CSV'
                    });
                }

                // Extract years from headers
                const detectedYears = extractYearsFromHeaders(headers);
                console.log('Detected years from headers');
                
                if (detectedYears.length === 0) {
                    return res.status(400).json({
                        message: 'No valid years found in CSV headers.',
                        error: 'Invalid CSV format'
                    });
                }

                const yearStart = Math.min(...detectedYears);
                const yearEnd = Math.max(...detectedYears);

                let transaction;
                try {
                    const pool = await getConnection();
                    
                    const userInfo = {
                        userID: req.user.userID,
                        fullName: req.user.fullName,
                        barangay: req.user.barangayName
                    };
                    console.log('User info retrieved from auth middleware');

                    if (!userInfo || !userInfo.barangay) {
                        throw new Error('User has no assigned barangay/portal. Cannot process upload.');
                    }

                    transaction = new sql.Transaction(pool);
                    await transaction.begin();

                    let processedCount = 0;
                    let errorCount = 0;
                    let totalInserts = 0;
                    const errors = [];

                    const { dataIDStart } = await getNextDataIDRange(transaction);
                    console.log('Starting dataID will be set');

                    for (let i = 0; i < results.length; i++) {
                        const row = results[i];
                        
                        const ppa = row.PPA || row.ppa || row['Project/Program/Activity'] || '';
                        const category = row.Category || row.category || '';
                        const committee = row.Committee || row.committee || '';
                        
                        if (!ppa) {
                            errors.push(`Row ${i + 1}: Missing PPA`);
                            errorCount++;
                            continue;
                        }

                        let rddResult = await new sql.Request(transaction)
                            .input('ppa', sql.NVarChar, ppa)
                            .input('category', sql.NVarChar, category)
                            .input('committee', sql.NVarChar, committee)
                            .query('SELECT rddID FROM rawDataDetails WHERE ppa = @ppa AND category = @category AND committee = @committee');

                        let rddID;
                        if (rddResult.recordset.length > 0) {
                            rddID = rddResult.recordset[0].rddID;
                        } else {
                            const insertRddResult = await new sql.Request(transaction)
                                .input('ppa', sql.NVarChar, ppa)
                                .input('category', sql.NVarChar, category)
                                .input('committee', sql.NVarChar, committee)
                                .query('INSERT INTO rawDataDetails (ppa, category, committee) OUTPUT INSERTED.rddID VALUES (@ppa, @category, @committee)');
                            rddID = insertRddResult.recordset[0].rddID;
                        }

                        for (const year of detectedYears) {
                            const targetColumns = headers.filter(h => h.toLowerCase().includes('target') && h.includes(year.toString()));
                            const budgetColumns = headers.filter(h => h.toLowerCase().includes('budget') && h.includes(year.toString()));

                            let target = row[targetColumns[0]] || '';
                            let budgetStr = row[budgetColumns[0]] || '';
                            const budget = budgetStr ? parseInt(budgetStr.toString().replace(/,/g, '')) : null;

                            if (!target && !budget) continue;

                            await new sql.Request(transaction)
                                .input('rddID', sql.Int, rddID)
                                .input('year', sql.Int, year)
                                .query('DELETE FROM rawData WHERE rddID = @rddID AND year = @year');

                            const insertRequest = new sql.Request(transaction);
                            insertRequest.input('rddID', sql.Int, rddID);
                            insertRequest.input('year', sql.Int, year);
                            insertRequest.input('target', sql.NVarChar, target || null);
                            insertRequest.input('budget', sql.Int, budget);
                            await insertRequest.query('INSERT INTO rawData (rddID, year, target, budget) VALUES (@rddID, @year, @target, @budget)');
                            totalInserts++;
                        }
                        processedCount++;
                    }

                    const finalRangeResult = await transaction.request().query('SELECT ISNULL(MAX(dataID), 0) as maxID FROM rawData');
                    const actualDataIDEnd = finalRangeResult.recordset[0].maxID;

                    const trackRequest = new sql.Request(transaction);
                    trackRequest.input('dataIDStart', sql.Int, dataIDStart);
                    trackRequest.input('dataIDEnd', sql.Int, actualDataIDEnd);
                    trackRequest.input('yearStart', sql.Int, yearStart);
                    trackRequest.input('yearEnd', sql.Int, yearEnd);
                    trackRequest.input('portal', sql.NVarChar, userInfo.barangay);
                    trackRequest.input('dateUpload', sql.DateTime, new Date());
                    await trackRequest.query('INSERT INTO rawDataTrack (dataIDStart, dataIDEnd, yearStart, yearEnd, portal, dateUpload) VALUES (@dataIDStart, @dataIDEnd, @yearStart, @yearEnd, @portal, @dateUpload)');

                    await transaction.commit();

                    addAuditTrail({
                        actor: 'A',
                        module: 'Z',
                        userID: userInfo.userID,
                        actions: 'Update',
                        oldValue: null,
                        newValue: `File: ${req.file.originalname}`,
                        descriptions: `Admin ${userInfo.fullName} updated the raw data via CSV upload.`
                    });
                    
                    const responseMessage = {
                        message: 'CSV file processed successfully.',
                        summary: {
                            totalRows: results.length,
                            processedRows: processedCount,
                            errorRows: errorCount,
                            totalInserts: totalInserts,
                            yearsProcessed: detectedYears,
                            yearRange: `${yearStart} - ${yearEnd}`,
                            uploadedBy: userInfo.fullName,
                            barangay: userInfo.barangay,
                            errors: errors.slice(0, 10)
                        }
                    };

                    if (errorCount > 0) {
                        responseMessage.warning = `${errorCount} rows had errors and were skipped.`;
                    }

                    res.status(200).json(responseMessage);
                    
                } catch (dbErr) {
                    if (transaction) await transaction.rollback();
                    console.error('Transaction or DB Error', dbErr);
                    res.status(500).json({
                        message: 'Failed to process CSV file due to a database error.', 
                        error: dbErr.message 
                    });
                }
            })
            .on('error', (parseErr) => {
                console.error('CSV Parse Error');
                res.status(400).json({
                    message: 'Failed to parse CSV file.', 
                    error: parseErr.message 
                });
            });
    });
});

/**
 * @route   GET /api/rawdata/download
 * @desc    Download raw data in specified format (CSV, Excel)
 * @access  Private
 */
router.get('/download', async (req, res) => {
    const { format = 'csv', ppa, committee, category } = req.query;
    
    try {
        const pool = await getConnection();
        
        // Get years for dynamic columns, which are needed for the CSV headers
        const yearsResult = await pool.request().query('SELECT DISTINCT year FROM rawData ORDER BY year');
        const years = yearsResult.recordset.map(row => row.year);
        
        // Execute stored procedure with filters
        const request = pool.request();
        request.input('ppaFilter', sql.NVarChar, ppa || null);
        request.input('committeeFilter', sql.NVarChar, committee || null);
        request.input('categoryFilter', sql.NVarChar, category || null);

        const result = await request.execute('[Raw Data]');
        
        if (format === 'csv' || format === 'excel') {
            // Generate CSV
            let csvContent = 'PPA,Category,Committee';
            years.forEach(year => {
                csvContent += `,Target ${year},Budget ${year}`;
            });
            csvContent += '\n';
            
            result.recordset.forEach(row => {
                let rowContent = `"${row.ppa || ''}","${row.category || ''}","${row.committee || ''}"`;
                years.forEach(year => {
                    const target = row[`${year}_target`] || '';
                    const budget = row[`${year}_budget`] || '';
                    rowContent += `,"${target}","${budget}"`;
                });
                csvContent += rowContent + '\n';
            });
            
            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="raw_data_export.csv"');
            } else {
                res.setHeader('Content-Type', 'application/vnd.ms-excel');
                res.setHeader('Content-Disposition', 'attachment; filename="raw_data_export.xls"');
            }
            res.send(csvContent);
        } else {
            res.status(400).json({ message: 'Unsupported format. Supported formats: csv, excel' });
        }
        
    } catch (err) {
        console.error('Error downloading data');
        res.status(500).json({
            error: 'Server Error',
            message: err.message
        });
    }
});

/**
 * @route   GET /api/rawdata/tracking
 * @desc    Get upload tracking history with timezone conversion
 * @access  Private
 */
router.get('/tracking', async (req, res) => {
    try {
        const pool = await getConnection();
        
        const query = `
            SELECT 
                trackID,
                dataIDStart,
                dataIDEnd,
                yearStart,
                yearEnd,
                portal,
                dateUpload
            FROM rawDataTrack
            ORDER BY dateUpload DESC
        `;
        
        const result = await pool.request().query(query);
        
        // Convert UTC dates to Philippine Standard Time (GMT+8) for display
        const trackingData = result.recordset.map(record => ({
            ...record,
            dateUpload: new Date(record.dateUpload).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
        }));
        
        res.json({
            data: trackingData,
            totalCount: trackingData.length
        });
        
    } catch (err) {
        console.error('Error fetching tracking data');
        res.status(500).json({
            error: 'Server Error',
            message: err.message
        });
    }
});

module.exports = router;
