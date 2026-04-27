// Shared DOM references for the risk card, theme toggle, and result UI.
const emailConfidenceBarElement = document.getElementById('emailConfidenceBar');
const riskCardElement = document.getElementById('riskCard');
const riskLevelTextElement = document.getElementById('riskLevelText');
const themeToggleButton = document.getElementById('themeToggle');
const urlLastToggleElement = document.getElementById('urlLastToggle');
const urlLastDetailsElement = document.getElementById('urlLastDetails');
const urlLastContentElement = document.getElementById('urlLastContent');
const emailLastToggleElement = document.getElementById('emailLastToggle');
const emailLastDetailsElement = document.getElementById('emailLastDetails');
const emailLastContentElement = document.getElementById('emailLastContent');
// This heading lives inside the shared risk card, so we toggle it based on the active checker mode.
const testedUrlHeadingElement = document.getElementById('testedUrlHeading');
const shapFeatureSummaryElement = document.getElementById('shapFeatureSummary');
let latestShapTopFeatures = [];
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

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}

function formatFeatureValue(value) {
    if (value === null || value === undefined || value === "") {
        return "not available";
    }

    return value;
}

function updateShapFeatureSummary(prediction) {
    if (!shapFeatureSummaryElement) {
        return;
    }

    latestShapTopFeatures = prediction?.top_features || [];

    if (!latestShapTopFeatures.length) {
        shapFeatureSummaryElement.innerHTML = "";
        return;
    }

    const featureItems = latestShapTopFeatures
        .slice(0, 2)
        .map((feature) => {
            const featureName = escapeHTML(feature.feature);
            const featureValue = escapeHTML(formatFeatureValue(feature.value));
            return `<li><span>${featureName}</span> <strong>(${featureValue})</strong></li>`;
        })
        .join("");

    shapFeatureSummaryElement.innerHTML = `
        <p>Top decision features</p>
        <ol>${featureItems}</ol>
    `;
}

function clearShapFeatureSummary() {
    latestShapTopFeatures = [];

    if (shapFeatureSummaryElement) {
        shapFeatureSummaryElement.innerHTML = "";
    }
}
let lastUrlSubmission = null;
let lastEmailSubmission = null;

// ── Report-result UI state ──
// Each checker (URL, Email) has its own "Report Result" button. They share a
// single confirmation popup — just "are you sure?" with Cancel/Submit.
const urlReportButton = document.getElementById('urlReportBtn');
const emailReportButton = document.getElementById('emailReportBtn');
const reportModalElement = document.getElementById('reportModal');
const reportSubmitButton = document.getElementById('reportSubmitBtn');

// Stash the latest scan result for each checker so the eventual /api/report
// POST can include the original verdict + submission that was reported.
// Shape: { riskScore, riskLabel, submission: { url } or { sender, receiver, ... } }
const lastScanResult = { url: null, email: null };

// Which checker opened the modal. Set when the modal opens, cleared when it closes.
// We need this because the modal itself is shared — it doesn't know whether the
// user clicked Report on the URL or Email panel until we tell it.
let activeReportMode = null;

function showLoader(loaderId) {
    const loaderElement = document.getElementById(loaderId);
    if (!loaderElement) {
        return;
    }

    loaderElement.classList.add('is-loading');
}

function hideLoader(loaderId) {
    const loaderElement = document.getElementById(loaderId);
    if (!loaderElement) {
        return;
    }

    loaderElement.classList.remove('is-loading');
}

function createLastSubmissionItem(label, value, multiline = false) {
    const detailItem = document.createElement('div');
    detailItem.className = 'last-submission-item';

    const detailLabel = document.createElement('span');
    detailLabel.className = 'last-submission-item-label';
    detailLabel.textContent = label;

    const detailValue = document.createElement('p');
    detailValue.className = `last-submission-item-value${multiline ? ' is-multiline' : ''}`;
    detailValue.textContent = value;

    detailItem.appendChild(detailLabel);
    detailItem.appendChild(detailValue);
    return detailItem;
}

function getLastSubmissionElements(mode) {
    if (mode === 'url') {
        return {
            toggleElement: urlLastToggleElement,
            detailsElement: urlLastDetailsElement,
            contentElement: urlLastContentElement
        };
    }

    return {
        toggleElement: emailLastToggleElement,
        detailsElement: emailLastDetailsElement,
        contentElement: emailLastContentElement
    };
}

