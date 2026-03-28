const express = require('express');
const path = require('path');
const mysql = require('mysql2'); 

const app = express();
app.use(express.static('public'));
app.use(express.json()); 

// DATABASE CONNECTION
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Put your password here if you have one
    database: 'phishing_db'
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL database.');

    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS urls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        url TEXT,
        subject TEXT,
        sender TEXT,
        body_content TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    db.query(createTableQuery, (err) => {
        if (err) console.error("Error creating table:", err);
        else console.log("Table 'urls' is ready.");
    });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/check', (req, res) => {
    const { url, subject, sender, body_content } = req.body;
    
    console.log("Saving to Database:", { url, subject, sender });

    const insertQuery = 'INSERT INTO urls (url, subject, sender, body_content) VALUES (?, ?, ?, ?)';
    
    db.query(insertQuery, [url, subject, sender, body_content], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database save failed" });
        }
        res.json({ 
            message: `Logged! Subject: "${subject}" is being analyzed.` 
        });
    });
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});