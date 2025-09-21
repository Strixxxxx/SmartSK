const sql = require('mssql');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Database configuration from environment variables with extended timeouts
const dbConfig = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10),
  requestTimeout: 300000, // 5 minutes
  connectionTimeout: 30000, // 30 seconds
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    charset: 'UTF8'
  }
};

// Validate configuration before creating connection
if (!dbConfig.server) {
  console.error('Database configuration error');
  process.exit(1);
}

// Create a connection pool
const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect();

// Handle connection events
pool.on('connect', () => {
  console.log('Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Database pool error');
});

// Handle connection errors
poolConnect.catch(err => {
  console.error('Database connection error');
});

// Export the pool for use in other modules
module.exports = {
  getConnection: async () => {
    try {
      await poolConnect;
      return pool;
    } catch (err) {
      console.error('Database connection error');
      throw err;
    }
  },
  sql: sql
};