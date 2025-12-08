const { Pool } = require('pg');
require('dotenv').config();

/**
 * PostgreSQL Connection Pool
 * Creates a pool of reusable database connections for better performance
 * Pool automatically manages connections and handles reconnection
 */
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection not available
});

/**
 * Test database connection on startup
 * Logs success or error message
 */
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Query helper function
 * @param {string} text - SQL query string
 * @param {array} params - Query parameters to prevent SQL injection
 * @returns {Promise} - Query result
 */
const query = (text, params) => pool.query(text, params);

module.exports = {
  query,
  pool
};