// Shared DOM references for the risk card, theme toggle, and result UI.
const emailConfidenceBarElement = document.getElementById('emailConfidenceBar');
const riskCardElement = document.getElementById('riskCard');
const riskLevelTextElement = document.getElementById('riskLevelText');
const themeToggleButton = document.getElementById('themeToggle');
// This heading lives inside the shared risk card, so we toggle it based on the active checker mode.
const testedUrlHeadingElement = document.getElementById('testedUrlHeading');
// Risk labels and colors for the shared wave bar.
// These do not depend on light/dark mode because risk severity should stay visually consistent.
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

// Switches the result message between the neutral/default style and the error style.
function setResultState(resultDiv, state) {
    if (!resultDiv) {
        return;
    }

    resultDiv.classList.remove('result-default', 'result-error');
    resultDiv.classList.add(state === 'error' ? 'result-error' : 'result-default');
}

// Applies either the light or dark theme by changing body[data-theme].
// CSS listens for this attribute and swaps the color variables automatically.
function applyTheme(theme) {
    document.body.dataset.theme = theme;

    // The button label tells the user what the next click will do.
    if (themeToggleButton) {
        themeToggleButton.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
}

// Initializes the theme when the page first loads.
// Priority order:
// 1. Use the user's saved choice from localStorage.
// 2. If nothing was saved yet, fall back to the system color-scheme preference.
function initializeThemeToggle() {
    const savedTheme = localStorage.getItem('theme');
    const preferredTheme = savedTheme || (
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    );

    // Apply the starting theme immediately so the page renders with the right colors.
    applyTheme(preferredTheme);

    if (!themeToggleButton) {
        return;
    }

    // When the button is clicked, flip to the opposite theme and save that choice.
    themeToggleButton.addEventListener('click', () => {
        const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        localStorage.setItem('theme', nextTheme);
    });
}

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

// Keeps the result text, wave bar, and risk label in sync visually.
// This is why one risk score updates several parts of the UI at once.
function applyRiskStyle(score, resultDiv) {
    const riskStyle = getRiskStyle(score);

    if (resultDiv) {
        // Risk states still use direct colors because they are semantic feedback,
        // not part of the page theme. We also remove any default/error theme class first.
        resultDiv.style.color = riskStyle.color;
        resultDiv.classList.remove('result-default', 'result-error');
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

// Shows the shared bar card and fills it with the latest score.
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

// Moves the one shared risk card between the URL and Email panels.
// Instead of rendering two separate cards, we reuse the same element and place it under the active checker.
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

// Turns backend prediction data into one number the UI can use as a risk score.
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

// Hides and resets the shared risk UI when switching tabs or when a request fails.
function hideEmailConfidenceBar() {
    if (!emailConfidenceBarElement) {
        return;
    }

    if (riskCardElement) {
        riskCardElement.style.display = 'none';
    }
    const bar = emailConfidenceBarElement.ldBar || new ldBar(emailConfidenceBarElement);
    bar.set(0, false);

    // Reset the bar styling back to the "low/default" appearance after hiding it.
    applyRiskStyle(0);
}

// CHECK URL FUNCTION:
// 1. Read the URL from the input.
// 2. Ask the Python service for a phishing prediction.
// 3. Update the shared risk card with that score.
// 4. Send the URL to the Node backend so it can be stored.
function checkURL() {
    // Get the text the user typed and the div where we will show status/error feedback.
    const userUrl = document.getElementById('urlInput');
    const resultDiv = document.getElementById('result');
    const url = userUrl.value.trim();

    resultDiv.innerHTML = "";


    // Validation: Don't do anything if the input is empty
    if (!url) {
        // resultDiv.style.color = '#7a1f1f';
        resultDiv.innerHTML = "Please paste a URL first!";
        return;
    }

    // Update the shared heading so the risk card shows which URL was just tested.
    document.getElementById('testedUrlHeading').textContent = `Tested URL: ${url}`;

    // UI FEEDBACK: Let the user know the process has started
    // Added so the shared risk card appears inside the URL panel.
    mountRiskCard('url');
    
    // Show the risk bar immediately at 0 so the user gets instant visual feedback.
    setEmailConfidenceBar(0);

    // Ask the Python ML service for the phishing prediction.
    fetch('http://localhost:5000/predict_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
    })
    .then(response => response.json())
    .then(prediction => {
        // Convert the backend response into one normalized risk score for the UI.
        const riskScore = getRiskScore(prediction).toFixed(1);
        setEmailConfidenceBar(riskScore);
        applyRiskStyle(riskScore, resultDiv);
       
        // Send the checked URL to the Node backend so it can be stored in the database.
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
            
            // // If the server says redirect is true, send them to login
            // if (data.redirect) {
            //     window.location.href = "login.html"; 
            //     return;
            // }
            // POSTPONED



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
        // If the Python service is unavailable, show the error style instead of the default style.
        console.error("Prediction error:", err);
        hideEmailConfidenceBar();
        setResultState(resultDiv, 'error');
        resultDiv.innerHTML = "❌ Prediction service unavailable. Make sure Python service is running on port 5000.";
    });
    
}

// ANALYZE EMAIL FUNCTION:
// Same flow as URL checking, but it collects the four email fields,
// sends them to the Python model, updates the shared risk card,
// and then stores the submission through the Node backend.
function analyzeEmail() {
    // Get the values from the email input fields.
    const sender = document.getElementById('sender');
    const receiver = document.getElementById('receiver');
    const subject = document.getElementById('subject');
    const body_content = document.getElementById('email-body');
    const resultDiv = document.getElementById('result');

    resultDiv.innerHTML = "";

    // 2. Validation: ALL fields are now required (sender, receiver, subject, body)
    // All four fields are required before the model is called.
    if (!sender.value.trim() || !receiver.value.trim() || !subject.value.trim() || !body_content.value.trim()) {

        resultDiv.innerHTML = "Please fill in all email fields: Sender, Receiver, Subject, and Body.";
        return;
    }

    // Added so the shared risk card appears inside the Email panel.
    mountRiskCard('email');
    // Show the bar immediately so the user sees the email is being processed.
    setEmailConfidenceBar(0);

    // Ask the Python ML service for the email phishing prediction.
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
        // Convert the model response into the shared UI risk score.
        const riskScore = getRiskScore(prediction).toFixed(1);
        setEmailConfidenceBar(riskScore);
        applyRiskStyle(riskScore, resultDiv);
        
        // Store the analyzed email submission through the existing Node backend.
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

        // Clear the form once the prediction and storage calls finish.
        sender.value = "";
        receiver.value = "";
        subject.value = "";
        body_content.value = "";
    })
    .catch(err => {
        // Put the result message into the error theme class if the prediction service fails.
        console.error("Prediction error:", err);
        hideEmailConfidenceBar();
        setResultState(resultDiv, 'error');
        resultDiv.innerHTML = "❌ Prediction service unavailable. Make sure Python service is running on port 5000.";
    });
}

/*
 * Feature: Checker Mode Switch
 * Toggles the visible panel (URL or Email) and active tab button.
 * This also resets the result state so an old error or risk color does not linger
 * when the user moves between checkers.
 */
const modeButtons = document.querySelectorAll('.mode-btn');
const panels = document.querySelectorAll('.panel');

function setCheckerMode(mode) {
    // Move the shared risk card to the selected panel first.
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
        // Clear any previous direct risk color and return to the default theme-aware result style.
        resultDiv.style.color = '';
        setResultState(resultDiv, 'default');
        resultDiv.innerHTML = ""; 
    }

    // Hide the risk bar until the next scan starts.
    hideEmailConfidenceBar();

}

// Hooks up click handlers for the URL/Email mode buttons on first load.
function initializeCheckerModeSwitch() {
    if (!modeButtons.length || !panels.length) {
        return;
    }

    // Start with the shared risk card mounted under the URL checker.
    mountRiskCard('url');

    modeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCheckerMode(button.dataset.mode);
        });
    });
}

// Initialize theme handling first so the page colors are correct immediately.
initializeThemeToggle();

// Then initialize the checker panel tabs.
initializeCheckerModeSwitch();
