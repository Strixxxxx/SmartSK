const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

class PyBridgeFC {
  /**
   * Run the forecast.py script to get chart data for both views
   */
  static runForecast(options = {}) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '..', 'AI', 'forecast.py');
      const args = []; // No arguments needed to get both chart data views

      const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args]);
      
      let dataString = '';
      let errorString = '';
      
      pythonProcess.stdout.on('data', (data) => { dataString += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { errorString += data.toString(); });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process failed with code ${code}: ${errorString}`);
          return reject(new Error(`Python process failed: ${errorString}`));
        }
        try {
          const result = JSON.parse(dataString);
          if (result.error) {
            return reject(new Error(result.message || 'Forecast generation failed in Python.'));
          }
          resolve(result);
        } catch (e) {
          console.error('Error parsing JSON from Python script:', e);
          reject(new Error('Invalid JSON response from Python script.'));
        }
      });
    });
  }

  /**
   * Helper function to generate a date range for sample data
   * @param {number} days - Number of days to generate
   * @returns {Array} - Array of dates in YYYY-MM-DD format
   */
  static generateDateRange(days = 30) {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
      const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      dates.push(formattedDate);
    }
    
    return dates;
  }
  
  /**
   * Helper function to generate forecast values for sample data
   * @param {number} days - Number of days to generate values for
   * @param {number} multiplier - Multiplier for the values (for upper/lower bounds)
   * @returns {Array} - Array of forecast values
   */
  static generateForecastValues(days = 30, multiplier = 1) {
    const values = [];
    
    for (let i = 0; i < days; i++) {
      // Generate a value between 5 and 15, with some randomness and a slight upward trend
      const base = 10 + (i * 0.1);
      const random = Math.random() * 3 - 1.5; // Random value between -1.5 and 1.5
      const value = (base + random) * multiplier;
      values.push(parseFloat(value.toFixed(2)));
    }
    
    return values;
  }

  /**
   * Run the forecast.py script with the --analysis flag for detailed analysis
   * This function is now async to work better with the handler.
   */
  static async runForecastWithAnalysis(options = {}) {
     return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '..', 'AI', 'forecast.py');
      const args = ['--analysis'];
      
      if (options.view_by) {
        args.push('--view_by', options.view_by);
      }

      console.log('Spawning Python analysis process:', PYTHON_EXECUTABLE, scriptPath, ...args);
      const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args]);
      
      let dataString = '';
      let errorString = '';

      pythonProcess.stdout.on('data', (data) => { dataString += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { errorString += data.toString(); });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Python analysis process failed with code ${code}: ${errorString}`);
            return reject(new Error(`Python analysis process failed: ${errorString}`));
        }
        try {
            const result = JSON.parse(dataString);
            if (result.error) {
                return reject(new Error(result.message || 'Analysis generation failed in Python.'));
            }
            console.log("Successfully parsed forecast analysis from Python.");
            resolve(result);
        } catch (e) {
            console.error('Error parsing JSON from Python analysis script:', e, `Raw Data: ${dataString}`);
            reject(new Error('Invalid JSON response from Python analysis script.'));
        }
      });

      pythonProcess.on('error', (err) => {
        console.error('Failed to start Python analysis process:', err);
        reject(err);
      });
    });
  }

/**
   * Express middleware for handling forecast analysis requests.
   */
  static async handleForecastAnalysisRequest(req, res) {
    try {
      const options = { view_by: req.query.view_by || 'Committee' };
      console.log('Handler: Running forecast analysis with options:', options);
      
      const result = await PyBridgeFC.runForecastWithAnalysis(options);
      res.json(result);
    } catch (error) {
      console.error('Handler Error: Error running forecast analysis:', error);
      res.status(500).json({ 
        error: true, // Ensure the error flag is set
        message: 'Error running forecast analysis', 
        details: error.message 
      });
    }
  }

  /**
   * Run the fcResponse.py script for detailed analysis
   * @param {Object} options - Configuration options for the analysis
   * @returns {Promise} - Promise that resolves with detailed analysis data
   */
  static runDetailedAnalysis(options = {}) {
    return new Promise((resolve, reject) => {
      console.log('=== PyBridgeFC.runDetailedAnalysis called ===');
      console.log('Options received:', options);
      console.log('Python executable:', PYTHON_EXECUTABLE);
      
      const scriptPath = path.join(__dirname, '..', 'AI', 'fcResponse.py');
      console.log('Script path:', scriptPath);
      
      const args = [];
      
      if (options.category) args.push('--category', options.category);
      if (options.committee) args.push('--committee', options.committee);
      if (options.budget) args.push('--budget', options.budget);
      if (options.startDate) args.push('--startDate', options.startDate);
      if (options.endDate) args.push('--endDate', options.endDate);

      console.log('Python command:', PYTHON_EXECUTABLE, scriptPath, ...args);
      const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, ...args]);
      
      let dataString = '';
      let errorString = '';
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error('Python process timed out after 300 seconds');
        pythonProcess.kill('SIGTERM');
        reject(new Error('Python process timed out after 300 seconds'));
      }, 300000); // 5 minutes timeout
      
      // Collect data from stdout
      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        dataString += chunk;
        
        // Log INFO and ERROR messages
        const lines = chunk.split('\n');
        lines.forEach(line => {
          if (line.trim().startsWith('INFO:') || line.trim().startsWith('ERROR:')) {
            console.log(`Python: ${line.trim()}`);
          }
        });
      });
      
      // Collect any errors
      pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
        console.error(`Python stderr: ${data.toString()}`);
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error('Python process error:', error);
        reject(new Error(`Python process error: ${error.message}`));
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        clearTimeout(timeout); // Clear timeout on completion
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`Error: ${errorString}`);
          reject(new Error(`Python process failed with code ${code}: ${errorString}`));
          return;
        }
        
        try {
          console.log("Processing Python analysis output...");
          
          // Find the JSON object by looking for the structure that looks like JSON
          const jsonMatches = dataString.match(/\{[\s\S]*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // Take the last (and typically largest) JSON object found
            const lastJsonObject = jsonMatches[jsonMatches.length - 1];
            console.log("JSON data found in analysis output");
            
            try {
              const result = JSON.parse(lastJsonObject);
              console.log("Successfully parsed analysis JSON result");
              
              // Check if this is an error response
              if (result.error) {
                reject(new Error(result.message || 'Analysis generation failed'));
                return;
              }
              
              // Return the analysis data
              resolve(result);
              return;
            } catch (jsonError) {
              console.error('Error parsing analysis JSON data:', jsonError);
              reject(new Error('Invalid JSON response from analysis script'));
            }
          } else {
            console.log("No valid JSON found in analysis output");
            reject(new Error('No valid response from analysis script'));
          }
        } catch (error) {
          console.error('Error processing Python analysis output:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * Express middleware for handling detailed analysis requests
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleDetailedAnalysisRequest(req, res) {
    try {
      const options = req.query;
      console.log('Running detailed analysis with options:', options);
      
      const result = await PyBridgeFC.runDetailedAnalysis(options);
      res.json(result);
    } catch (error) {
      console.error('Error running detailed analysis:', error);
      res.status(500).json({ 
        error: true,
        message: 'Error running detailed analysis', 
        details: error.message 
      });
    }
  }

  // Note: Project trends functionality moved to PyBridgePA as it now uses paTrends.py
}

module.exports = PyBridgeFC;