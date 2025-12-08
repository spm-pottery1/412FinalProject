const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Authentication Middleware
 * Verifies JWT token from Authorization header
 * Attaches user data to request object if valid
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateToken = (req, res, next) => {
  // Extract token from Authorization header (format: "Bearer TOKEN")
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // If no token provided, return 401 Unauthorized
  if (!token) {
    return res.status(401).json({ 
      error: 'Access denied. No token provided.' 
    });
  }

  try {
    // Verify token using JWT secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user data to request object for use in route handlers
    req.user = decoded;
    
    // Continue to next middleware/route handler
    next();
  } catch (error) {
    // Token is invalid or expired
    return res.status(403).json({ 
      error: 'Invalid or expired token.' 
    });
  }
};

module.exports = authenticateToken;