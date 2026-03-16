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
const os = require('os');
const dotenv = require('dotenv');
const cron = require('node-cron');
// Load .env from the backend root (one level up)
const dotenvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  dotenv.config({ path: dotenvPath });
  console.log(`Loaded .env from: ${dotenvPath}`);
} else {
  // Only warn if critical variables are missing
  if (!process.env.DB_SERVER) {
    console.warn(`Warning: .env file not found at ${dotenvPath} and environment variables are not set.`);
  }
}

// Check for required environment variables
const requiredEnvVars = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`FATAL ERROR: ${varName} environment variable is not set.`);
    process.exit(1);
  }
});

// Define the AI service URL (FastAPI)
if (!process.env.AI_SERVICE_URL) {
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:8080'; // Target Python at PY_PORT
}

const axios = require('axios');
// Ping AI service 3 times on startup
const pingAIService = async (attempts = 3) => {
  const url = `${process.env.AI_SERVICE_URL}/health`;
  console.log(`Starting connectivity check to AI Service: ${url}`);

  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await axios.get(url, { timeout: 2000 });
      if (response.status === 200) {
        console.log(`[Attempt ${i}] AI Service is REACHABLE.`);
        return;
      }
    } catch (error) {
      console.log(`[Attempt ${i}] AI Service is NOT reachable. (Error: ${error.message})`);
    }
    if (i < attempts) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  console.warn("AI Service connectivity check failed after 3 attempts. Continuing startup...");
};

// Ping AI service 3 times after a 60-second delay to allow for manual service startup
setTimeout(() => {
  pingAIService();
}, 60 * 1000);

