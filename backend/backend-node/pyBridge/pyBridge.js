const axios = require('axios');
const cron = require('node-cron');

// --- AI Job Scheduler with Retry Logic ---

// State variables to manage the job runner
let jobIsRunning = false;
let retryCount = 0;
const MAX_RETRIES = 5; // 5 retries over 30 minutes (5 min interval)
const RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour

/**
 * Executes the FastAPI AI job with integrated retry and cooldown logic.
 */
const runAIJob = async () => {
    if (jobIsRunning) {
        console.log('[AI Job Runner] A job is already in progress. Skipping scheduled run.');
        return;
    }

    jobIsRunning = true;
    console.log(`[AI Job Runner] Triggering job attempt #${retryCount + 1} via FastAPI...`);

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

    try {
        const response = await axios.post(`${AI_SERVICE_URL}/run-ai-batch-job`);
        console.log('[AI Job Runner] Job triggered successfully:', response.data);

        jobIsRunning = false;
        retryCount = 0; // Reset on success
    } catch (error) {
        jobIsRunning = false;
        console.error(`[AI Job Runner] Failed to trigger job: ${error.message}`);
        handleFailedJob();
    }
};

/**
 * Handles the logic for retrying or cooling down a failed job.
 */
const handleFailedJob = () => {
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[AI Job Runner] Scheduling retry #${retryCount} in 5 minutes.`);
        setTimeout(runAIJob, RETRY_INTERVAL);
    } else {
        console.log('[AI Job Runner] Maximum retries reached. Entering 1-hour cooldown.');
        retryCount = 0; // Reset for the next cycle
        setTimeout(() => {
            console.log('[AI Job Runner] Cooldown finished. Attempting one final run.');
            runAIJob();
        }, COOLDOWN_PERIOD);
    }
};

// Schedule the job to run at the start of every hour.
/*
cron.schedule('0 * * * *', runAIJob, {
    scheduled: true,
    timezone: "Asia/Manila"
});

console.log('Hourly AI job with retry logic (Axios-based) has been scheduled.');
*/
console.log('Hourly AI job scheduler is currently DISABLED (manual trigger only).');
