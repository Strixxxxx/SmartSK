const { getConnection, sql } = require('../database/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new post upload job in the database.
 * @param {object} details - Job details (title, description, initiatedBy, userId).
 * @returns {Promise<string>} The newly created job ID.
 */
const createJob = async (details = {}) => {
    const jobId = uuidv4();
    const pool = await getConnection();
    
    await pool.request()
        .input('JobID', sql.NVarChar(50), jobId)
        .input('JobType', sql.NVarChar(20), 'PostUpload')
        .input('Status', sql.NVarChar(20), 'pending')
        .input('Message', sql.NVarChar(500), 'Post creation job has been queued.')
        .input('Payload', sql.NVarChar(sql.MAX), JSON.stringify({ title: details.title, description: details.description }))
        .input('CreatedBy', sql.NVarChar(100), details.initiatedBy || 'System')
        .input('UserID', sql.Int, details.userId || null)
        .input('ExpiresAt', sql.DateTime2, new Date(Date.now() + 24 * 60 * 60 * 1000)) // Expires in 24 hours
        .query(`
            INSERT INTO PostUploadJobs (JobID, JobType, Status, Message, Payload, CreatedBy, UserID, ExpiresAt, CreatedAt, UpdatedAt)
            VALUES (@JobID, @JobType, @Status, @Message, @Payload, @CreatedBy, @UserID, @ExpiresAt, GETDATE(), GETDATE())
        `);
    
    console.log(`[Job ${jobId}] Created in database for PostUpload: ${JSON.stringify(details)}`);
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
        .query('SELECT * FROM PostUploadJobs WHERE JobID = @JobID');
    
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

    if (status === 'processing' && !await getJob(jobId).StartedAt) {
        request.input('StartedAt', sql.DateTime2, new Date());
        updateFields.push('StartedAt = @StartedAt');
    }

    if (data.ErrorMessage) {
        request.input('ErrorMessage', sql.NVarChar(sql.MAX), data.ErrorMessage);
        updateFields.push('ErrorMessage = @ErrorMessage');
    }
    
    if (data.Result) {
        request.input('Result', sql.NVarChar(sql.MAX), JSON.stringify(data.Result));
        updateFields.push('Result = @Result');
    }

    if (status === 'completed' || status === 'failed') {
        request.input('CompletedAt', sql.DateTime2, new Date());
        updateFields.push('CompletedAt = @CompletedAt');
    }

    await request.query(`UPDATE PostUploadJobs SET ${updateFields.join(', ')} WHERE JobID = @JobID`);
    
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
                DELETE FROM PostUploadJobs 
                WHERE ExpiresAt < GETDATE() 
                AND Status IN ('completed', 'failed')
            `);
        
        if (result.rowsAffected[0] > 0) {
            console.log(`[Cleanup] Removed ${result.rowsAffected[0]} expired post upload job(s) from database.`);
        }
    } catch (error) {
        console.error('[Cleanup] Error removing expired post upload jobs:', error);
    }
};

// Run cleanup every hour
setInterval(cleanupJobs, 60 * 60 * 1000);

console.log('Post upload job management system initialized.');

module.exports = {
    createJob,
    getJob,
    updateJob,
};
