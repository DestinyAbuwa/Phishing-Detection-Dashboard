
// Import the Express framework (the 'kit' for building servers)
const express = require('express');

// Import 'path' (a built-in tool to help find folders on your computer)
const path = require('path');

// IMPORT DATABASE: This pulls in the connection logic from the 'database.js' file
// so this server can actually talk to the MySQL 'phishing_db'.
const db = require('./database');

// Initialize the app so we can start adding features to it
const app = express();

// MIDDLEWARE: Tell the server that if a user asks for an image or CSS file, 
// look inside the 'public' folder automatically.
app.use(express.static('public'));

// THE ROUTE: This listens for someone visiting your "Homepage" (the / path)
app.get('/', (req, res) => {
  
  // 'req' (Request) = Info coming IN from the user.
  // 'res' (Response) = What we send BACK to the user.
  
  // Here, we find the index.html file inside 'public' and ship it to their browser.
  // __dirname (usually used instead of __context) means "the folder this file is in."
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.use(express.json()); // This allows the server to read the URL you sent

// THE CHECK ROUTE: This handles the URL submissions from the frontend.
app.post('/api/check', (req, res) => {
    // Extract everything the user typed in from the 'request body'
    // We use the names: url, subject, sender, receiver, and body_content
    const { url, subject, sender, receiver, body_content } = req.body;

    console.log("Server received submission for:", url || subject);

    // SQL COMMAND: We prepare a 'query' to tell MySQL to put this URL into our table.
    // The '?' are placeholders to keep the data secure (prevents SQL Injection).
    const sql = `INSERT INTO submissions 
                 (url, sender_email, receiver_email, subject, email_body, status) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [url, sender, receiver, subject, body_content, 'pending'];

    // RUN THE QUERY: Send the command to the database
    db.query(sql, values, (err, result) => {
        // ERROR HANDLING: If the database is off or the table is missing, tell the user.
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Failed to save to database" });
        }

        // SUCCESS: If it worked, we send back a JSON response with the new ID number.
        res.json({ 
            message: "Submission received and saved to database!",
            submissionId: result.insertId 
        });
    });
});




// THE LISTENER: This turns the server on. 
// It stays open 'listening' for requests on Port 3000.
app.listen(3000, () => {
  // This message only appears in YOUR terminal, not the user's browser.
  console.log('Server started on http://localhost:3000');
});