-- PHISHING DETECTION DASHBOARD - DATABASE SCHEMA
-- Instructions: Run this script in MySQL Workbench to create your local table.

CREATE DATABASE IF NOT EXISTS phishing_db;
USE phishing_db;

-- SUBMISSIONS TABLE (Stores URLs scanned by the team)
CREATE TABLE IF NOT EXISTS submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url VARCHAR(255) NOT NULL,
    risk_score INT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);