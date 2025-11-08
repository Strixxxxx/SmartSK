// Add global error handlers to catch silent crashes
process.on('uncaughtException', (err, origin) => {
  console.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Import the necessary modules
const express = require('express');
const http = require('http'); // Import http module
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { spawn } = require('child_process');
const os = require('os');
const dotenv = require('dotenv');
const cron = require('node-cron');

// Define the python executable based on the operating system
const PYTHON_EXECUTABLE = os.platform() === 'win32' ? 'python' : 'python3';

// Import WebSocket Initializer
const { initializeWebSocketServer, broadcast } = require('./websockets/websocket');

// Import the other js files
const routeGuard = require('./routeGuard/routeGuard');
const { getConnection, sql } = require('./database/database');
const forgotPasswordRoutes = require('./forgotpassword/forgotPassword');
const accountCreationRouter = require('./Admin/accountCreation');
const rolesRouter = require('./Admin/roles');
const { router: backupRouter, executeBackup } = require('./Admin/backup');
const { createJob } = require('./Admin/backupJob');
const sessionLogRouter = require('./Admin/sessionlog');
const projectSubmissionRouter = require('./projectSubmission/projectSubmission');
const emailRouter = require('./Email/email').router;
const loginRouter = require('./login/login');
const { authMiddleware, logout, validateToken } = require('./session/session');
const projectReviewRouter = require('./projectReview/projectReview');
const auditRouter = require('./audit/auditService').router;
const rawDataRouter = require('./rawdata/rawData');
const archiveRouter = require('./Admin/archive');
const accArchiveRouter = require('./Admin/accArchive');
const projArchiveRouter = require('./Admin/projArchive');
const projListRouter = require('./Admin/projList');
const postPublicRouter = require('./Posting/postPublic');
const protectedPostRouter = require('./Posting/post');
const pStatusListRouter = require('./Projects/pStatusList.js');
const taggedProjectsRouter = require('./Posting/taggedProjects');
const managePostRouter = require('./Posting/managePost');
const commentRouter = require('./Posting/comment');
const protectedCommentRouter = require('./Posting/commentProtected');
const reportsRouter = require('./AIDataRetrieval/reports');


// Load environment variables
dotenv.config();

// Create Express app
const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Extended timeout middleware for upload endpoints
app.use((req, res, next) => {
  // Set longer timeout for upload and processing endpoints
  if (req.path.includes('/upload') || req.path.includes('/rawdata') || req.path.includes('/api/create-post')) {
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000); // 10 minutes
    
    // Add keep-alive headers to prevent proxy timeouts
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=600, max=1000');
  }
  next();
});

// --- PUBLIC ROUTES ---
// Routes that don't need authentication and are publicly accessible.

if (loginRouter && typeof loginRouter === 'function') {
  app.use('/api/login', loginRouter);
} else {
  console.error('loginRouter is not a valid middleware function');
}

// Forgot password router
if (forgotPasswordRoutes && typeof forgotPasswordRoutes === 'function') {
  app.use('/api/forgotpassword', forgotPasswordRoutes);
} else {
  console.error('forgotPasswordRoutes is not a valid middleware function');
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/maintenance-status', (req, res) => {
  const flagPath = path.join(__dirname, 'maintenance.flag');
  fs.access(flagPath, fs.constants.F_OK, (err) => {
    res.json({ maintenance: !err });
  });
});

// Public Tagged Project Posts Router
const pubTaggedProjRouter = require('./Posting/pubTaggedProj');
if (pubTaggedProjRouter && typeof pubTaggedProjRouter === 'function') {
  app.use('/api/public-tagged-projects', pubTaggedProjRouter);
} else {
  console.error('pubTaggedProjRouter is not a valid middleware function');
}
// --- POST /api/maintenance-end : End maintenance mode ---
app.post('/api/maintenance-end', (req, res) => {
    const maintenanceFlagPath = path.join(__dirname, 'maintenance.flag');
    
    try {
        if (fs.existsSync(maintenanceFlagPath)) {
            fs.unlinkSync(maintenanceFlagPath);
            console.log('[System] Maintenance mode ended via API call.');
            
            // Broadcast to all connected clients
            broadcast({ type: 'maintenance_ended' });
            
            res.status(200).json({ 
                success: true, 
                message: 'Maintenance mode ended successfully' 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: 'System is not in maintenance mode' 
            });
        }
    } catch (error) {
        console.error('[System] Failed to end maintenance mode:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to end maintenance mode',
            error: error.message 
        });
    }
});

