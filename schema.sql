-- PHISHING DETECTION DASHBOARD - DATABASE SCHEMA
-- Instructions: Run this script in MySQL Workbench to create your local table.

CREATE DATABASE IF NOT EXISTS phishing_db;
USE phishing_db;

-- Delete the old version
DROP TABLE IF EXISTS submissions;

-- SUBMISSIONS TABLE (Stores URLs scanned by the team)
CREATE TABLE submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url VARCHAR(255),
    sender_email VARCHAR(255),
    receiver_email VARCHAR(255),
    subject VARCHAR(255),
    email_body TEXT,
    risk_score INT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
