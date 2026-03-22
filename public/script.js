function checkURL() {
    const userUrl = document.getElementById('urlInput').value;
    const resultDiv = document.getElementById('result');

    if (!userUrl) {
        alert("Please paste a URL first!");
        return;
    }

    // Visual feedback for the user
    resultDiv.innerHTML = "Scanning: " + userUrl + "...";

    // Sending the URL to your Backend (index.js)
    fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: userUrl })
    })
    .then(response => response.json())
    .then(data => {
        // Display the result from the server
        resultDiv.innerHTML = `<strong>Result:</strong> ${data.message}`;
    })
    .catch(err => {
        console.error("Error:", err);
        resultDiv.innerHTML = "Error connecting to server.";
    });
}