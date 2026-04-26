-- PHISHING DETECTION DASHBOARD - DATABASE SCHEMA
-- Instructions: Run this script in MySQL Workbench to create your local table.

CREATE DATABASE IF NOT EXISTS phishing_db;
USE phishing_db;

-- Delete the old version
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS reports;

-- USERS TABLE (Stores USERS login info)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- "password" from your request
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SUBMISSIONS TABLE (Stores URLs scanned by the team)
CREATE TABLE submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url TEXT,
    sender_email VARCHAR(255),
    receiver_email VARCHAR(255),
    subject VARCHAR(255),
    email_body TEXT,
    risk_score INT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reports (
	id INT AUTO_INCREMENT PRIMARY KEY,
    mode ENUM('url', 'email') NOT NULL,
    original_risk_score DECIMAL(5,2),
    original_risk_label VARCHAR(50),
    submission_data JSON, -- Stores the full URL or Email fields
    reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

