
// CHECK URL FUNCTION: This runs when the user clicks the "Scan" button.
// It grabs the URL from the input box and sends it to our Node.js server.
function checkURL() {
    // Get the text the user typed and the div where we will show the result
    const userUrl = document.getElementById('urlInput');
    const resultDiv = document.getElementById('result');

    // Validation: Don't do anything if the input is empty
    if (!userUrl) {
        alert("Please paste a URL first!");
        return;
    }

    // UI FEEDBACK: Let the user know the process has started
    resultDiv.innerHTML = "Scanning: " + userUrl + "...";

    //THE FETCH REQUEST: This is the "bridge" to your Backend.
     //It sends the URL to the '/api/check' route we just updated in index.js.
    fetch('/api/check', {
        method: 'POST', // We use POST because we are sending data
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: userUrl.value }) // Convert the URL into a JSON string
    })
    .then(response => response.json()) // Wait for the server to send back a JSON response
    .then(data => {
        //DISPLAY SUCCESS: The server successfully saved the URL to MySQL
         //and sent back a success message + the new Submission ID.
        resultDiv.innerHTML = `<strong>Result:</strong> ${data.message}`;

        userUrl.value = "";

        console.log("Submission ID from Database:", data.submissionId);
    })
    .catch(err => {
        // ERROR HANDLING: Runs if the server is down or there's a network issue
        console.error("Connection Error:", err);
        resultDiv.innerHTML = "Error connecting to server. Is the Backend running?";
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

    // 2. Validation: Check if the main fields are filled
    if (!sender || !body_content) {
        alert("Please provide at least a sender and the email body.");
        return;
    }

    resultDiv.innerHTML = "Analyzing email content...";

    // 3. The Fetch Request: Sending the data to your Node server
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
        resultDiv.innerHTML = `<strong>Result:</strong> ${data.message}`;

        // --- THIS CLEARS THE TEXT BOXES ---
        sender.value = "";
        receiver.value = "";
        subject.value = "";
        body_content.value = "";

        console.log("Database ID:", data.submissionId);
    })
    .catch(err => {
        console.error("Email Submission Error:", err);
        resultDiv.innerHTML = "Failed to connect to the database.";
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
