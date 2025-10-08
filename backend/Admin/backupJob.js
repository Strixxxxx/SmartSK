const { getConnection, sql } = require('../database/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new job in the database.
 * @param {object} details - Job details (backupType, initiatedBy, userId).
 * @returns {Promise<string>} The newly created job ID.
 */
const createJob = async (details = {}) => {
    const jobId = uuidv4();
    const pool = await getConnection();
    
    await pool.request()
        .input('JobID', sql.NVarChar(50), jobId)
        .input('BackupType', sql.NVarChar(20), details.backupType || 'cloud-only')
        .input('Status', sql.NVarChar(20), 'pending')
        .input('Message', sql.NVarChar(500), 'Backup job has been queued.')
        .input('CreatedBy', sql.NVarChar(100), details.initiatedBy || 'System')
        .input('UserID', sql.Int, details.userId || null)
        .input('ExpiresAt', sql.DateTime2, new Date(Date.now() + 24 * 60 * 60 * 1000)) // Expires in 24 hours
        .query(`
            INSERT INTO BackupJobs (JobID, BackupType, Status, Message, CreatedBy, UserID, ExpiresAt, CreatedAt, UpdatedAt)
            VALUES (@JobID, @BackupType, @Status, @Message, @CreatedBy, @UserID, @ExpiresAt, GETDATE(), GETDATE())
        `);
    
    console.log(`[Job ${jobId}] Created in database: ${JSON.stringify(details)}`);
    return jobId;
};

/**
 * Retrieves a job by its ID from the database.
 * @param {string} jobId - The ID of the job to retrieve.
 * @returns {Promise<object | undefined>} The job object or undefined if not found.
 */
const getJob = async (jobId) => {
    const pool = await getConnection();
    const result = await pool.request()
        .input('JobID', sql.NVarChar(50), jobId)
        .query('SELECT * FROM BackupJobs WHERE JobID = @JobID');
    
    return result.recordset[0];
};

/**
 * Updates the status and other properties of a job in the database.
 * @param {string} jobId - The ID of the job to update.
 * @param {string} status - The new status (e.g., 'processing', 'completed', 'failed').
 * @param {string} message - A descriptive message for the current status.
 * @param {object} data - Additional data to merge into the job object (e.g., result, error).
 */
const updateJob = async (jobId, status, message, data = {}) => {
    const pool = await getConnection();
    const request = pool.request()
        .input('JobID', sql.NVarChar(50), jobId)
        .input('Status', sql.NVarChar(20), status)
        .input('Message', sql.NVarChar(500), message)
        .input('UpdatedAt', sql.DateTime2, new Date());

    let updateFields = ['Status = @Status', 'Message = @Message', 'UpdatedAt = @UpdatedAt'];

    // Handle ErrorMessage
    if (data.ErrorMessage) {
        request.input('ErrorMessage', sql.NVarChar(sql.MAX), data.ErrorMessage);
        updateFields.push('ErrorMessage = @ErrorMessage');
    }
    
    // Handle direct properties instead of nested 'result' object
    if (data.FileName) {
        request.input('FileName', sql.NVarChar(255), data.FileName);
        updateFields.push('FileName = @FileName');
    }
    
    if (data.FilePath) {
        request.input('FilePath', sql.NVarChar(500), data.FilePath);
        updateFields.push('FilePath = @FilePath');
    }
    
    if (data.BlobName) {
        request.input('BlobName', sql.NVarChar(255), data.BlobName);
        updateFields.push('BlobName = @BlobName');
    }

    if (status === 'processing' && !data.processing) {
        request.input('StartedAt', sql.DateTime2, new Date());
        updateFields.push('StartedAt = @StartedAt');
    }
    
    if (status === 'completed' || status === 'failed') {
        request.input('CompletedAt', sql.DateTime2, new Date());
        updateFields.push('CompletedAt = @CompletedAt');
        updateFields.push('Duration = DATEDIFF(SECOND, StartedAt, GETDATE())');
    }

    await request.query(`UPDATE BackupJobs SET ${updateFields.join(', ')} WHERE JobID = @JobID`);
    
    console.log(`[Job ${jobId}] Updated in database to ${status}: ${message}`);
};

/**
 * Periodically cleans up old, completed, or failed jobs from the database.
 */
const cleanupJobs = async () => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .query(`
                DELETE FROM BackupJobs 
                WHERE ExpiresAt < GETDATE() 
                AND Status IN ('completed', 'failed')
            `);
        
        if (result.rowsAffected[0] > 0) {
            console.log(`[Cleanup] Removed ${result.rowsAffected[0]} expired job(s) from database.`);
        }
    } catch (error) {
        console.error('[Cleanup] Error removing expired jobs:', error);
    }
};

// Run cleanup every hour
setInterval(cleanupJobs, 60 * 60 * 1000);

console.log('Job management system initialized with database storage.');

module.exports = {
    createJob,
    getJob,
    updateJob,
};