function renderLastSubmission(mode) {
    const { toggleElement, detailsElement, contentElement } = getLastSubmissionElements(mode);
    const submission = mode === 'url' ? lastUrlSubmission : lastEmailSubmission;

    if (!toggleElement || !detailsElement || !contentElement) {
        return;
    }

    if (!submission) {
        toggleElement.hidden = true;
        toggleElement.setAttribute('aria-expanded', 'false');
        detailsElement.hidden = true;
        contentElement.innerHTML = '';
        return;
    }

    toggleElement.hidden = false;
    toggleElement.setAttribute('aria-expanded', 'false');
    detailsElement.hidden = true;
    contentElement.innerHTML = '';

    if (mode === 'url') {
        contentElement.textContent = submission.url;
        return;
    }

    contentElement.appendChild(createLastSubmissionItem('Sender', submission.sender));
    contentElement.appendChild(createLastSubmissionItem('Receiver', submission.receiver));
    contentElement.appendChild(createLastSubmissionItem('Subject', submission.subject));
    contentElement.appendChild(createLastSubmissionItem('Email body', submission.body_content, true));
}

function toggleLastSubmission(mode) {
    const { toggleElement, detailsElement } = getLastSubmissionElements(mode);

    if (!toggleElement || !detailsElement || toggleElement.hidden) {
        return;
    }

    const isExpanded = toggleElement.getAttribute('aria-expanded') === 'true';
    toggleElement.setAttribute('aria-expanded', String(!isExpanded));
    detailsElement.hidden = isExpanded;
}

function setLastSubmission(mode, submission) {
    if (mode === 'url') {
        lastUrlSubmission = submission;
    } else {
        lastEmailSubmission = submission;
    }

    renderLastSubmission(mode);
}

// Small lookup helper so we don't repeat the mode-to-element mapping everywhere.
function getReportButton(mode) {
    return mode === 'url' ? urlReportButton : emailReportButton;
}

// Puts BOTH report buttons back in their pre-scan state:
//   - hidden (because there's nothing to report until a scan has run)
//   - label reset from "✓ Reported" back to "Report Result"
//   - re-enabled and stripped of the green "is-reported" style
// Called when the user switches checker tabs, since switching invalidates
// whatever was on screen.
function resetReportButtons() {
    ['url', 'email'].forEach((mode) => {
        const button = getReportButton(mode);
        if (!button) {
            return;
        }
        button.hidden = true;
        button.classList.remove('is-reported');
        button.textContent = 'Report Result';
        button.disabled = false;
    });
}

// Called right after a scan finishes. Does two things:
//   1. Remembers the scan result so the modal can prefill with it later.
//   2. Reveals the "Report Result" button in that panel.
// Also resets any stale "✓ Reported" state in case the user ran a previous
// scan, reported it, and is now scanning again.
function showReportButton(mode, scanResult) {
    lastScanResult[mode] = scanResult;
    const button = getReportButton(mode);
    if (!button) {
        return;
    }
    button.hidden = false;
    button.classList.remove('is-reported');
    button.textContent = 'Report Result';
    button.disabled = false;
}

// Opens the shared confirmation popup for whichever checker triggered it.
function openReportModal(mode) {
    if (!reportModalElement) {
        return;
    }
    // Remember which checker opened this modal. handleReportSubmit reads
    // this to know which scan result to include in the payload.
    activeReportMode = mode;
    reportModalElement.hidden = false;
}

// Hides the modal and forgets which checker opened it.
// Triggered by Cancel, backdrop click, Escape key, or successful submit.
function closeReportModal() {
    if (!reportModalElement) {
        return;
    }
    reportModalElement.hidden = true;
    activeReportMode = null;
}

// Builds the report payload, logs it, and flips the button into the "Reported" state.
// Frontend-only for now — when the backend is wired, replace the console.log
// with a fetch('/api/report', { method: 'POST', body: JSON.stringify(payload) }).
function handleReportSubmit() {
    // Guard: if somehow the modal is open without an active mode, bail.
    if (!activeReportMode) {
        return;
    }
    const mode = activeReportMode;
    const scan = lastScanResult[mode];

    // Build the payload. This is the shape the backend will receive once
    // /api/report exists — structured now so no frontend rewrite is needed later.
    const payload = {
        mode,                                              // 'url' or 'email'
        originalRiskScore: scan ? scan.riskScore : null,   // what the model said (number %)
        originalRiskLabel: scan ? scan.riskLabel : null,   // what the model said (label)
        submission: scan ? scan.submission : null,         // the original URL or email fields
        reportedAt: new Date().toISOString()               // client-side timestamp
    };
    console.log('Report submitted:', payload);

    // Turn the button into the success-state "✓ Reported" pill and lock it
    // so the user can't double-submit the same report.
    const button = getReportButton(mode);
    if (button) {
        button.textContent = '✓ Reported';
        button.classList.add('is-reported');
        button.disabled = true;
    }

    closeReportModal();
}

