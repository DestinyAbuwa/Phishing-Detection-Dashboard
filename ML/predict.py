from flask import Flask, request, jsonify
from flask_cors import CORS          # <-- NEW
import joblib
import numpy as np
from scipy.sparse import hstack

app = Flask(__name__)
CORS(app)                            # <-- NEW (allows all origins)

# Load email models
email_tfidf = joblib.load("email_tfidf.pkl")
email_scaler = joblib.load("email_scaler.pkl")
email_model = joblib.load("email_model.pkl")

# Load URL models
url_scaler = joblib.load("url_scaler.pkl")
url_model = joblib.load("url_model.pkl")

# Load URL blacklist
BLACKLIST_FILE = "BLACKLIST-urls.txt"
try:
    with open(BLACKLIST_FILE, "r") as f:
        url_blacklist = [line.strip().lower() for line in f if line.strip()]
except FileNotFoundError:
    url_blacklist = []

def extract_url_features(url):
    """Extract the same features as in your url-preprocessing.py"""
    # Simple implementation – adjust according to your actual preprocessing
    is_ip = 1 if url.replace(".", "").isdigit() else 0
    url_len = len(url)
    has_at = 1 if "@" in url else 0
    is_redirect = 1 if "redirect" in url.lower() else 0
    has_dash = 1 if "-" in url else 0
    # Domain parsing (simplified)
    if "://" in url:
        host = url.split("://")[1].split("/")[0]
    else:
        host = url.split("/")[0]
    domain_len = len(host)
    nos_subdomain = host.count(".")
    return [is_ip, url_len, has_at, is_redirect, has_dash, domain_len, nos_subdomain]

@app.route("/predict_email", methods=["POST"])
def predict_email():
    data = request.json
    body = data.get("body_content", "")
    subject = data.get("subject", "")

    # Numeric features
    num_exclamations = body.count("!")
    num_questions = body.count("?")
    num_dollar = body.count("$")
    num_email_addresses = body.count("@")
    body_length = len(body)
    num_words = len(body.split())
    subject_length = len(subject)

    urgent_words = ["urgent","respond now","asap","act now","limited time",
                    "verify account","bank transfer","claim prize","lottery","winner"]
    urgent_count = sum(body.lower().count(w) for w in urgent_words)
    has_urgent = 1 if urgent_count > 0 else 0

    numeric_values = np.array([[
        num_exclamations, num_questions, num_dollar, num_email_addresses,
        body_length, num_words, subject_length, urgent_count, has_urgent
    ]])

    X_tfidf = email_tfidf.transform([body])
    X_num_scaled = email_scaler.transform(numeric_values)
    X_combined = hstack([X_tfidf, X_num_scaled])

    pred = email_model.predict(X_combined)[0]
    prob = email_model.predict_proba(X_combined)[0].max()

    return jsonify({
        "label": "Phishing" if pred == 1 else "Legitimate",
        "confidence": round(prob, 4)
    })

@app.route("/predict_url", methods=["POST"])
def predict_url():
    data = request.json
    url = data.get("url", "").lower()

    # --- BLACKLIST CHECK ---
    for blocked in url_blacklist:
        if blocked in url:
            return jsonify({
                "label": "Phishing",
                "confidence": 1.0,
                "blacklisted": True
            })

    # --- Continue with normal ML prediction ---
    features = extract_url_features(url)  # your existing feature extraction
    X = np.array(features).reshape(1, -1)
    X_scaled = url_scaler.transform(X)
    pred = url_model.predict(X_scaled)[0]
    prob = url_model.predict_proba(X_scaled)[0].max()

    return jsonify({
        "label": "Phishing" if pred == 1 else "Legitimate",
        "confidence": round(prob, 4),
        "blacklisted": False
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)