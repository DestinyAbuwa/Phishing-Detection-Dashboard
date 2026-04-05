// CHECK URL FUNCTION: This runs when the user clicks the "Scan" button.
// It grabs the URL from the input box and sends it to our Node.js server.
function checkURL() {
    // Get the text the user typed and the div where we will show the result
    const userUrl = document.getElementById('urlInput');
    const resultDiv = document.getElementById('result');
    const url = userUrl.value.trim();

    // Validation: Don't do anything if the input is empty
    if (!url) {
        alert("Please paste a URL first!");
        return;
    }

    // UI FEEDBACK: Let the user know the process has started
    resultDiv.innerHTML = "Scanning: " + url + "...";

    // --- NEW: Get prediction from Python ML service (port 5000) ---
    fetch('http://localhost:5000/predict_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
    })
    .then(response => response.json())
    .then(prediction => {
        const confidencePercent = (prediction.confidence * 100).toFixed(1);
        // Display the prediction result to the user
        resultDiv.innerHTML = `<strong>Result:</strong> ${prediction.label} (${confidencePercent}% confidence)`;

        // --- THE FETCH REQUEST (YOUR EXISTING CODE): This is the "bridge" to your Backend.
        // It sends the URL to the '/api/check' route to save to MySQL.
        fetch('/api/check', {
            method: 'POST', // We use POST because we are sending data
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }) // Convert the URL into a JSON string
        })
        .then(response => response.json()) // Wait for the server to send back a JSON response
        .then(data => {
            // Keep the prediction message, but log the database save
            console.log("Submission ID from Database:", data.submissionId);
            // Optionally, you could append a note: resultDiv.innerHTML += `<br><small>Saved to DB (ID: ${data.submissionId})</small>`;
        })
        .catch(err => {
            // ERROR HANDLING: Runs if the database save fails
            console.error("Storage Error:", err);
            // We don't overwrite the prediction result, just log the error
        });

        // Clear the input field
        userUrl.value = "";
    })
    .catch(err => {
        // ERROR HANDLING: Runs if the prediction service is down
        console.error("Prediction error:", err);
        resultDiv.innerHTML = "❌ Prediction service unavailable. Make sure Python service is running on port 5000.";
    });
}

// ANALYZE EMAIL FUNCTION: This runs when the user clicks "Analyze Email"
function analyzeEmail() {
    // 1. Get the values from the email input fields
    // Ensure these IDs match your index.html exactly!
    const sender = document.getElementById('sender');
    const receiver = document.getElementById('receiver');
    const subject = document.getElementById('subject');
    const body_content = document.getElementById('email-body');
    const resultDiv = document.getElementById('result'); // Or a separate result div

    // 2. Validation: ALL fields are now required (sender, receiver, subject, body)
    if (!sender.value.trim() || !receiver.value.trim() || !subject.value.trim() || !body_content.value.trim()) {
        alert("Please fill in all email fields: Sender, Receiver, Subject, and Body.");
        return;
    }

    resultDiv.innerHTML = "Analyzing email content...";

    // --- NEW: Get prediction from Python ML service (port 5000) ---
    fetch('http://localhost:5000/predict_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sender: sender.value,
            receiver: receiver.value,
            subject: subject.value,
            body_content: body_content.value
        })
    })
    .then(response => response.json())
    .then(prediction => {
        const confidencePercent = (prediction.confidence * 100).toFixed(1);
        // Display the prediction result to the user
        resultDiv.innerHTML = `<strong>Result:</strong> ${prediction.label} (${confidencePercent}% confidence)`;

        // 3. The Fetch Request (YOUR EXISTING CODE): Sending the data to your Node server for storage
        fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: "", // Since this is an email, the URL can be empty
                sender: sender.value,
                receiver: receiver.value,
                subject: subject.value,
                body_content: body_content.value
            })
        })
        .then(response => response.json())
        .then(data => {
            // Keep the prediction message, but log the database save
            console.log("Database ID:", data.submissionId);
            // Optionally, you could append a note: resultDiv.innerHTML += `<br><small>Saved to DB (ID: ${data.submissionId})</small>`;
        })
        .catch(err => {
            console.error("Email Submission Error:", err);
            // We don't overwrite the prediction result, just log the error
        });

        // --- THIS CLEARS THE TEXT BOXES ---
        sender.value = "";
        receiver.value = "";
        subject.value = "";
        body_content.value = "";
    })
    .catch(err => {
        console.error("Prediction error:", err);
        resultDiv.innerHTML = "❌ Prediction service unavailable. Make sure Python service is running on port 5000.";
    });
}

/*
 * Feature: Checker Mode Switch
 * Toggles the visible panel (URL or Email) and active tab button.
 */
const modeButtons = document.querySelectorAll('.mode-btn');
const panels = document.querySelectorAll('.panel');

function setCheckerMode(mode) {
    modeButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.mode === mode);
    });

    panels.forEach((panel) => {
        const isSelectedPanel = panel.classList.contains(`panel-${mode}`);
        panel.classList.toggle('active', isSelectedPanel);
    });

    const resultDiv = document.getElementById('result');
    if (resultDiv) {
        resultDiv.innerHTML = ""; 
    }

}

function initializeCheckerModeSwitch() {
    if (!modeButtons.length || !panels.length) {
        return;
    }

    modeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCheckerMode(button.dataset.mode);
        });
    });
}

initializeCheckerModeSwitch();