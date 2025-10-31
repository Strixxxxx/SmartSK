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

// Import WebSocket Initializer
const { initializeWebSocketServer, broadcast } = require('./websockets/websocket');

// Import the other js files
const routeGuard = require('./routeGuard/routeGuard');
const { getConnection, sql } = require('./database/database');
const forgotPasswordRoutes = require('./forgotpassword/forgotPassword');
const accountCreationRouter = require('./Admin/accountCreation');
const rolesRouter = require('./Admin/roles');
const backupRouter = require('./Admin/backup');
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

// Import the new PyBridge modules with error handling
let PyBridgeFC, PyBridgePA;

try {
  PyBridgeFC = require('./pyBridge/pyBridgeFC');
} catch (error) {
  console.error('Failed to load PyBridgeFC:', error.message);
  PyBridgeFC = null;
}

try {
  PyBridgePA = require('./pyBridge/pyBridgePA');
} catch (error) {
  console.error('Failed to load PyBridgePA:', error.message);
  PyBridgePA = null;
}

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

// Forecast-related API endpoints using PyBridgeFC
app.get('/api/forecast', async (req, res) => {
  try {
    // Get any query parameters
    const options = req.query;
    
    // Run the forecast using PyBridgeFC
    const forecastData = await PyBridgeFC.runForecast(options);
    
    // Return the forecast data
    res.json(forecastData);
  } catch (error) {
    console.error('Error running forecast:', error);
    res.status(500).json({ 
      error: 'Failed to generate forecast',
      message: error.message
    });
  }
});

// Forecast analysis API endpoint
app.get('/api/forecast-analysis', (req, res) => {
  if (PyBridgeFC && typeof PyBridgeFC.handleForecastAnalysisRequest === 'function') {
    PyBridgeFC.handleForecastAnalysisRequest(req, res);
  } else {
    console.error('PyBridgeFC.handleForecastAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Forecast analysis service unavailable' });
  }
});

// Project trends API endpoint (now uses PyBridgePA since fcTrends.py became paTrends.py)
app.get('/api/project-trends', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handleProjectTrendsRequest === 'function') {
    PyBridgePA.handleProjectTrendsRequest(req, res);
  } else {
    console.error('PyBridgePA.handleProjectTrendsRequest is not a valid middleware function');
    res.status(500).json({ error: 'Project trends service unavailable' });
  }
});

// Custom project trends API endpoint (now uses PyBridgePA since fcCstmTrends.py became paCstmTrends.py)
app.get('/api/custom-project-trends', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handleCustomProjectTrendsRequest === 'function') {
    PyBridgePA.handleCustomProjectTrendsRequest(req, res);
  } else {
    console.error('PyBridgePA.handleCustomProjectTrendsRequest is not a valid middleware function');
    res.status(500).json({ error: 'Custom project trends service unavailable' });
  }
});


// Predictive Analysis Routes using PyBridgePA
app.get('/api/predictive-analysis/trends', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handlePaTrendsRequest === 'function') {
    PyBridgePA.handlePaTrendsRequest(req, res);
  } else {
    console.error('PyBridgePA.handlePaTrendsRequest is not a valid middleware function');
    res.status(500).json({ error: 'Predictive analysis trends service unavailable' });
  }
});

app.post('/api/predictive-analysis', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handlePredictiveAnalysisRequest === 'function') {
    PyBridgePA.handlePredictiveAnalysisRequest(req, res);
  } else {
    console.error('PyBridgePA.handlePredictiveAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Predictive analysis service unavailable' });
  }
});

app.post('/api/predictive-analysis/custom', (req, res) => {
  if (PyBridgePA && typeof PyBridgePA.handleCustomizedAnalysisRequest === 'function') {
    PyBridgePA.handleCustomizedAnalysisRequest(req, res);
  } else {
    console.error('PyBridgePA.handleCustomizedAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Customized predictive analysis service unavailable' });
  }
});

// Determine the correct Python executable based on the OS
const getPythonExecutable = () => {
  const platform = os.platform();
  // On Windows, typically just 'python' is used
  if (platform === 'win32') {
    return 'python';
  }
  // On macOS and Linux, try 'python3' first
  return 'python3';
};

// Python executable name
const PYTHON_EXECUTABLE = getPythonExecutable();

// Update your existing predictive analysis endpoint to handle customization options
app.post('/api/predictive-analysis/custom-options', async (req, res) => {
  try {
    // Get analysis options from request body
    const options = {
      analysis_type: req.body.analysis_type || 'general',
      category: req.body.category || 'None',
      time_period: req.body.time_period || 'None',
      include_budget: req.body.include_budget,
      include_duration: req.body.include_duration,
      include_implement_date: req.body.include_implement_date,
      include_recommendations: req.body.include_recommendations,
      include_risks: req.body.include_risks,
      include_trends: req.body.include_trends,
      include_success_factors: req.body.include_success_factors,
      include_feedback: req.body.include_feedback
    };
    
    // Use PyBridgePA for predictive analysis
    const analysisResult = await PyBridgePA.runPredictiveAnalysis(options);
    res.json(analysisResult);
    
  } catch (error) {
    console.error('Error in predictive analysis:', error);
    res.status(500).json({ error: error.message });
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
});
