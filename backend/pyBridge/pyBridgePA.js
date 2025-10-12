const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getConnection, sql } = require('../database/database'); // Import database connection

// Determine the correct Python executable based on the OS
const getPythonExecutable = () => {
  const platform = os.platform();
  
  // On Windows, typically just 'python' is used
  if (platform === 'win32') {
    return 'python';
  }
  
  // On macOS and Linux, both 'python' and 'python3' might be available
  // Try to use 'python3' first, as 'python' might point to Python 2.x
  return 'python3';
};

// Python executable name
const PYTHON_EXECUTABLE = getPythonExecutable();

class PyBridgePA {

  /**
   * Fetches the list of valid categories directly from the database.
   * @returns {Promise<string[]>} - A promise that resolves to an array of category names.
   */
  static async getValidCategories() {
    try {
      const pool = await getConnection();
      // Execute the stored procedure without parameters to get all data
      const result = await pool.request().execute('[Raw Data]');
      if (result.recordset && result.recordset.length > 0) {
        // Use a Set to get unique, non-null category values
        const categories = new Set(result.recordset.map(row => row.category).filter(cat => cat));
        return [...categories];
      }
      return [];
    } catch (error) {
      console.error('Error fetching categories from database for validation:', error);
      return []; // Return empty array on error to avoid crashing
    }
  }

