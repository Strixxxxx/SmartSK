const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../database/database');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  // Get the authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log('No authorization header found');
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }
  
  // Extract the token (remove "Bearer " prefix if present)
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;
  
  if (!token) {
    console.log('No token found in authorization header');
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'your-secret-key-here');
    
    // Add the decoded user to the request object
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed');
    return res.status(401).json({
      success: false,
      message: 'Authentication failed - invalid token'
    });
  }
};

// Middleware to check if user is an admin
// Combining both isAdmin implementations into one comprehensive function
const isAdmin = async (req, res, next) => {
  
  if (!req.user) {
    console.log('No user found in request');
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
  
  try {
    // First check if position is directly available in the token
    if (req.user.position === 'MA' || req.user.position === 'SA') {
      return next();
    }
    
    // If not, query the database to verify
    const userId = req.user.userId;
    
    const pool = await getConnection();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT position
        FROM userInfo
        WHERE userID = @userId
      `);
    
    if (result.recordset.length === 0) {
      console.log('User not found in database');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const userPosition = result.recordset[0].position;
    
    // Check if position is MA or contains admin
    if (userPosition === 'MA' || userPosition === 'SA' || userPosition.toLowerCase().includes('admin')) {
      next(); // User is an admin, proceed
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }
  } catch (error) {
    console.error('Error checking admin status');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while checking admin status'
    });
  }
};

// Add a new endpoint to check admin status
const checkAdminStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const pool = await getConnection();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT position
        FROM userInfo
        WHERE userID = @userId
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        isAdmin: false
      });
    }
    
    const userPosition = result.recordset[0].position;
    const isAdminUser = userPosition === 'MA' || userPosition === 'SA' || userPosition.toLowerCase().includes('admin');
    
    return res.json({
      success: true,
      isAdmin: isAdminUser
    });
  } catch (error) {
    console.error('Error checking admin status');
    return res.status(500).json({
      success: false,
      message: 'An error occurred while checking admin status',
      isAdmin: false
    });
  }
};

module.exports = {
  verifyToken,
  isAdmin,
  checkAdminStatus
};