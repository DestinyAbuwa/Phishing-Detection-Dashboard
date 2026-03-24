// DATABASE CONNECTION CONFIGURATION
// This file handles the "handshake" between our Node.js server and the MySQL database.

//Load environment variables from the .env file (keeps our passwords secret!)
require('dotenv').config();

//Import the MySQL2 library to allow Node.js to communicate with the DB
const mysql = require('mysql2');

// CREATE A CONNECTION POOL:
// Instead of opening one single connection, a 'pool' manages multiple connections 
// for us. This is faster and more reliable for web applications.
const connection = mysql.createPool({
  host: process.env.DB_HOST,      // The server location (usually localhost)
  user: process.env.DB_USER,      // Your MySQL username
  password: process.env.DB_PASSWORD, // Your MySQL password (hidden in .env)
  database: process.env.DB_NAME      // The specific schema we created: 'phishing_db'
});

// TEST THE CONNECTION: Runs as soon as the server starts to ensure the DB is awake
connection.getConnection((err) => {
  if (err) {
    console.error('❌ Database Connection Failed: ' + err.stack);
    return;
  }
  console.log('✅ Connected to MySQL Database. Thread ID: ' + connection.threadId);
});

// 5. EXPORT: This allows other files (like index.js) to use this connection
module.exports = connection;