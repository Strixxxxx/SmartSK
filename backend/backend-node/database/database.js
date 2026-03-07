const sql = require('mssql');
const dotenv = require('dotenv');

const path = require('path');
//Configuration of local .env from backend root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Database configuration is loaded from environment variables provided by the platform.
const dbConfig = {
  server: process.env.DB_SERVER,
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
  console.error('FATAL ERROR: DB_SERVER environment variable is not set.');
  process.exit(1);
}

// Create a connection pool
const pool = new sql.ConnectionPool(dbConfig);
const poolConnect = pool.connect();

// Handle connection events
pool.on('connect', () => {
  console.log('Database connected successfully.');
});

// Log detailed pool errors
pool.on('error', (err) => {
  console.error('Database Pool Error:', err);
});

// Handle initial connection errors and exit loudly
poolConnect.catch(err => {
  console.error('FATAL: Initial database connection failed:', err);
  process.exit(1);
});

// Export the pool for use in other modules
module.exports = {
  getConnection: async () => {
    await poolConnect; // Ensures the initial connection is complete before returning the pool
    return pool;
  },
  sql: sql
};