app.use('/api/posts', postPublicRouter);
app.use('/api', commentRouter);

// --- AUTHENTICATION MIDDLEWARE ---
// All routes defined after this point will be protected by the authMiddleware.
if (authMiddleware && typeof authMiddleware === 'function') {
  app.use(authMiddleware);
} else {
  console.error('authMiddleware is not a valid middleware function');
}


// --- PROTECTED ROUTES ---
// These routes require a valid token to be accessed.

app.get('/api/validate-token', validateToken);

// Logout route
app.post('/api/logout', logout);

// --- ADMIN ROUTES ---
// Create a main router for all admin-related endpoints.
const adminRouter = express.Router();

// Mount the specific admin routers onto the main admin router.
if (routeGuard.isAdmin && typeof routeGuard.isAdmin === 'function') {
  adminRouter.use(routeGuard.isAdmin);
} else {
  console.error('routeGuard.isAdmin is not a valid middleware function');
}

// Mount the specific admin routers onto the main admin router.
if (accountCreationRouter && typeof accountCreationRouter === 'function') {
  // Changed from '/accounts' to '/' to match frontend path /api/admin/users
  adminRouter.use('/user-list', accountCreationRouter);
} else {
  console.error('accountCreationRouter is not a valid middleware function');
}

if(backupRouter && typeof backupRouter === 'function') {
  adminRouter.use('/backup', backupRouter);
} else {
  console.error('backupRouter is not a valid middleware function');
}

if (sessionLogRouter && typeof sessionLogRouter === 'function') {
  adminRouter.use('/sessions', sessionLogRouter);
} else {
  console.error('sessionLogRouter is not a valid middleware function');
}

if (archiveRouter && typeof archiveRouter === 'function') {
  adminRouter.use('/archive', archiveRouter);
} else {
  console.error('archiveRouter is not a valid middleware function');
}

if (projArchiveRouter && typeof projArchiveRouter === 'function') {
  adminRouter.use('/proj-archive', projArchiveRouter);
} else {
  console.error('projArchiveRouter is not a valid middleware function');
}

if (accArchiveRouter && typeof accArchiveRouter === 'function') {
  adminRouter.use('/acc-archive', accArchiveRouter);
} else {
  console.error('accArchiveRouter is not a valid middleware function');
}

if (projListRouter && typeof projListRouter === 'function') {
  adminRouter.use('/project-list', projListRouter);
} else {
  console.error('projListRouter is not a valid middleware function');
}

if (protectedPostRouter && typeof protectedPostRouter === 'function') {
    app.use('/api', protectedPostRouter);
} else {
    console.error('postRouter is not a valid middleware function');
}

// Mount the consolidated admin router to the app.
app.use('/api/admin', adminRouter);

// Roles router is mounted separately to match frontend's expected path /api/roles/...
if (rolesRouter && typeof rolesRouter === 'function') {
  app.use('/api/roles', rolesRouter);
} else {
  console.error('rolesRouter is not a valid middleware function');
}

if (projectSubmissionRouter && typeof projectSubmissionRouter === 'function') {
  app.use('/api/projects', projectSubmissionRouter);
} else {
  console.error('projectSubmissionRouter is not a valid middleware function');
}

if (pStatusListRouter && typeof pStatusListRouter === 'function') {
  app.use('/api/projects', pStatusListRouter);
} else {
  console.error('pStatusListRouter is not a valid middleware function');
}

if (taggedProjectsRouter && typeof taggedProjectsRouter === 'function') {
  app.use('/api/tagged-projects', taggedProjectsRouter);
} else {
  console.error('taggedProjectsRouter is not a valid middleware function');
}

if (managePostRouter && typeof managePostRouter === 'function') {
  app.use('/api/manage-post', managePostRouter);
} else {
  console.error('managePostRouter is not a valid middleware function');
}

if (emailRouter && typeof emailRouter === 'function') {
  app.use('/api/email', emailRouter);
} else {
  console.error('emailRouter is not a valid middleware function');
}

if (projectReviewRouter && typeof projectReviewRouter === 'function') {
  app.use('/api/projectreview', projectReviewRouter);
} else {
  console.error('projectReviewRouter is not a valid middleware function');
}

