
// CHECK URL FUNCTION: This runs when the user clicks the "Scan" button.
// It grabs the URL from the input box and sends it to our Node.js server.
function checkURL() {
    // Get the text the user typed and the div where we will show the result
    const userUrl = document.getElementById('urlInput').value;
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
        body: JSON.stringify({ url: userUrl }) // Convert the URL into a JSON string
    })
    .then(response => response.json()) // Wait for the server to send back a JSON response
    .then(data => {
        //DISPLAY SUCCESS: The server successfully saved the URL to MySQL
         //and sent back a success message + the new Submission ID.
        resultDiv.innerHTML = `<strong>Result:</strong> ${data.message}`;
        console.log("Submission ID from Database:", data.submissionId);
    })
    .catch(err => {
        // ERROR HANDLING: Runs if the server is down or there's a network issue
        console.error("Connection Error:", err);
        resultDiv.innerHTML = "Error connecting to server. Is the Backend running?";
    });
}