  /**
   * Handle project trends analysis request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleProjectTrendsRequest(req, res) {
    try {
      const options = req.query;
      
      const trendsData = await PyBridgePA.runProjectTrends(options);
      
      // If the Python script returned a structured error, pass it directly to the frontend.
      if (trendsData && trendsData.error) {
        console.error('The project trends script returned an error:', trendsData.message);
        return res.json(trendsData);
      }
      
      // For valid responses, ensure the 'trends' array exists. An empty array is a valid result.
      if (!trendsData || !Array.isArray(trendsData.trends)) {
        throw new Error('Invalid or corrupt data format returned from Python script.');
      }
      
      // If we are here, the data is valid (even if trends are empty).
      // Add additional metadata if needed (like forecast_year).
      const current_year = new Date().getFullYear();
      const next_year = current_year + 1;
      if (!trendsData.forecast_year && (!trendsData.metadata || !trendsData.metadata.forecast_year)) {
        if (!trendsData.metadata) {
          trendsData.metadata = {};
        }
        trendsData.metadata.forecast_year = next_year;
        trendsData.forecast_year = next_year;
      }
      
      return res.json(trendsData);

    } catch (pythonError) {
      console.error('Error running Python project trends script:', pythonError);
      const errorResponse = {
        error: true,
        message: `Failed to generate project trends: ${pythonError.message}`,
        trends: [],
        forecast_year: new Date().getFullYear() + 1,
        metadata: {
          generated_at: new Date().toISOString(),
          error_details: pythonError.message,
          note: "A critical error occurred in the Node.js bridge."
        }
      };
      // It's better to send a 500 for a bridge-level or process-level error
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Run the custom project trends analysis using paCstmTrends.py (formerly fcCstmTrends.py)
   * @param {Object} options - Configuration options for the custom trends analysis
   * @returns {Promise} - Promise that resolves with custom trends analysis data
   */
  static runCustomProjectTrends(options = {}) {
    return new Promise((resolve, reject) => {
      // Path to the Python script (renamed from fcCstmTrends.py to paCstmTrends.py)
      // Year-only logic is now consolidated into paCstmTrends.py
      const scriptPath = path.join(__dirname, '..', 'AI', 'paCstmTrends.py');
      
      // Check if the script file exists
      if (!fs.existsSync(scriptPath)) {
        console.error(`Python script does not exist at path: ${scriptPath}`);
        reject(new Error(`Python script not found: ${scriptPath}`));
        return;
      }
      
      // Create argument list instead of passing JSON
      const args = [];
      
      // Check if this is a year-only request
      const isYearOnlyRequest = options.year && (!options.customCategory || options.customCategory === 'General');
      
      if (isYearOnlyRequest) {
        // For year-only requests, only pass the year parameter
        if (options.year) args.push('--year', options.year);
      } else {
        // For category-based requests, use the regular category parameters
        if (options.customCategory) {
          args.push('--category', options.customCategory);
        } else {
          console.error('Custom category is required for custom trends analysis');
          reject(new Error('Custom category is required for custom trends analysis'));
          return;
        }
        
        // Add optional otherCategory for "Others" category
        if (options.customCategory === 'Others' && options.otherCategory) {
          args.push('--otherCategory', options.otherCategory);
        }
        
        // Add year parameter for category-based requests too
        if (options.year) args.push('--year', options.year);
      }
      
      // Add other filter options as individual arguments (for both types of requests)
      if (options.budget) args.push('--budget', options.budget);
      if (options.startDate) args.push('--startDate', options.startDate);
      if (options.endDate) args.push('--endDate', options.endDate);
      
      // Set a timeout for the Python process (5 minutes)
      const timeout = 5 * 60 * 1000; // 5 minutes in milliseconds
      let isTimedOut = false;
      
      // Set up environment variables - add AI directory to PYTHONPATH
      const aiDirPath = path.join(__dirname, '..', 'AI');
      const env = Object.assign({}, process.env);
      
      // Set PYTHONPATH to include our AI directory for module imports
      if (env.PYTHONPATH) {
        env.PYTHONPATH = `${aiDirPath}${path.delimiter}${env.PYTHONPATH}`;
      } else {
        env.PYTHONPATH = aiDirPath;
      }
      
      // Spawn the Python process with arguments and enhanced environment
      const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args], { env });
      
      // Set a timeout to kill the process if it takes too long
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        console.error(`Python process timed out after ${timeout/1000} seconds`);
        pythonProcess.kill();
        reject(new Error(`Python process timed out after ${timeout/1000} seconds`));
      }, timeout);
      
      let dataString = '';
      let errorString = '';
      
      // Collect data from stdout
      pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
      });
      
      // Collect error output
      pythonProcess.stderr.on('data', (data) => {
        const errorData = data.toString();
        errorString += errorData;
        console.log(`Python stderr: ${errorData}`);
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (isTimedOut) return;

        // Regardless of exit code, first try to find and parse a JSON object from stdout,
        // as the Python script may provide a structured error message before exiting.
        if (dataString) {
            try {
                const jsonMatches = dataString.match(/\{[\s\S]*\}/g);
                if (jsonMatches && jsonMatches.length > 0) {
                    const lastJsonObject = jsonMatches[jsonMatches.length - 1];
                    const result = JSON.parse(lastJsonObject);
                    
                    // If the parsed object is a structured error (e.g., profanity, no data),
                    // or even a success response, resolve with it and we're done.
                    if (result.error || result.trends) {
                        if(result.error) console.warn('Python script returned a structured error:', result.message);
                        
                        resolve(result);
                        return;
                    }
                }
            } catch (e) {
                console.log('Could not parse stdout as a complete JSON response, will proceed to check exit code.');
            }
        }

        // If we're here, it means stdout did not contain a definitive JSON response.
        // Now, we check the exit code.
        if (code !== 0) {
            console.error(`Python process exited with code ${code}`);
            console.error(`Error from stderr: ${errorString}`);
            const errorMessage = `Python process failed with code ${code}: ${errorString || 'No stderr output'}`;
            reject(new Error(errorMessage));
            return;
        }

        // If code is 0 but we still haven't resolved, it's an issue.
        const finalErrorMessage = `Python script finished with code 0, but no valid JSON output was found. stdout: ${dataString}`;
        console.error(finalErrorMessage);
        reject(new Error(finalErrorMessage));
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error('Error starting Python process:', error);
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  /**
   * Handle custom project trends analysis request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleCustomProjectTrendsRequest(req, res) {
    try {
      // Get any query parameters
      const options = req.query;
      
      // Allow year-only analysis (without requiring a custom category)
      const isYearOnlyRequest = options.year && !options.customCategory;
      
      if (isYearOnlyRequest) {
        // If no year and no category, require at least one parameter
      } else if (!options.customCategory && !options.year) {
        return res.status(400).json({
          error: true,
          message: 'Either customCategory or year parameter is required for customized trends analysis'
        });
      }
      
      // Validate the custom category if provided
      if (options.customCategory && options.customCategory.toLowerCase() !== 'general') {
        // Fetch categories dynamically and perform case-insensitive validation
        const dbCategories = await PyBridgePA.getValidCategories();
        const validCategories = [...dbCategories, 'Others', 'General'];
        const lowerCaseValidCategories = validCategories.map(c => c.toLowerCase());

        if (!lowerCaseValidCategories.includes(options.customCategory.toLowerCase())) {
          return res.status(400).json({
            error: true,
            message: `Invalid custom category: ${options.customCategory}. Please select a valid category.`
          });
        }
        
        // For "Others" category, ensure otherCategory is provided
        if (options.customCategory.toLowerCase() === 'others' && !options.otherCategory) {
          return res.status(400).json({
            error: true,
            message: 'For "Others" category, you must provide otherCategory parameter'
          });
        }
      }
      
      // Validate the forecast year
      if (options.year) {
        const year = parseInt(options.year);
        if (isNaN(year) || year < 2025 || year > 2050) {
          return res.status(400).json({
            error: true,
            message: 'Analysis year must be a number between 2025 and 2050'
          });
        }
      }
      
      // Check for inappropriate terms in otherCategory
      if (options.customCategory === 'Others' && options.otherCategory) {
        const inappropriateTerms = [
          "idiot", "stupid", "dumb", "moron", "ass", "fuck", "shit", "bitch", "damn", 
          "hell", "bastard", "cunt", "dick", "pussy", "cock", "slut", "whore", "nigger", 
          "faggot", "retard", "asshole", "jackass", "bullshit", "fag", "sex", "porn", 
          "nazi", "motherfucker", "wtf", "piss", "crap", "jerk", "nsfw", "xxx"
        ];
        
        const lowercaseCategory = options.otherCategory.toLowerCase();
        let hasInappropriateTerm = false;
        
        for (const term of inappropriateTerms) {
          if (lowercaseCategory.includes(term)) {
            hasInappropriateTerm = true;
            break;
          }
        }
        
        if (hasInappropriateTerm) {
          return res.status(400).json({
            error: true,
            message: 'Inappropriate custom category provided. Please use appropriate terms related to SK youth development programs.'
          });
        }
        
        // Check for relevance to youth development
        // List of inherently youth-relevant categories that don't need the "youth" prefix
        const inherentlyRelevantCategories = [
          "livelihood", "entrepreneurship", "education", "training", "skills", 
          "healthcare", "environment", "sports", "culture", "leadership", 
          "governance", "technology", "digital", "community", "civic", "service", 
          "volunteering", "empowerment", "mentoring", "learning", "development"
        ];
        
        // Check if the category contains any of the inherently relevant terms
        let isInherentlyRelevant = false;
        for (const term of inherentlyRelevantCategories) {
          if (lowercaseCategory.includes(term)) {
            isInherentlyRelevant = true;
            break;
          }
        }
        
        // Only check for general youth relevance if not already inherently relevant
        if (!isInherentlyRelevant) {
          // Check for terms that specifically mention youth
          const youthSpecificTerms = [
            "youth", "young", "teen", "adolescent", "student", "kabataan", 
            "children", "SK", "sangguniang"
          ];
          
          let hasYouthReference = false;
          for (const term of youthSpecificTerms) {
            if (lowercaseCategory.includes(term)) {
              hasYouthReference = true;
              break;
            }
          }
          
          // If neither inherently relevant nor has youth reference, add the youth prefix
          if (!hasYouthReference) {
            // Modify the category to make it youth-focused
            const originalCategory = options.otherCategory;
            options.otherCategory = `Youth ${options.otherCategory}`;
            console.log(`Modified user category '${originalCategory}' to '${options.otherCategory}' to ensure youth focus`);
          }
        } else {
        }
      }
      
      // Run the custom project trends analysis using PyBridgePA
      try {
        const trendsData = await PyBridgePA.runCustomProjectTrends(options);
        
        // If the Python script returned a structured error, send it with a 400 status
        if (trendsData && trendsData.error) {
          console.warn('Returning structured error to client:', trendsData.message);
          return res.status(400).json(trendsData);
        }

        // Return the successful trends data
        res.json(trendsData);
      } catch (error) {
        console.error('Error running custom project trends analysis:', error);
        res.status(500).json({
          error: true,
          message: `Failed to generate custom project trends analysis: ${error.message}`
        });
      }
    } catch (error) {
      console.error('Error handling custom project trends request:', error);
      res.status(500).json({
        error: true,
        message: `Server error: ${error.message}`
      });
    }
  }

  /**
   * Run the project trends analysis using paTrends.py (formerly fcTrends.py)
   * @param {Object} options - Configuration options for the trends analysis
   * @returns {Promise} - Promise that resolves with trends analysis data
   */
  static runProjectTrends(options = {}) {
    return new Promise((resolve, reject) => {
      // Path to the Python script (renamed from fcTrends.py to paTrends.py)
      const scriptPath = path.join(__dirname, '..', 'AI', 'paTrends.py');
      
      // Check if the script file exists
      if (!fs.existsSync(scriptPath)) {
        console.error(`Python script does not exist at path: ${scriptPath}`);
        reject(new Error(`Python script not found: ${scriptPath}`));
        return;
      }
      
      // Create argument list instead of passing JSON
      const args = [];
      
      // Add filter options as individual arguments
      if (options.category) args.push('--category', options.category);
      if (options.budget) args.push('--budget', options.budget);
      if (options.startDate) args.push('--startDate', options.startDate);
      if (options.endDate) args.push('--endDate', options.endDate);
      
      // Set a timeout for the Python process (5 minutes)
      const timeout = 5 * 60 * 1000; // 5 minutes in milliseconds
      let isTimedOut = false;
      
      // Set up environment variables - add AI directory to PYTHONPATH
      const aiDirPath = path.join(__dirname, '..', 'AI');
      const env = Object.assign({}, process.env);
      
      // Set PYTHONPATH to include our AI directory for module imports
      if (env.PYTHONPATH) {
        env.PYTHONPATH = `${aiDirPath}${path.delimiter}${env.PYTHONPATH}`;
      } else {
        env.PYTHONPATH = aiDirPath;
      }
      
      // Spawn the Python process with arguments and enhanced environment
      const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args], { env });
      
      // Set a timeout to kill the process if it takes too long
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        console.error(`Python process timed out after ${timeout/1000} seconds`);
        pythonProcess.kill();
        reject(new Error(`Python process timed out after ${timeout/1000} seconds`));
      }, timeout);
      
      let dataString = '';
      let errorString = '';
      
      // Collect data from stdout
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        dataString += chunk;
        
        // Only log INFO messages, don't log JSON data
        const lines = chunk.split('\n');
        lines.forEach(line => {
          if (line.trim().startsWith('INFO:') || line.trim().startsWith('ERROR:')) {
          }
        });
      });
      
      // Collect any errors
      pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
        console.error(`Python stderr: ${data.toString()}`);
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        // Clear the timeout
        clearTimeout(timeoutId);
        
        if (isTimedOut) return; // Skip processing if timed out
        
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`Error: ${errorString}`);
          reject(new Error(`Python process failed with code ${code}: ${errorString}`));
          return;
        }
        
        try {
          
          // Find the JSON object by looking for the structure that looks like JSON
          const jsonMatches = dataString.match(/\{[\s\S]*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // Take the last (and typically largest) JSON object found
            const lastJsonObject = jsonMatches[jsonMatches.length - 1];
            
            try {
              const result = JSON.parse(lastJsonObject);
              
              // Check if the result is an error response
              if (result.error) {
                console.warn("Received error response from Python script:", result.message);
                resolve(result); // Still resolve since it's a valid error response
                return;
              }
              
              // Validate that the result has a trends array for non-error responses
              if (!result.trends || !Array.isArray(result.trends) || result.trends.length === 0) {
                console.warn("JSON result contains no trends array or empty trends");
                resolve({
                  error: true,
                  message: "Invalid trends data received from analysis",
                  metadata: {
                    generated_at: new Date().toISOString(),
                    error_details: "The analysis result is missing required trend data.",
                    source: "Error Response"
                  }
                });
                return;
              }
              
              resolve(result);
            } catch (jsonError) {
              console.error('Error parsing trends JSON data:', jsonError);
              resolve({
                error: true,
                message: "Failed to parse analysis results",
                metadata: {
                  generated_at: new Date().toISOString(),
                  error_details: `Error parsing JSON response: ${jsonError.message}`,
                  source: "Error Response"
                }
              });
            }
          } else {
            console.error("No valid JSON found in trends output");
            resolve({
              error: true,
              message: "Invalid response format from analysis",
              metadata: {
                generated_at: new Date().toISOString(),
                error_details: "The analysis script did not return valid JSON data.",
                source: "Error Response"
              }
            });
          }
        } catch (error) {
          console.error('Error processing Python trends output:', error);
          resolve({
            error: true,
            message: "Error processing analysis results",
            metadata: {
              generated_at: new Date().toISOString(),
              error_details: error.message,
              source: "Error Response"
            }
          });
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error('Error starting Python process:', error);
        resolve({
          error: true,
          message: "Failed to start analysis process",
          metadata: {
            generated_at: new Date().toISOString(),
            error_details: `Failed to start Python process: ${error.message}`,
            source: "Error Response"
          }
        });
      });
    });
  }

  /**
   * Run the pa.py script for predictive analysis and return the results
   * @param {Object} options - Configuration options for the predictive analysis
   * @returns {Promise} - Promise that resolves with analysis data
   */
  static runPredictiveAnalysis(options = {}) {
    return new Promise((resolve, reject) => {
      // Path to the Python script
      const scriptPath = path.join(__dirname, '..', 'AI', 'pa.py');

      // Set up environment variables - add AI directory to PYTHONPATH
      const aiDirPath = path.join(__dirname, '..', 'AI');
      const env = Object.assign({}, process.env);
      
      // Set PYTHONPATH to include our AI directory for module imports
      if (env.PYTHONPATH) {
        env.PYTHONPATH = `${aiDirPath}${path.delimiter}${env.PYTHONPATH}`;
      } else {
        env.PYTHONPATH = aiDirPath;
      }
      
      // Spawn the Python process with the enhanced environment
      const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, JSON.stringify(options)], { env });
      
      let dataString = '';
      let errorString = '';
      
      // Collect data from stdout
      pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
      });
      
      // Collect any errors
      pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`Error: ${errorString}`);
          reject(new Error(`Python process failed with code ${code}: ${errorString}`));
          return;
        }
        
        try {
          // Improved JSON parsing with better error handling
          const trimmedData = dataString.trim();
          
          // Try to parse the entire output as JSON first
          try {
            const result = JSON.parse(trimmedData);
            resolve(result);
            return;
          } catch (e) {
            console.log("Couldn't parse entire output as JSON, trying to extract JSON portion");
          }
          
          // Extract JSON using regex to find valid JSON objects
          const jsonRegex = /\{[\s\S]*?\}/g;
          const jsonMatches = trimmedData.match(jsonRegex);
          
          if (jsonMatches && jsonMatches.length > 0) {
            for (const match of jsonMatches) {
              try {
                const result = JSON.parse(match);
                resolve(result);
                return;
              } catch (jsonError) {
                console.log(`Failed to parse JSON match: ${jsonError.message}`);
              }
            }
          }
          
          // Extracts the largest JSON-like structure
          const jsonStartIndex = trimmedData.indexOf('{');
          const jsonEndIndex = trimmedData.lastIndexOf('}') + 1;
          
          if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
            // Clean the JSON string - remove any non-JSON content
            let jsonContent = trimmedData.substring(jsonStartIndex, jsonEndIndex);
            
            // Try to clean up common issues in the JSON string
            try {
              // Replace single quotes with double quotes (Python often uses single quotes)
              jsonContent = jsonContent.replace(/'/g, '"');
              
              // Fix unquoted property names
              jsonContent = jsonContent.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
              
              const result = JSON.parse(jsonContent);
              resolve(result);
              return;
            } catch (jsonError) {
              console.error('Error parsing cleaned JSON:', jsonError);
            }
          }
          
          // Return a properly formatted JSON object with the raw output
          resolve({
            success: false,
            rawOutput: trimmedData,
            message: 'Predictive analysis completed but JSON parsing failed',
            data: {
              analysis_type: options.analysis_type || 'general',
              timestamp: new Date().toISOString(),
              error: 'JSON parsing failed'
            }
          });
        } catch (error) {
          console.error('Error processing Python output:', error);
          reject(error);
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        reject(error);
      });
    });
  }

  /**
   * Express middleware for handling predictive analysis requests
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static handlePredictiveAnalysisRequest(req, res) {
    const options = req.body;
    
    PyBridgePA.runPredictiveAnalysis(options)
      .then(result => {
        // Ensure we're always returning a valid JSON object
        if (typeof result !== 'object' || result === null) {
          result = {
            success: false,
            message: 'Invalid result format',
            data: null
          };
        }
        res.json(result);
      })
      .catch(error => {
        console.error('Error running predictive analysis:', error);
        res.status(500).json({
          success: false,
          message: 'Error running predictive analysis',
          error: error.message
        });
      });
  }

  /**
   * Handle predictive analysis trends request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static handlePaTrendsRequest(req, res) {
    const options = {
        view_by: req.query.view_by || 'Committee',
        category: req.query.category === 'None' ? undefined : req.query.category,
        custom_category: req.query.customCategory,
        year: req.query.year
    };

    PyBridgePA.runPredictiveAnalysis(options)
        .then(result => {
            if (typeof result !== 'object' || result === null) {
                return res.status(500).json({
                    error: true,
                    message: 'Invalid result format from analysis script',
                    data: null
                });
            }
            res.json(result);
        })
        .catch(error => {
            console.error('Error running predictive analysis trends:', error);
            res.status(500).json({
                error: true,
                message: 'Error running predictive analysis trends',
                details: error.message
            });
        });
  }

  /**
   * Run the paCstm.py script for customized predictive analysis and return the results
   * @param {Object} data - Data for analysis (currently unused by paCstm.py via args, potentially remove later if not needed)
   * @param {Object} options - Configuration options for the customized analysis
   * @returns {Promise} - Promise that resolves with customized analysis data
   */
  static runCustomizedAnalysis(data = {}, options = {}) { // data argument kept for consistency, but options are key
    return new Promise((resolve, reject) => {
      // Path to the Python script
      const scriptPath = path.join(__dirname, '..', 'AI', 'paCstm.py');

      // Convert the options object to a JSON string
      const optionsJsonString = JSON.stringify(options);

      // Spawn the Python process, passing the script path AND the options JSON string
      const pythonProcess = spawn(PYTHON_EXECUTABLE, [
          scriptPath,
          optionsJsonString 
      ]);

      let dataString = '';
      let errorString = '';

      // Collect data from stdout
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        dataString += chunk;
      });

      // Collect any errors from stderr
      pythonProcess.stderr.on('data', (data) => {
        const errorChunk = data.toString();
        errorString += errorChunk;
        console.error(`Python stderr chunk: ${errorChunk}`);
      });

      // Handle process completion
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Full Python stderr for paCstm.py:\n${errorString}`);
          // Reject with a more informative error, including stderr if available
          reject(new Error(`Python process failed (Code ${code}). Stderr: ${errorString || 'N/A'}`));
          return;
        }

        try {
          // Attempt to parse the entire received string as JSON
          const result = JSON.parse(dataString.trim());
          resolve(result);
        } catch (error) {
          console.error('Node.js failed to parse JSON output from paCstm.py:', error);
          console.error('Raw data received from Python:', dataString);
          reject(new Error(`Failed to parse JSON output from Python script. Raw output: ${dataString}`));
        }
      });

      // Handle process spawning errors
      pythonProcess.on('error', (error) => {
        console.error('Node.js failed to start Python process:', error);
        reject(error);
      });
    });
  }

  /**
   * Express middleware for handling customized predictive analysis requests
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static handleCustomizedAnalysisRequest(req, res) {
    const { data, options } = req.body;
    
    PyBridgePA.runCustomizedAnalysis(data, options)
      .then(result => {
        // Ensure we're always returning a valid JSON object
        if (typeof result !== 'object' || result === null) {
          result = {
            success: false,
            message: 'Invalid result format',
            data: null
          };
        }
        res.json(result);
      })
      .catch(error => {
        console.error('Error running customized analysis:', error);
        res.status(500).json({
          success: false,
          message: 'Error running customized analysis',
          error: error.message
        });
      });
  }
}

module.exports = PyBridgePA;