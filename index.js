// 1. Import the Express framework (the 'kit' for building servers)
const express = require('express');

// 2. Import 'path' (a built-in tool to help find folders on your computer)
const path = require('path');

// 3. Initialize the app so we can start adding features to it
const app = express();

// 4. MIDDLEWARE: Tell the server that if a user asks for an image or CSS file, 
// look inside the 'public' folder automatically.
app.use(express.static('public'));

// 5. THE ROUTE: This listens for someone visiting your "Homepage" (the / path)
app.get('/', (req, res) => {
  
  // 'req' (Request) = Info coming IN from the user.
  // 'res' (Response) = What we send BACK to the user.
  
  // Here, we find the index.html file inside 'public' and ship it to their browser.
  // __dirname (usually used instead of __context) means "the folder this file is in."
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. THE LISTENER: This turns the server on. 
// It stays open 'listening' for requests on Port 3000.
app.listen(3000, () => {
  // This message only appears in YOUR terminal, not the user's browser.
  console.log('Server started on http://localhost:3000');
});