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
const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.position) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed: User position not found.'
    });
  }

  const userPosition = req.user.position;

  if (userPosition === 'MA' || userPosition === 'SA') {
    next(); // User is an admin, proceed
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
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