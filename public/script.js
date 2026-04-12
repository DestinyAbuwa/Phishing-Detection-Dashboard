
const emailConfidenceBarElement = document.getElementById('emailConfidenceBar');
const riskCardElement = document.getElementById('riskCard');
const riskLevelTextElement = document.getElementById('riskLevelText');
// This heading lives inside the shared risk card, so we toggle it based on the active checker mode.
const testedUrlHeadingElement = document.getElementById('testedUrlHeading');
// Added for the shared risk UI so both checkers use the same score labels and colors.
const RISK_STYLES = {
    low: {
        label: 'Low Risk',
        color: '#1f8f4e',
        trailColor: '#bfe7cf'
    },
    medium: {
        label: 'Medium Risk',
        color: '#b7791f',
        trailColor: '#f3ddb7'
    },
    high: {
        label: 'High Risk',
        color: '#7a1f1f',
        trailColor: '#e7bcbc'
    }
};

// Added to group numeric scores into your Low / Medium / High risk ranges.
function getRiskStyle(score) {
    const normalizedScore = Math.max(0, Math.min(100, Number(score) || 0));

    if (normalizedScore <= 39) {
        return RISK_STYLES.low;
    }

    if (normalizedScore <= 69) {
        return RISK_STYLES.medium;
    }

    return RISK_STYLES.high;
}

// Added to keep the result text, wave bar, and risk label in sync visually.
function applyRiskStyle(score, resultDiv) {
    const riskStyle = getRiskStyle(score);

    if (resultDiv) {
        resultDiv.style.color = riskStyle.color;
    }

    if (!emailConfidenceBarElement) {
        return riskStyle;
    }

    const bar = emailConfidenceBarElement.ldBar || new ldBar(emailConfidenceBarElement);
    const mainline = emailConfidenceBarElement.querySelector('.mainline');
    const baseline = emailConfidenceBarElement.querySelector('.baseline');
    const label = emailConfidenceBarElement.querySelector('.ldBar-label');

    if (mainline) {
        mainline.setAttribute('stroke', riskStyle.color);
    }

    if (baseline) {
        baseline.setAttribute('stroke', riskStyle.trailColor);
    }

    if (label) {
        label.style.color = riskStyle.color;
    }

    if (riskLevelTextElement) {
        riskLevelTextElement.textContent = riskStyle.label;
        riskLevelTextElement.style.color = riskStyle.color;
    }

    if (riskCardElement) {
        riskCardElement.style.borderColor = riskStyle.trailColor;
    }

    return riskStyle;
}

// Added to show the shared bar card and fill it with the latest score.
function setEmailConfidenceBar(value) {
    if (!emailConfidenceBarElement) {
        return;
    }

    if (riskCardElement) {
        riskCardElement.style.display = 'block';
    }
    const bar = emailConfidenceBarElement.ldBar || new ldBar(emailConfidenceBarElement);
    const normalizedValue = Math.max(0, Math.min(100, Number(value) || 0));
    bar.set(normalizedValue);
}

// Added so one shared risk card can be moved between the URL and Email panels.
function mountRiskCard(mode) {
    if (!riskCardElement) {
        return;
    }

    const targetPanel = document.querySelector(`.panel-${mode}`);
    if (targetPanel && riskCardElement.parentElement !== targetPanel) {
        // Move the shared risk card into whichever panel is currently active.
        targetPanel.appendChild(riskCardElement);
    }

    if (testedUrlHeadingElement) {
        // Only show "Tested URL:" when the URL checker is active.
        testedUrlHeadingElement.style.display = mode === 'url' ? 'block' : 'none';
    }
}

// Added to turn backend prediction data into one number the UI can use as a risk score.
function getRiskScore(prediction) {
    if (prediction && prediction.risk_score != null) {
        return Number(prediction.risk_score);
    }

    // Fallback: if the backend only returns confidence, convert it into a risk-like score.
    // Phishing + high confidence => high risk. Legitimate + high confidence => low risk.
    const confidencePercent = (Number(prediction?.confidence) || 0) * 100;
    return prediction?.label === 'Phishing'
        ? confidencePercent
        : 100 - confidencePercent;
}

