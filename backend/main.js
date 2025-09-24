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
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { spawn } = require('child_process');
const os = require('os');
const dotenv = require('dotenv');

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
  // For production, set the CORS_ORIGIN environment variable in Azure to your frontend's URL.
  // e.g., https://your-frontend-app.azurewebsites.net
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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
  if (req.path.includes('/upload') || req.path.includes('/rawdata')) {
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

app.use('/api/login', loginRouter);

// Forgot password router
if (forgotPasswordRoutes && typeof forgotPasswordRoutes === 'function') {
  app.use('/api/forgotpassword', forgotPasswordRoutes);
} else {
  console.error('forgotPasswordRoutes is not a valid middleware function');
}


// --- AUTHENTICATION MIDDLEWARE ---
// All routes defined after this point will be protected by the authMiddleware.
app.use(authMiddleware);


// --- PROTECTED ROUTES ---
// These routes require a valid token to be accessed.

app.get('/api/validate-token', validateToken);

// Logout route
app.post('/api/logout', logout);

// --- ADMIN ROUTES ---
// Create a main router for all admin-related endpoints.
const adminRouter = express.Router();

// Mount the specific admin routers onto the main admin router.
adminRouter.use(routeGuard.isAdmin);

// Mount the specific admin routers onto the main admin router.
if (accountCreationRouter && typeof accountCreationRouter === 'function') {
  // Changed from '/accounts' to '/' to match frontend path /api/admin/users
  adminRouter.use('/', accountCreationRouter);
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
  adminRouter.use('/archive/accounts', accArchiveRouter);
  adminRouter.use('/archive/projects', projArchiveRouter);
} else {
  console.error('archiveRouter is not a valid middleware function');
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
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT u.userID, u.username, u.fullName, r.roleName as position, b.barangayName as barangay, u.emailAddress, u.phoneNumber 
        FROM userInfo u
        LEFT JOIN roles r ON u.position = r.roleID
        LEFT JOIN barangays b ON u.barangay = b.barangayID
        WHERE u.userID = @userId
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      userInfo: userResult.recordset[0]
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

// Detailed analysis API endpoint
app.get('/api/detailed-analysis', (req, res) => {
  if (PyBridgeFC && typeof PyBridgeFC.handleDetailedAnalysisRequest === 'function') {
    PyBridgeFC.handleDetailedAnalysisRequest(req, res);
  } else {
    console.error('PyBridgeFC.handleDetailedAnalysisRequest is not a valid middleware function');
    res.status(500).json({ error: 'Detailed analysis service unavailable' });
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use timestamp to ensure unique filenames
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept only certain file types
    const filetypes = /pdf|doc|docx|txt/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'));
  }
});

// Add a new endpoint to check progress
app.get('/api/predictive-analysis/progress/:id', async (req, res) => {
  const progressId = req.params.id;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('jobID', sql.VarChar, progressId)
      .query('SELECT * FROM analysisJobs WHERE jobID = @jobID');

    if (result.recordset.length === 0) {
      return res.json({ status: 'unknown', progress: 0 });
    }

    const job = result.recordset[0];
    let responseData = {
      status: job.status,
      progress: job.progress,
    };

    if (job.status === 'completed' && job.result) {
      try {
        responseData.result = JSON.parse(job.result);
      } catch (e) {
        responseData.error = "Failed to parse analysis result.";
      }
    } else if (job.status === 'error' && job.errorMessage) {
      responseData.error = job.errorMessage;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching analysis progress:', error);
    res.status(500).json({ status: 'error', progress: 100, error: 'Failed to fetch progress' });
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

// File upload endpoint for predictive analysis
app.post('/api/predictive-analysis/upload', upload.single('file'), async (req, res) => {
  const analysisId = Date.now().toString();
  try {
    const pool = await getConnection();
    await pool.request()
      .input('jobID', sql.VarChar, analysisId)
      .input('status', sql.VarChar, 'starting')
      .input('progress', sql.Int, 5)
      .query(`
        INSERT INTO analysisJobs (jobID, status, progress, updatedAt) 
        VALUES (@jobID, @status, @progress, GETDATE())
      `);
    
    // Send an immediate response with the analysis ID so the frontend can start polling
    res.json({
      analysis_id: analysisId,
      message: "Analysis started. Please check progress endpoint for updates.",
      analysis_type: 'specified'
    });
    
    // Get file content if available
    let fileContent = '';
    
    if (req.file) {
      const filePath = req.file.path;
      console.log("File uploaded.");
      await pool.request()
        .input('jobID', sql.VarChar, analysisId)
        .input('status', sql.VarChar, 'reading_file')
        .input('progress', sql.Int, 10)
        .query('UPDATE analysisJobs SET status = @status, progress = @progress, updatedAt = GETDATE() WHERE jobID = @jobID');
      
      // Handle different file types
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (fileExtension === '.txt') {
        // For text files, read directly
        fileContent = fs.readFileSync(filePath, 'utf8');
        console.log("Text file content length:", fileContent.length);
      } 
      else if (fileExtension === '.pdf') {
        // For PDF files, use pdf-parse
        try {
          const dataBuffer = fs.readFileSync(filePath);
          await pool.request()
            .input('jobID', sql.VarChar, analysisId)
            .input('status', sql.VarChar, 'parsing_pdf')
            .input('progress', sql.Int, 20)
            .query('UPDATE analysisJobs SET status = @status, progress = @progress, updatedAt = GETDATE() WHERE jobID = @jobID');

          const pdfData = await pdfParse(dataBuffer);
          fileContent = pdfData.text;
          console.log("PDF content extracted, length:", fileContent.length);
        } catch (pdfError) {
          console.error("Error parsing PDF:", pdfError);
          fileContent = `Error extracting content from PDF: ${req.file.originalname}`;
          await pool.request()
            .input('jobID', sql.VarChar, analysisId)
            .input('status', sql.VarChar, 'error')
            .input('progress', sql.Int, 100)
            .input('errorMessage', sql.NVarChar, `Error extracting content from PDF: ${pdfError.message}`)
            .query('UPDATE analysisJobs SET status = @status, progress = @progress, errorMessage = @errorMessage, updatedAt = GETDATE() WHERE jobID = @jobID');
          return;
        }
      } 
      else if (['.doc', '.docx'].includes(fileExtension)) {
        // For Word documents, we'd need another library
        // For now, just note that it's a Word document
        fileContent = `This is a Word document (${req.file.originalname}). Content extraction not implemented yet.`;
      } 
      else {
        // For other file types
        fileContent = `File uploaded: ${req.file.originalname} (Content extraction not supported for this file type)`;
      }
    } else {
      console.log("No file received in the request");
      await pool.request()
        .input('jobID', sql.VarChar, analysisId)
        .input('status', sql.VarChar, 'error')
        .input('progress', sql.Int, 100)
        .input('errorMessage', sql.NVarChar, 'No file uploaded')
        .query('UPDATE analysisJobs SET status = @status, progress = @progress, errorMessage = @errorMessage, updatedAt = GETDATE() WHERE jobID = @jobID');
      return;
    }
    
    await pool.request()
      .input('jobID', sql.VarChar, analysisId)
      .input('status', sql.VarChar, 'preparing_analysis')
      .input('progress', sql.Int, 30)
      .query('UPDATE analysisJobs SET status = @status, progress = @progress, updatedAt = GETDATE() WHERE jobID = @jobID');
    
    // Get analysis options from request body
    const options = {
      analysis_type: 'specified', // Force specified type for file uploads
      category: req.body.category || 'None',
      time_period: req.body.time_period || 'None',
      include_budget: req.body.include_budget === 'true',
      include_duration: req.body.include_duration === 'true',
      include_implement_date: req.body.include_implement_date === 'true',
      include_recommendations: req.body.include_recommendations === 'true',
      include_risks: req.body.include_risks === 'true',
      include_trends: req.body.include_trends === 'true',
      include_success_factors: req.body.include_success_factors === 'true',
      include_feedback: req.body.include_feedback === 'true',
      file_content: fileContent, // Add the file content directly to options
      analysis_id: analysisId // Pass the analysis ID to Python
    };
    
    console.log("Sending options to Python.");
    await pool.request()
      .input('jobID', sql.VarChar, analysisId)
      .input('status', sql.VarChar, 'sending_to_ai')
      .input('progress', sql.Int, 40)
      .query('UPDATE analysisJobs SET status = @status, progress = @progress, updatedAt = GETDATE() WHERE jobID = @jobID');
    
    // Call Python script with options using PyBridgePA
    try {
      const analysisResult = await PyBridgePA.runPredictiveAnalysis(options);
      await pool.request()
        .input('jobID', sql.VarChar, analysisId)
        .input('status', sql.VarChar, 'completed')
        .input('progress', sql.Int, 100)
        .input('result', sql.NVarChar, JSON.stringify(analysisResult))
        .query('UPDATE analysisJobs SET status = @status, progress = @progress, result = @result, updatedAt = GETDATE() WHERE jobID = @jobID');

    } catch (error) {
      console.error("Error in predictive analysis:", error);
      await pool.request()
        .input('jobID', sql.VarChar, analysisId)
        .input('status', sql.VarChar, 'error')
        .input('progress', sql.Int, 100)
        .input('errorMessage', sql.NVarChar, error.message)
        .query('UPDATE analysisJobs SET status = @status, progress = @progress, errorMessage = @errorMessage, updatedAt = GETDATE() WHERE jobID = @jobID');
    }
    
    // Clean up the uploaded file
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
  } catch (error) {
    console.error('Error in predictive analysis upload:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      error: 'Failed to process file upload',
      message: error.message 
    });
  }
});

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
const PORT = process.env.PORT || process.env.WEBSITES_PORT || 3000;

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
