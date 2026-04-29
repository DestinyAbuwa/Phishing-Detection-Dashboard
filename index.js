
// Import the Express framework (the 'kit' for building servers)
const express = require('express');

// Import 'path' (a built-in tool to help find folders on your computer)
const path = require('path');

const session = require('express-session');

// crypto is built into Node — used to hash passwords with scrypt before storing
// them in the users table. Stored format is "salt:hash" (both hex).
const crypto = require('crypto');

// IMPORT DATABASE: This pulls in the connection logic from the 'database.js' file
// so this server can actually talk to the MySQL 'phishing_db'.
const db = require('./database');

// Hash a plaintext password with a fresh random salt. Returns "salt:hash".
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Verify a plaintext password against a stored "salt:hash". timingSafeEqual
// avoids leaking timing info on comparison.
function verifyPassword(password, storedHash) {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const candidateHash = crypto.scryptSync(password, salt, 64);
    const originalBuffer = Buffer.from(originalHash, 'hex');
    if (originalBuffer.length !== candidateHash.length) return false;
    return crypto.timingSafeEqual(originalBuffer, candidateHash);
}

// Initialize the app so we can start adding features to it
const app = express();

// 2. SESSION SETTINGS: This tells the server how to remember users
app.use(session({
    secret: 'phishing-dashboard-secret', // A secret key to sign the session cookie
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // Session lasts for 24 hours
}));

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
    
    // 3. INITIALIZE THE COUNTER: If it's their first scan, start at 0
    if (req.session.scanCount === undefined) {
        req.session.scanCount = 0;
    }

    // 4. CHECK THE LIMIT: If they've already done 3, tell the frontend to redirect.
    //    Logged-in users bypass the limit entirely.
    if (!req.session.user && req.session.scanCount >= 3) {
        console.log("Limit reached for this session.");
        return res.status(403).json({
            redirect: true,
            message: "Scan limit reached. Please login to continue."
        });
    }

    
    // Extract everything the user typed in from the 'request body'
    // We use the names: url, subject, sender, receiver, and body_content
    const { url, subject, sender, receiver, body_content, risk_score, status } = req.body;

    console.log(`Result for ${url || subject}: ${status} (${risk_score}%)`);

    // 5. INCREMENT THE COUNTER: Add 1 to their total scans
    req.session.scanCount++;
    console.log(`Scan #${req.session.scanCount} for this session.`);


    // SQL COMMAND: We prepare a 'query' to tell MySQL to put this URL into our table.
    // The '?' are placeholders to keep the data secure (prevents SQL Injection).
    const sql = `INSERT INTO submissions 
                 (url, sender_email, receiver_email, subject, email_body, risk_score, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const values = [url, sender, receiver, subject, body_content, risk_score || 0, status || 'pending'];

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
            submissionId: result.insertId,
            scanCount: req.session.scanCount
        });
    });
});




// SIGNUP ROUTE: Creates a new account, stores it in the users table, and
// logs the user in (sets req.session.user) so they bypass the scan limit.
app.post('/api/signup', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    // username column is NOT NULL UNIQUE — derive it from the email and cap at 50.
    const username = normalizedEmail.slice(0, 50);
    const passwordHash = hashPassword(password);

    const sql = `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`;
    db.query(sql, [username, normalizedEmail, passwordHash], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: "An account with this email already exists." });
            }
            console.error("Signup database error:", err);
            return res.status(500).json({ error: "Failed to create account." });
        }

        // Log the new user in immediately and reset the scan counter.
        req.session.user = { id: result.insertId, email: normalizedEmail };
        req.session.scanCount = 0;
        res.json({ success: true, user: req.session.user });
    });
});

// LOGIN ROUTE: Verifies an email/password against the users table and starts
// a session if the credentials are valid.
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    db.query(`SELECT id, email, password_hash FROM users WHERE email = ?`, [normalizedEmail], (err, rows) => {
        if (err) {
            console.error("Login database error:", err);
            return res.status(500).json({ error: "Login failed. Try again." });
        }
        if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        req.session.user = { id: rows[0].id, email: rows[0].email };
        req.session.scanCount = 0;
        res.json({ success: true, user: req.session.user });
    });
});

// CAN-SCAN ROUTE: Pre-flight check — frontend calls this before running a
// prediction so the prediction never happens at all if the user is already
// over the limit. Logged-in users always pass.
app.get('/api/can-scan', (req, res) => {
    if (req.session.user) {
        return res.json({ allowed: true });
    }
    const scanCount = req.session.scanCount || 0;
    if (scanCount >= 3) {
        return res.json({ allowed: false });
    }
    res.json({ allowed: true });
});

// SESSION ROUTE: Lets the frontend know who (if anyone) is currently logged in.
// Returns { user: { id, email } } or { user: null }. Used on page load to set
// the nav buttons to the correct state.
app.get('/api/session', (req, res) => {
    res.json({ user: req.session.user || null });
});

// LOGOUT ROUTE: Destroys the session entirely (which also wipes scanCount —
// the next anonymous session starts fresh at 0).
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({ error: "Failed to log out." });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// THE LISTENER: This turns the server on.
// It stays open 'listening' for requests on Port 3000.
app.listen(3000, () => {
  // This message only appears in YOUR terminal, not the user's browser.
  console.log('Server started on http://localhost:3000');
});