// Wires up every way the modal can be opened, closed, or submitted.
// Called once on page load.
function initializeReportModal() {
    // Clicking either "Report Result" button opens the shared modal,
    // tagged with which checker it came from.
    if (urlReportButton) {
        urlReportButton.addEventListener('click', () => openReportModal('url'));
    }
    if (emailReportButton) {
        emailReportButton.addEventListener('click', () => openReportModal('email'));
    }

    // Submit button inside the modal.
    if (reportSubmitButton) {
        reportSubmitButton.addEventListener('click', handleReportSubmit);
    }

    // Any element inside the modal with data-close-modal will dismiss it
    // (the Cancel button and the backdrop both use this attribute).
    if (reportModalElement) {
        reportModalElement.querySelectorAll('[data-close-modal]').forEach((element) => {
            element.addEventListener('click', closeReportModal);
        });
    }

    // Escape key also closes the modal — standard accessible-dialog behavior.
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && reportModalElement && !reportModalElement.hidden) {
            closeReportModal();
        }
    });
}

// Switches the result message between the neutral/default style and the error style.
function setResultState(resultDiv, state) {
    if (!resultDiv) {
        return;
    }

    resultDiv.classList.remove('result-default', 'result-error');
    resultDiv.classList.add(state === 'error' ? 'result-error' : 'result-default');
}

