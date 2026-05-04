# Phishing Detection Dashboard

A full-stack application for detecting phishing URLs and emails using machine learning. The system integrates a Node.js backend, a Python Flask machine learning service, and a MySQL database to provide real-time phishing analysis.

---

## Installation and Setup

### Prerequisites
Ensure the following are installed:
- Node.js (v16 or higher)
- Python (3.9 or higher)
- MySQL
- Git
- pip (Python package manager)

---

## Installation Steps

### 1. Clone the Repository
git clone https://github.com/DestinyAbuwa/Phishing-Detection-Dashboard.git  
cd Phishing-Detection-Dashboard  

### 2. Install Node.js Dependencies
npm install  

### 3. Install Python Dependencies
cd ML  
python3 -m pip install flask flask-cors joblib numpy pandas scipy scikit-learn shap  

### 4. Set Up the Database
- Open MySQL Workbench or your MySQL terminal  
- Run the SQL commands in `schema.sql`  
- This will create the required database and tables  

---

## Codebase Structure

Phishing-Detection-Dashboard/  
│  
├── public/                     # Frontend files  
│   ├── index.html              # Single Page Application (SPA)  
│   ├── script.js               # Client-side JavaScript  
│   ├── style.css               # Styling and themes  
│   ├── loading-bar.js          # Loading bar library  
│   ├── loading-bar.css         # Loading bar styles  
│   └── images/                 # Image assets  
│  
├── ML/                         # Python / Flask ML service  
│   ├── predict.py              # Flask server and prediction logic  
│   ├── *.pkl                   # Serialized models (no retraining required)  
│   ├── WHITELIST-urls.txt      # Trusted domains  
│   ├── BLACKLIST-urls.txt      # Untrusted domains  
│   │  
│   ├── Preprocessing/          # Data preparation scripts  
│   │   ├── url-preprocessing.py  
│   │   └── email-preprocessing.py  
│   │  
│   └── Testing/                # Model testing scripts  
│       ├── save-url-model.py  
│       ├── save-email-model.py  
│       ├── url-model-comparison.py  
│       └── EmailModelComparison.py  
│  
├── index.js                    # Main Node.js server  
├── database.js                 # Database connection setup  
├── schema.sql                  # Database schema  
├── package.json                # Node dependencies  
├── .env.example                # Environment configuration template  
└── README.md                   # Project documentation  

---

## Usage Instructions

### 1. Start the Node.js Backend
node index.js  

### 2. Start the Python ML Service (in a separate terminal)
python ML/predict.py  

### 3. Open the Application
http://localhost:3000  

- Node.js server runs on port 3000  
- Flask ML service runs on port 5000  

---

## Contributing

To contribute to the project:

1. Fork the repository  
2. Create a new branch:  
   git checkout -b feature/<description-of-feature>  

3. Make your changes  

4. Commit your changes:  
   git commit -m "Insert relevant update description here"  

5. Push to your branch:  
   git push origin feature/<description-of-feature>  

6. Open a pull request for review  

---

## Notes

- .pkl files are serialized machine learning models, allowing predictions without retraining  
- Both the Node.js backend and Flask ML service must be running for full functionality  
