// Import the necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { spawn } = require('child_process');
const os = require('os');

// Import the other js files
const routeGuard = require('./routeGuard/routeGuard');
const { getConnection, sql } = require('./database/database');
const loginRouter = require('./login/login');
const forgotPasswordRoutes = require('./forgotpassword/forgotPassword');
const accountCreationRouter = require('./Admin/accountCreation');
const rolesRouter = require('./Admin/roles');
const backupRouter = require('./Admin/backup');
const sessionLogRouter = require('./Admin/sessionlog');
const projectSubmissionRouter = require('./projectlSubmission/projectSubmission');
const emailRouter = require('./Email/email').router;
const { login, logout, validateToken, authMiddleware } = require('./session/session');
const projectReviewRouter = require('./projectReview/projectReview');
const auditRouter = require('./audit/auditService').router;
const rawDataRouter = require('./rawdata/rawData');

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
  origin: ['http://localhost:5173'],
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

app.get('/api/validate-token', validateToken);

// Login router
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


// --- AUTHENTICATION MIDDLEWARE ---
// All routes defined after this point will be protected by the authMiddleware.
app.use(authMiddleware);


// --- PROTECTED ROUTES ---
// These routes require a valid token to be accessed.

// Logout route
app.post('/api/logout', logout);

// Admin routes
if (accountCreationRouter && typeof accountCreationRouter === 'function') {
  app.use('/api/admin', accountCreationRouter);
} else {
  console.error('accountCreationRouter is not a valid middleware function');
}

if (rolesRouter && typeof rolesRouter === 'function') {
  app.use('/api/roles', rolesRouter);
} else {
  console.error('rolesRouter is not a valid middleware function');
}

if(backupRouter && typeof backupRouter === 'function') {
  app.use('/api/backup', backupRouter);
} else {
  console.error('backupRouter is not a valid middleware function');
}

if (sessionLogRouter && typeof sessionLogRouter === 'function') {
  app.use('/api/admin', sessionLogRouter);
} else {
  console.error('sessionLogRouter is not a valid middleware function');
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

// Protect admin routes on the backend
app.use('/api/admin', routeGuard.verifyToken, routeGuard.isAdmin);

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

// Create a simple progress tracking mechanism
const analysisProgress = new Map();

// Add a new endpoint to check progress
app.get('/api/predictive-analysis/progress/:id', (req, res) => {
  const progressId = req.params.id;
  const progress = analysisProgress.get(progressId) || { status: 'unknown', progress: 0 };
  res.json(progress);
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
  try {
    // Create a unique ID for this analysis request
    const analysisId = Date.now().toString();
    analysisProgress.set(analysisId, { status: 'starting', progress: 5 });
    
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
      analysisProgress.set(analysisId, { status: 'reading_file', progress: 10 });
      
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
          analysisProgress.set(analysisId, { status: 'parsing_pdf', progress: 20 });
          const pdfData = await pdfParse(dataBuffer);
          fileContent = pdfData.text;
          console.log("PDF content extracted, length:", fileContent.length);
        } catch (pdfError) {
          console.error("Error parsing PDF:", pdfError);
          fileContent = `Error extracting content from PDF: ${req.file.originalname}`;
          analysisProgress.set(analysisId, { 
            status: 'error', 
            progress: 100,
            error: `Error extracting content from PDF: ${pdfError.message}`
          });
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
      analysisProgress.set(analysisId, { 
        status: 'error', 
        progress: 100,
        error: 'No file uploaded'
      });
      return;
    }
    
    analysisProgress.set(analysisId, { status: 'preparing_analysis', progress: 30 });
    
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
    analysisProgress.set(analysisId, { status: 'sending_to_ai', progress: 40 });
    
    // Call Python script with options using PyBridgePA
    try {
      const analysisResult = await PyBridgePA.runPredictiveAnalysis(options);
      analysisProgress.set(analysisId, { 
        status: 'completed', 
        progress: 100,
        result: analysisResult
      });
    } catch (error) {
      console.error("Error in predictive analysis:", error);
      analysisProgress.set(analysisId, { 
        status: 'error', 
        progress: 100,
        error: error.message
      });
    }
    
    // Clean up the uploaded file
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    // Clean up progress after 30 minutes
    setTimeout(() => {
      analysisProgress.delete(analysisId);
    }, 30 * 60 * 1000);
    
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
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});