// Import the other js files
const routeGuard = require('./routeGuard/routeGuard');
const { getConnection, sql } = require('./database/database');
const forgotPasswordRoutes = require('./forgotpassword/forgotPassword');
const registerRouter = require('./register/register');
const accountCreationRouter = require('./Admin/accountCreation');
const rolesRouter = require('./Admin/roles');
const { router: backupRouter, executeBackup } = require('./Admin/backup');
const { createJob } = require('./Admin/backupJob');
const sessionLogRouter = require('./Admin/sessionlog');
const loginRouter = require('./login/login');
const { authMiddleware, logout, validateToken } = require('./session/session');
const auditRouter = require('./audit/auditService').router;
const archiveRouter = require('./Admin/archive');
const accArchiveRouter = require('./Admin/accArchive');
const projArchiveRouter = require('./Admin/projArchive');
const projListRouter = require('./Admin/projList');
const registerAuditRouter = require('./Admin/registerAudit');
const dashboardRouter = require('./Admin/dashboard');
const reportsRouter = require('./AIDataRetrieval/reports');
const projectBatchRouter = require('./Projects/projectBatch');
const projectNotesRouter = require('./Projects/projectNotes');
const projectAuditRouter = require('./Projects/projectAudit');
const projectDocumentsRouter = require('./Projects/projectDocuments');
const disclosureRouter = require('./bulletinboard/disclosure');
const { initializeWebSocketServer, broadcast } = require('./websockets/websocket');
const { sendProjectDeadlineEmail } = require('./Email/email');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Request from origin ${origin} blocked. Allowed: ${process.env.CORS_ORIGIN}`);
      callback(null, false); // Block origin but don't throw hard error for better stability
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve files from the local storage
app.use('/storage', express.static(path.join(__dirname, 'File_Storage')));

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

// Register router
if (registerRouter && typeof registerRouter === 'function') {
  app.use('/api/register', registerRouter);
} else {
  console.error('registerRouter is not a valid middleware function');
}

//Bulletin Board Router
if (disclosureRouter && typeof disclosureRouter === 'function') {
  app.use('/api/disclosures', disclosureRouter);
} else {
  console.error('disclosureRouter is not a valid middleware function');
}

// Health Check Endpoint for both frontend and AI service
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/maintenance-status', (req, res) => {
  const flagPath = path.join(__dirname, 'maintenance.flag');
  fs.access(flagPath, fs.constants.F_OK, (err) => {
    res.json({ maintenance: !err });
  });
});

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

if (auditRouter && typeof auditRouter === 'function') {
  app.use('/api/audit', auditRouter);
} else {
  console.error('auditRouter is not a valid middleware function');
}

if (backupRouter && typeof backupRouter === 'function') {
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

if (registerAuditRouter && typeof registerAuditRouter === 'function') {
  adminRouter.use('/audit', registerAuditRouter);
} else {
  console.error('registerAuditRouter is not a valid middleware function');
}

if (dashboardRouter && typeof dashboardRouter === 'function') {
  adminRouter.use('/dashboard', dashboardRouter);
} else {
  console.error('dashboardRouter is not a valid middleware function');
}

// Removed legacy routes

// Mount the consolidated admin router to the app.
app.use('/api/admin', adminRouter);

// Roles router is mounted separately to match frontend's expected path /api/roles/...
if (rolesRouter && typeof rolesRouter === 'function') {
  app.use('/api/roles', rolesRouter);
} else {
  console.error('rolesRouter is not a valid middleware function');
}

// Phase 3: Project Batch router
if (projectBatchRouter && typeof projectBatchRouter === 'function') {
  app.use('/api/project-batch', projectBatchRouter);
} else {
  console.error('projectBatchRouter is not a valid middleware function');
}

// Reports router (Forecasting/Predictive Analysis)
if (reportsRouter && typeof reportsRouter === 'function') {
  app.use('/api/reports', reportsRouter);
} else {
  console.error('reportsRouter is not a valid middleware function');
}

// Project Audit router
if (projectAuditRouter && projectAuditRouter.router) {
  app.use('/api/project-batch', projectAuditRouter.router);
} else {
  console.error('projectAuditRouter.router is not a valid middleware function');
}

// Project Notes router
if (projectNotesRouter && typeof projectNotesRouter === 'function') {
  app.use('/api/project-notes', projectNotesRouter);
} else {
  console.error('projectNotesRouter is not a valid middleware function');
}

// Project Documents router
if (projectDocumentsRouter && typeof projectDocumentsRouter === 'function') {
  app.use('/api/project-documents', projectDocumentsRouter);
} else {
  console.error('projectDocumentsRouter is not a valid middleware function');
}

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
const NODE_PORT = process.env.NODE_PORT || 8000;

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
const HOST = '0.0.0.0';
server.listen(NODE_PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${NODE_PORT}`);

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

  // --- Daily Deadline Check at 10:00 AM PST ---
  cron.schedule('0 10 * * *', async () => {
    console.log('[Deadline Job] Running sp_CheckProjectDeadlines at 10:00 AM PST...');
    try {
      const pool = await getConnection();

      // 1. Execute the stored procedure to insert new notifications
      await pool.request().execute('sp_CheckProjectDeadlines');

      // 2. Fetch the notifications created today (isRead=0) to send emails
      const result = await pool.request().query(`
        SELECT pn.notificationID, pn.batchID, pn.barangayID, pn.notifType, pn.message,
               pb.projName, pb.projType,
               sl.StatusName,
               DATEDIFF(DAY, pt.updatedAt, GETDATE()) AS daysStuck
        FROM projectNotifications pn
        JOIN projectBatch pb ON pn.batchID = pb.batchID
        JOIN (
          SELECT t.batchID, t.statusID, t.updatedAt
          FROM projectTracker t
          INNER JOIN (
            SELECT batchID, MAX(updatedAt) AS maxDate FROM projectTracker GROUP BY batchID
          ) latest ON t.batchID = latest.batchID AND t.updatedAt = latest.maxDate
        ) pt ON pn.batchID = pt.batchID
        JOIN StatusLookup sl ON pt.statusID = sl.StatusID
        WHERE CAST(pn.createdAt AS DATE) = CAST(GETDATE() AS DATE)
          AND pn.isRead = 0
          AND pn.notifType IN ('DEADLINE_WARNING', 'URGENT')
      `);

      // 3. Send an email per notification and broadcast via WebSocket
      for (const notif of result.recordset) {
        await sendProjectDeadlineEmail(
          notif.barangayID,
          notif.projName,
          notif.projType,
          notif.StatusName,
          notif.daysStuck,
          notif.notifType
        );
        broadcast({ type: 'new_notification', barangayID: notif.barangayID });
      }

      console.log(`[Deadline Job] Done. Sent ${result.recordset.length} deadline email(s).`);
    } catch (error) {
      console.error('[Deadline Job] Error during deadline check:', error.message);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Manila'
  });

  console.log('Daily 10:00 AM deadline check job has been scheduled (Asia/Manila).');
});
