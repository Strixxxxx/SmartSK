// JWT configuration
module.exports = {
  secret: process.env.JWT_SECRET_KEY,
  expiresIn: '24h' // Token expiration time
};