// Added to hide and reset the shared risk UI when switching tabs or when a request fails.
function hideEmailConfidenceBar() {
    if (!emailConfidenceBarElement) {
        return;
    }

    if (riskCardElement) {
        riskCardElement.style.display = 'none';
    }
    const bar = emailConfidenceBarElement.ldBar || new ldBar(emailConfidenceBarElement);
    bar.set(0, false);
    applyRiskStyle(0);
}
// CHECK URL FUNCTION: This runs when the user clicks the "Scan" button.
// It grabs the URL from the input box and sends it to our Node.js server.
function checkURL() {
    // Get the text the user typed and the div where we will show the result
    const userUrl = document.getElementById('urlInput');
    const resultDiv = document.getElementById('result');
    const url = userUrl.value.trim();

    // Validation: Don't do anything if the input is empty
    if (!url) {
        resultDiv.style.color = '#7a1f1f';
        resultDiv.innerHTML = "Please paste a URL first!";
        return;
    }
    document.getElementById('testedUrlHeading').textContent = `Tested URL: ${url}`;

    // UI FEEDBACK: Let the user know the process has started
    // Added so the shared risk card appears inside the URL panel.
    mountRiskCard('url');
    
    // Added so the bar appears immediately at 0 while we wait for the prediction response.
    setEmailConfidenceBar(0);

    // --- NEW: Get prediction from Python ML service (port 5000) ---
    fetch('http://localhost:5000/predict_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
    })
    .then(response => response.json())
    .then(prediction => {
        // Changed from showing raw confidence only to computing one UI risk score.
        const riskScore = getRiskScore(prediction).toFixed(1);
        setEmailConfidenceBar(riskScore);
        const riskStyle = applyRiskStyle(riskScore, resultDiv);
       
        // --- THE FETCH REQUEST (YOUR EXISTING CODE): This is the "bridge" to your Backend.
        // It sends the URL to the '/api/check' route to save to MySQL.
        fetch('/api/check', {
            method: 'POST', // We use POST because we are sending data
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                status: prediction.label,
                risk_score: riskScore // "Phishing" or "Legitimate"
             }) // Convert the URL into a JSON string // The number for your risk_score column
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
        hideEmailConfidenceBar();
        resultDiv.style.color = '#7a1f1f';
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
        resultDiv.style.color = '#7a1f1f';
        resultDiv.innerHTML = "Please fill in all email fields: Sender, Receiver, Subject, and Body.";
        return;
    }

    // Added so the shared risk card appears inside the Email panel.
    mountRiskCard('email');
    // Added so the bar appears immediately at 0 while we wait for the prediction response.
    setEmailConfidenceBar(0);

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
        // Changed from showing raw confidence only to computing one UI risk score.
        const riskScore = getRiskScore(prediction).toFixed(1);
        setEmailConfidenceBar(riskScore);
        const riskStyle = applyRiskStyle(riskScore, resultDiv);
        
        // 3. The Fetch Request (YOUR EXISTING CODE): Sending the data to your Node server for storage
        fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: "", // Since this is an email, the URL can be empty
                sender: sender.value,
                receiver: receiver.value,
                subject: subject.value,
                body_content: body_content.value,
                status: prediction.label,
                risk_score: riskScore
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
        hideEmailConfidenceBar();
        resultDiv.style.color = '#7a1f1f';
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
    mountRiskCard(mode);
    modeButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.mode === mode);
    });

    panels.forEach((panel) => {
        const isSelectedPanel = panel.classList.contains(`panel-${mode}`);
        panel.classList.toggle('active', isSelectedPanel);
    });

    const resultDiv = document.getElementById('result');
    if (resultDiv) {
        resultDiv.style.color = '#14345d';
        resultDiv.innerHTML = ""; 
    }
    hideEmailConfidenceBar();

}

function initializeCheckerModeSwitch() {
    if (!modeButtons.length || !panels.length) {
        return;
    }

    mountRiskCard('url');

    modeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCheckerMode(button.dataset.mode);
        });
    });
}



initializeCheckerModeSwitch();
