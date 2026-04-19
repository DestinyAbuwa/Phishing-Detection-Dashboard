# Phishing-Detection-Dashboard
This dashboard uses Machine Learning to analyze URLs and Emails for phishing threats, storing scan history in a MySQL database.

## Project Architecture

  * **Frontend:** HTML/CSS/JavaScript
  * **Backend:** Node.js & Express (Port 3000)
  * **ML Service:** Python & Flask (Port 5000)
  * **Database:** MySQL

## Prerequisites

  * **Node.js**: (v16 or higher)
  * **Python**: (v3.9 or higher)
  * **MySQL**: Local instance running
  * **Git**: For version control

## Installation Steps

### 1\. Clone & Core Dependencies

```bash
git clone https://github.com/DestinyAbuwa/Phishing-Detection-Dashboard.git
npm install
```

### 2\. Machine Learning Setup

Navigate to the [ML folder](https://github.com/DestinyAbuwa/Phishing-Detection-Dashboard/tree/main/ML) to install Python dependencies.

> **Note:** If `pip` is not recognized, use `py -m pip`.

```bash
cd ML
py -m pip install flask flask-cors joblib numpy scipy scikit-learn
```
### 3\. Database Setup

Initialize the database by running the queries found in [schema.sql](https://github.com/DestinyAbuwa/Phishing-Detection-Dashboard/tree/main/schema.sql) in your MySQL workbench.

## How to Run Locally

To run the full application, you must have **two terminals** open simultaneously.

### Terminal 1: Node.js Server

```bash
node index.js
```

*Runs on [http://localhost:3000](http://localhost:3000)*

### Terminal 2: Python ML Service

```bash
cd ML
py predict.py
```

## Planned Features (Iteration 3)
* ### Implement Login Page
* ### Store Logins in Database
* ### Risk Score
* ### Error Messages
* ### Connect ML Results to Backend
* ### Dark Mode-Light Mode Toggle