if (auditRouter && typeof auditRouter === 'function') {
    app.use('/api/audit', auditRouter);
} else {
  console.error('auditRouter is not a valid middleware function');
}

if (rawDataRouter && typeof rawDataRouter === 'function') {
  app.use('/api/rawdata', rawDataRouter);
}

if (reportsRouter && typeof reportsRouter === 'function') {
  app.use('/api/reports', reportsRouter);
}

if (protectedCommentRouter && typeof protectedCommentRouter === 'function') {
  app.use('/api', protectedCommentRouter);
} else {
  console.error('rawDataRouter is not a valid middleware function');
}

// Check PyBridge modules - removed duplicate validation since it's handled in import section above

// Add or update the user-info endpoint
app.get('/api/user-data', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    return res.json({
      success: true,
      userInfo: req.user
    });

  } catch (error) {
    console.error('Error fetching user data');
    return res.status(500).json({ success: false, message: 'An error occurred while fetching user data' });
  }
});


// Define the port
const PORT = process.env.PORT;

// Create HTTP server and integrate WebSocket server
const server = http.createServer(app);
initializeWebSocketServer(server);

// Check for maintenance flag on startup
const flagPath = path.join(__dirname, 'maintenance_complete.flag');
if (fs.existsSync(flagPath)) {
    console.log('[System] Maintenance flag found. Server has restarted after a restore.');
    global.maintenanceJustFinished = true;
    fs.unlinkSync(flagPath); // Delete the flag after acknowledging it

    // Delete maintenance.flag and broadcast maintenance ended
    const maintenanceFlagPath = path.join(__dirname, 'maintenance.flag');
    if (fs.existsSync(maintenanceFlagPath)) {
        fs.unlinkSync(maintenanceFlagPath);
        console.log('[System] Maintenance mode flag removed.');
        
        // Broadcast maintenance ended after server restart
        setTimeout(() => {
            broadcast({ type: 'maintenance_ended' });
            console.log('[System] Broadcasted maintenance_ended to all clients.');
        }, 2000); // Wait 2 seconds for WebSocket server to be ready
    }
}

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);

  // --- AI Job Scheduler with Retry Logic ---

  // State variables to manage the job runner
  let jobIsRunning = false;
  let retryCount = 0;
  const MAX_RETRIES = 5; // 5 retries over 30 minutes (5 min interval)
  const RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour

  /**
   * Executes the Python AI job with integrated retry and cooldown logic.
   */
  const runAIJob = () => {
    if (jobIsRunning) {
      console.log('[AI Job Runner] A job is already in progress. Skipping scheduled run.');
      return;
    }

    jobIsRunning = true;
    console.log(`[AI Job Runner] Starting job attempt #${retryCount + 1}...`);

    const pythonProcess = spawn(PYTHON_EXECUTABLE, ['-m', 'AI.aiJobs'], { cwd: __dirname });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      jobIsRunning = false;
      if (code === 0) {
        console.log('[AI Job Runner] Job finished successfully.');
        console.log(`[AI Job STDOUT]:\n${stdout}`);
        retryCount = 0; // Reset on success
      } else {
        console.error(`[AI Job Runner] Job failed with code ${code}.`);
        console.error(`[AI Job STDERR]:\n${stderr}`);
        handleFailedJob();
      }
    });
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
  cron.schedule('0 * * * *', runAIJob, {
    scheduled: true,
    timezone: "Asia/Manila"
  });

  console.log('Hourly AI job with retry logic has been scheduled.');

  // --- Monthly Database Backup Scheduler ---
  cron.schedule('0 0 1 * *', async () => {
    console.log('[Backup Job] Starting scheduled monthly database backup.');
    try {
      const jobId = await createJob({
        backupType: 'cloud-only',
        initiatedBy: 'System Scheduler',
        userID: 0 // System user ID 0 or a dedicated system user ID
      });
      console.log(`[Backup Job] Created job ${jobId}. Executing backup.`);
      // This is a fire-and-forget operation, as executeBackup runs asynchronously.
      executeBackup(jobId);
    } catch (error) {
      console.error('[Backup Job] Failed to initiate scheduled backup:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });

  console.log('Monthly cloud backup job has been scheduled.');
});