// Moon and sun SVGs shown inside the theme toggle button.
// Moon = "click to switch to dark"; sun = "click to switch to light".
// Both use currentColor so they pick up whatever color the button text is set to.
const THEME_ICON_MOON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`;
const THEME_ICON_SUN = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;

// Applies either the light or dark theme by changing body[data-theme].
// CSS listens for this attribute and swaps the color variables automatically.
function applyTheme(theme) {
    document.body.dataset.theme = theme;

    // Swap the icon to show what the next click will do:
    //   light mode → moon (click to go dark)
    //   dark mode  → sun  (click to go light)
    if (themeToggleButton) {
        themeToggleButton.innerHTML = theme === 'dark' ? THEME_ICON_SUN : THEME_ICON_MOON;
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
    clearShapFeatureSummary();
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
        resultDiv.style.color = '';
        setResultState(resultDiv, 'error');
        resultDiv.innerHTML = "Please paste a URL first!";
        return;
    }


    // UI FEEDBACK: Let the user know the process has started
    // Added so the shared risk card appears inside the URL panel.
    mountRiskCard('url');
    hideEmailConfidenceBar();
    // Hide the report button during the scan — it'll be re-shown on success.
    // This also clears any leftover "✓ Reported" state from a previous scan,
    // so the button comes back fresh if the user re-scans the same URL.
    const urlReportBtn = getReportButton('url');
    if (urlReportBtn) {
        urlReportBtn.hidden = true;
        urlReportBtn.classList.remove('is-reported');
        urlReportBtn.textContent = 'Report Result';
        urlReportBtn.disabled = false;
    }
    showLoader('urlLoader');

    // Ask the Python ML service for the phishing prediction.
    // Promise.all ensures the loader shows for at least 700ms regardless of fetch speed.
    const urlFetch = fetch('http://localhost:5000/predict_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
    }).then(response => response.json());

    
    Promise.all([urlFetch, new Promise(resolve => setTimeout(resolve, 700))])
    .then(([prediction]) => {
        hideLoader('urlLoader');
        // Convert the backend response into one normalized risk score for the UI.
        const riskScore = getRiskScore(prediction).toFixed(1);
        setEmailConfidenceBar(riskScore);
        applyRiskStyle(riskScore, resultDiv);
        updateShapFeatureSummary(prediction);
        setLastSubmission('url', { url });
        // Reveal the Report Result button and remember the verdict + submission,
        // so if the user opens the modal we can prefill it with accurate context.
        showReportButton('url', {
            riskScore,
            riskLabel: getRiskStyle(riskScore).label,
            submission: { url }
        });
       
        // Send the checked URL to the Node backend so it can be stored in the database.
        fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                status: prediction.label,
                risk_score: riskScore // "Phishing" or "Legitimate"
             }) // The number for your risk_score column
        })
        .then(response => response.json())
        .then(data => {
            // If the server says redirect is true, the user has hit the scan limit —
            // open the in-page auth modal in Login mode instead of navigating away.
            if (data.redirect) {
                const navLoginBtn = document.getElementById('navLoginBtn');
                if (navLoginBtn) {
                    navLoginBtn.click();
                }
                return;
            }

            console.log("Submission ID from Database:", data.submissionId);
        })
        .catch(err => {
            console.error("Storage Error:", err);
        });

        // Clear the input field
        userUrl.value = "";
    })
    .catch(err => {
        // If the Python service is unavailable, show the error style instead of the default style.
        console.error("Prediction error:", err);
        hideLoader('urlLoader');
        hideEmailConfidenceBar();
        resultDiv.style.color = '';
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
        resultDiv.style.color = '';
        setResultState(resultDiv, 'error');
        resultDiv.innerHTML = "Please fill in all email fields: Sender, Receiver, Subject, and Body.";
        return;
    }

    // Added so the shared risk card appears inside the Email panel.
    mountRiskCard('email');
    hideEmailConfidenceBar();
    // Hide the report button during the scan — mirrors the URL flow above.
    // Also wipes any prior "✓ Reported" state so the next verdict is reportable.
    const emailReportBtn = getReportButton('email');
    if (emailReportBtn) {
        emailReportBtn.hidden = true;
        emailReportBtn.classList.remove('is-reported');
        emailReportBtn.textContent = 'Report Result';
        emailReportBtn.disabled = false;
    }
    showLoader('emailLoader');

    // Ask the Python ML service for the email phishing prediction.
    // Promise.all ensures the loader shows for at least 700ms regardless of fetch speed.
    const emailFetch = fetch('http://localhost:5000/predict_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sender: sender.value,
            receiver: receiver.value,
            subject: subject.value,
            body_content: body_content.value
        })
    }).then(response => response.json());

    Promise.all([emailFetch, new Promise(resolve => setTimeout(resolve, 700))])
    .then(([prediction]) => {
        hideLoader('emailLoader');
        // Convert the model response into the shared UI risk score.
        const riskScore = getRiskScore(prediction).toFixed(1);
        setEmailConfidenceBar(riskScore);
        applyRiskStyle(riskScore, resultDiv);
        // Grab the email fields once into a single object so we can reuse it
        // for both the "last submission" dropdown and the report button state.
        const emailSubmission = {
            sender: sender.value,
            receiver: receiver.value,
            subject: subject.value,
            body_content: body_content.value
        };
        setLastSubmission('email', emailSubmission);
        // Reveal the Report Result button and stash the full email submission
        // so the eventual backend call can include exactly what was analyzed.
        showReportButton('email', {
            riskScore,
            riskLabel: getRiskStyle(riskScore).label,
            submission: emailSubmission
        });
        updateShapFeatureSummary(prediction);
        
        // Store the analyzed email submission through the existing Node backend.
        fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: "",
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
            // Same scan-limit handling as the URL flow — open the auth modal in Login mode.
            if (data.redirect) {
                const navLoginBtn = document.getElementById('navLoginBtn');
                if (navLoginBtn) {
                    navLoginBtn.click();
                }
                return;
            }

            console.log("Database ID:", data.submissionId);
        })
        .catch(err => {
            console.error("Email Submission Error:", err);
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
        hideLoader('emailLoader');
        hideEmailConfidenceBar();
        resultDiv.style.color = '';
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
    // Switching tabs means the visible scan result is gone, so any "report this
    // result" button no longer has a result to attach to. Hide them both.
    resetReportButtons();

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

function initializeLastSubmissionToggles() {
    if (urlLastToggleElement) {
        urlLastToggleElement.addEventListener('click', () => {
            toggleLastSubmission('url');
        });
    }

    if (emailLastToggleElement) {
        emailLastToggleElement.addEventListener('click', () => {
            toggleLastSubmission('email');
        });
    }
}

// Parallax the fish image inside the fixed hero as the user scrolls.
// The hero itself is fixed — the content layer slides up over it.
// The image drifts upward slower than the content, with a slight zoom for depth.
function initHeroScroll() {
    const heroImg = document.querySelector('.hero-img');
    const hero = document.querySelector('.hero-banner');
    const scrollCue = document.querySelector('.scroll-cue');
    if (!heroImg || !hero) return;

    let ticking = false;
    let lastY = 0;

    function update() {
        const vh = window.innerHeight;
        const progress = Math.min(lastY / vh, 1);

        // Classic parallax: image drifts up at 0.5x scroll speed
        const translateY = -lastY * 0.5;
        // Subtle zoom as user scrolls — adds cinematic depth
        const scale = 1 + progress * 0.08;

        heroImg.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;
        // Hero fades slightly as the content layer covers it — softens the transition
        hero.style.opacity = String(1 - progress * 0.35);

        // Fade scroll cue out quickly once the user starts scrolling
        if (scrollCue) {
            scrollCue.style.opacity = String(Math.max(0, 1 - lastY / 120));
        }

        ticking = false;
    }

    window.addEventListener('scroll', () => {
        lastY = window.scrollY;
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });
}

// Initialize theme handling first so the page colors are correct immediately.
initializeThemeToggle();

// Then initialize the checker panel tabs.
initializeCheckerModeSwitch();

// Finally, wire up the small "last submission" toggles inside each panel.
initializeLastSubmissionToggles();

// Wire up the Report Result modal (button clicks, cancel, submit, escape-to-close).
initializeReportModal();

// Hero scroll-shrink animation.
initHeroScroll();

// ── Auth modal (Login / Sign Up popup) ──
// Ported from the standalone login page. Reuses the same modal pattern as the
// report modal: hidden by default, opened by nav buttons, dismissed via
// data-close-auth elements (backdrop, × button) or the Escape key.
function initializeAuthModal() {
    const authModal = document.getElementById('authModal');
    if (!authModal) {
        return;
    }

    // Eye-icon SVGs swapped when the user toggles password visibility.
    const PASSWORD_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const PASSWORD_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.1M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 5.4-1.4"/><path d="m3 3 18 18"/><path d="M10.5 10.5a3 3 0 0 0 4.2 4.2"/></svg>`;

    // Per-mode UI text. The form's title / button labels swap based on which
    // nav button (Login vs Sign Up) opened the modal.
    //
    // Field meanings:
    //   title    — HTML for the big heading. The <em> word gets the accent blue
    //              (defined in CSS as `.auth-form-side h2 em { color: ... }`).
    //   subtitle — plain-text line under the heading. Empty string for login.
    //   submit   — label on the primary button at the bottom of the form.
    //   switch   — label on the secondary button that flips between modes.
    const AUTH_MODE_TEXT = {
        login: {
            title: 'Welcome <em>back</em>.',
            subtitle: '',
            submit: 'Login',
            switch: 'Sign Up'
        },
        signup: {
            title: 'Hi <em>There</em>.',
            subtitle: 'Create your account to continue scanning.',
            submit: 'Create Account',
            switch: 'Already have an account? Login'
        }
    };

    // DOM references inside the modal.
    const authForm = authModal.querySelector('.auth-form');
    const fieldEmail = authModal.querySelector('[data-field="email"]');
    const fieldPassword = authModal.querySelector('[data-field="password"]');
    const inputEmail = fieldEmail.querySelector('input');
    const inputPassword = fieldPassword.querySelector('input');
    const passwordToggle = authModal.querySelector('.auth-password-toggle');
    const forgotButton = authModal.querySelector('.auth-forgot');
    const sendResetButton = authModal.querySelector('.auth-send-reset');
    const fieldResetEmail = authModal.querySelector('[data-field="reset-email"]');
    const inputResetEmail = fieldResetEmail.querySelector('input');
    const overlays = {
        forgot: authModal.querySelector('[data-overlay="forgot"]'),
        resetSent: authModal.querySelector('[data-overlay="reset-sent"]'),
        success: authModal.querySelector('[data-overlay="success"]')
    };

    // Email regex — same loose-but-good-enough pattern from the original login page.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let activeAuthMode = 'login';

    // Updates the form's title / button labels for the active mode (login or signup).
    //
    // Two flavors of swap:
    //   [data-auth-text] → plain text (safe — won't render any HTML the user typed)
    //   [data-auth-html] → raw HTML (used by the title so we can wrap a word in <em>
    //                       for the accent color, e.g. "Welcome <em>back</em>.")
    //
    // For each element, we look up its data attribute as a key into the mode's
    // text bundle and swap the element's content.
    function applyAuthMode(mode) {
        activeAuthMode = mode;
        const text = AUTH_MODE_TEXT[mode] || AUTH_MODE_TEXT.login;

        // Plain-text swaps — subtitle, button labels, etc.
        authModal.querySelectorAll('[data-auth-text]').forEach((element) => {
            const key = element.dataset.authText;
            if (key in text) {
                element.textContent = text[key];
            }
        });

        // HTML swaps — the h2 title only, so it can include the accent <em> tag.
        authModal.querySelectorAll('[data-auth-html]').forEach((element) => {
            const key = element.dataset.authHtml;
            if (key in text) {
                element.innerHTML = text[key];
            }
        });
    }

    // Hides every overlay and removes any error states. Used when the modal
    // opens fresh and when "back" is clicked.
    function hideAllOverlays() {
        Object.values(overlays).forEach((overlay) => overlay.classList.remove('show'));
    }

    function clearFieldErrors() {
        fieldEmail.classList.remove('error');
        fieldPassword.classList.remove('error');
        fieldResetEmail.classList.remove('error');
    }

    function openAuthModal(mode) {
        applyAuthMode(mode || 'login');
        hideAllOverlays();
        clearFieldErrors();
        authModal.hidden = false;
    }

    function closeAuthModal() {
        authModal.hidden = true;
    }

    // Validates the main login/signup form. Adds .error on any invalid field.
    function validateAuthForm() {
        let valid = true;
        if (!emailRegex.test(inputEmail.value.trim())) {
            fieldEmail.classList.add('error');
            valid = false;
        } else {
            fieldEmail.classList.remove('error');
        }
        if (inputPassword.value.length < 6) {
            fieldPassword.classList.add('error');
            valid = false;
        } else {
            fieldPassword.classList.remove('error');
        }
        return valid;
    }

    // Wire the nav buttons — they decide which mode the modal opens in.
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
        button.addEventListener('click', () => openAuthModal(button.dataset.authMode));
    });

    // Any element with data-close-auth (backdrop, × button) closes the modal.
    authModal.querySelectorAll('[data-close-auth]').forEach((element) => {
        element.addEventListener('click', closeAuthModal);
    });

    // Escape key closes the modal — standard accessible-dialog behavior.
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !authModal.hidden) {
            closeAuthModal();
        }
    });

    // Live-clear field errors as the user re-types.
    inputEmail.addEventListener('input', () => fieldEmail.classList.remove('error'));
    inputPassword.addEventListener('input', () => fieldPassword.classList.remove('error'));
    inputResetEmail.addEventListener('input', () => fieldResetEmail.classList.remove('error'));

    // Eye icon → toggle password visibility + swap the icon.
    passwordToggle.addEventListener('click', () => {
        const showing = inputPassword.type === 'text';
        inputPassword.type = showing ? 'password' : 'text';
        passwordToggle.innerHTML = showing ? PASSWORD_EYE : PASSWORD_EYE_OFF;
        passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });

    // Submit handler — frontend-only mock. Validates, fakes a 900ms request,
    // then shows the success overlay. Backend will replace the setTimeout.
    authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!validateAuthForm()) {
            return;
        }
        const submitButton = authForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = activeAuthMode === 'signup' ? 'Creating account…' : 'Signing in…';
        setTimeout(() => {
            overlays.success.classList.add('show');
            setTimeout(() => {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }, 200);
        }, 900);
    });

    // The bottom button toggles login ↔ signup mode in-place.
    const switchButton = authModal.querySelector('[data-auth-switch]');
    switchButton.addEventListener('click', () => {
        applyAuthMode(activeAuthMode === 'login' ? 'signup' : 'login');
    });

    // Forgot Password link → show the reset overlay.
    forgotButton.addEventListener('click', () => overlays.forgot.classList.add('show'));

    // Send Reset Link button (inside the forgot overlay).
    sendResetButton.addEventListener('click', () => {
        if (!emailRegex.test(inputResetEmail.value.trim())) {
            fieldResetEmail.classList.add('error');
            return;
        }
        fieldResetEmail.classList.remove('error');
        overlays.forgot.classList.remove('show');
        overlays.resetSent.classList.add('show');
    });

    // All "← Back to login" buttons hide every overlay, returning to the form.
    authModal.querySelectorAll('.auth-back').forEach((button) => {
        button.addEventListener('click', hideAllOverlays);
    });
}

initializeAuthModal();
