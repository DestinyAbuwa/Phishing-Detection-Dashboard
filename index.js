const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Phishing Detection Backend is Online!');
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});