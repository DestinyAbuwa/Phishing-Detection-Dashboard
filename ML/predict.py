from flask import Flask, request, jsonify
from flask_cors import CORS          # <-- NEW
import joblib
import numpy as np
import re
import shap
from scipy.sparse import hstack
from pathlib import Path
from urllib.parse import urlparse

app = Flask(__name__)
CORS(app)                            # <-- NEW (allows all origins)

BASE_DIR = Path(__file__).resolve().parent

# Load email models
email_tfidf = joblib.load(BASE_DIR / "email_tfidf.pkl")
email_scaler = joblib.load(BASE_DIR / "email_scaler.pkl")
email_model = joblib.load(BASE_DIR / "email_model.pkl")

# Load URL models
url_scaler = joblib.load(BASE_DIR / "url_scaler.pkl")
url_model = joblib.load(BASE_DIR / "url_model.pkl")
try:
    url_extension_encoder = joblib.load(BASE_DIR / "url_extension_encoder.pkl")
except FileNotFoundError:
    url_extension_encoder = {}

EMAIL_NUMERIC_FEATURE_NAMES = [
    "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
    "body_length", "num_words", "subject_length", "urgent_word_count", "has_urgent_words"
]

URL_FEATURE_NAMES = [
    "is_ip", "has_at", "is_redirect", "has_dash", "domain_len", "nos_subdomain", "extension"
]

URL_FEATURE_LABELS = {
    "is_ip": "URL uses an IP address",
    "has_at": "Contains @ symbol",
    "is_redirect": "Contains redirect text",
    "has_dash": "Contains dash",
    "domain_len": "Domain length",
    "nos_subdomain": "Number of subdomains",
    "extension": "Domain extension"
}

EMAIL_FEATURE_LABELS = {
    "num_exclamations": "Exclamation marks",
    "num_questions": "Question marks",
    "num_dollar": "Dollar signs",
    "num_email_addresses": "Email address count",
    "body_length": "Email body length",
    "num_words": "Word count",
    "subject_length": "Subject length",
    "urgent_word_count": "Urgent phrase count",
    "has_urgent_words": "Urgent wording present"
}

EMAIL_SCAM_KEYWORDS = [
    "urgent", "respond now", "asap", "act now", "limited time",
    "verify account", "bank transfer", "claim prize", "lottery", "winner",
    "password", "login", "sign in", "account suspended", "confirm identity",
    "security alert", "payment", "invoice", "refund", "gift card", "wire transfer"
]

NOMINAL_FEATURE_VALUES = {
    "is_ip": {0: "No", 1: "Yes"},
    "has_at": {0: "No", 1: "Yes"},
    "is_redirect": {0: "No", 1: "Yes"},
    "has_dash": {0: "No", 1: "Yes"},
    "has_urgent_words": {0: "No", 1: "Yes"}
}

url_shap_explainer = shap.TreeExplainer(url_model)


def format_feature_name(feature_name):
    if feature_name in URL_FEATURE_LABELS:
        return URL_FEATURE_LABELS[feature_name]
    if feature_name in EMAIL_FEATURE_LABELS:
        return EMAIL_FEATURE_LABELS[feature_name]
    return f'Word: "{feature_name}"'


def format_feature_value(value, feature_name=None):
    if feature_name in NOMINAL_FEATURE_VALUES:
        try:
            return NOMINAL_FEATURE_VALUES[feature_name][int(value)]
        except (KeyError, TypeError, ValueError):
            return value

    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        rounded_value = round(float(value), 3)
        return int(rounded_value) if rounded_value.is_integer() else rounded_value
    return value


def get_top_shap_features(shap_values, feature_names, feature_values, limit=2):
    ranked_features = sorted(
        zip(feature_names, shap_values),
        key=lambda item: abs(float(item[1])),
        reverse=True
    )

    return [
        {
            "feature": format_feature_name(feature_name),
            "value": format_feature_value(feature_values.get(feature_name, ""), feature_name),
            "impact": round(float(value), 4)
        }
        for feature_name, value in ranked_features[:limit]
    ]


def count_text_feature_occurrences(text, feature_name):
    text = text.lower()
    feature_name = feature_name.lower()

    if " " in feature_name:
        return text.count(feature_name)

    return len(re.findall(rf"\b{re.escape(feature_name)}\b", text))


def get_email_suspicion_score(body, subject, numeric_feature_values):
    combined_text = f"{subject} {body}".lower()
    scam_keyword_count = sum(combined_text.count(keyword) for keyword in EMAIL_SCAM_KEYWORDS)

    score = 0
    score += min(scam_keyword_count * 12, 36)
    score += min(numeric_feature_values["num_exclamations"] * 5, 15)
    score += min(numeric_feature_values["num_dollar"] * 12, 24)
    score += min(numeric_feature_values["num_email_addresses"] * 8, 16)

    if numeric_feature_values["body_length"] > 1200:
        score += 8

    return min(score, 100)


def get_email_risk_score(predicted_label, confidence, body, subject, numeric_feature_values):
    model_risk = confidence * 100 if predicted_label == 1 else 100 - (confidence * 100)
    suspicion_score = get_email_suspicion_score(body, subject, numeric_feature_values)

    if suspicion_score == 0 and predicted_label == 1 and confidence < 0.75:
        return min(model_risk, 35.0)

    if suspicion_score <= 12 and predicted_label == 1 and confidence < 0.85:
        return min(model_risk, 45.0)

    return max(model_risk, suspicion_score)


def get_url_shap_values(X_scaled, predicted_class):
    shap_values = url_shap_explainer.shap_values(X_scaled)
    class_index = list(url_model.classes_).index(predicted_class)

    if isinstance(shap_values, list):
        return shap_values[class_index][0]

    shap_values = np.asarray(shap_values)
    if shap_values.ndim == 3:
        return shap_values[0, :, class_index]

    return shap_values[0]


def get_email_top_features(X_combined, numeric_feature_values, email_text, predicted_class):
    feature_names = list(email_tfidf.get_feature_names_out()) + EMAIL_NUMERIC_FEATURE_NAMES
    class_index = list(email_model.classes_).index(predicted_class)
    other_class_index = 1 - class_index

    feature_log_likelihood_delta = (
        email_model.feature_log_prob_[class_index] -
        email_model.feature_log_prob_[other_class_index]
    )
    email_shap_contributions = X_combined.multiply(feature_log_likelihood_delta).toarray()[0]
    feature_data_values = X_combined.toarray()[0]

    # Keep this as a SHAP object so the explanation can move behind a backend route later.
    email_shap_values = shap.Explanation(
        values=email_shap_contributions,
        data=feature_data_values,
        feature_names=feature_names
    )

    feature_values = {
        feature_name: count_text_feature_occurrences(email_text, feature_name)
        for feature_name in email_tfidf.get_feature_names_out()
    }
    feature_values.update(numeric_feature_values)

    return get_top_shap_features(email_shap_values.values, feature_names, feature_values)

# Load URL blacklist
BLACKLIST_FILE = "BLACKLIST-urls.txt"
try:
    with open(BASE_DIR / BLACKLIST_FILE, "r") as f:
        url_blacklist = [
            line.strip().lower()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        ]
except FileNotFoundError:
    url_blacklist = []

WHITELIST_FILE = "WHITELIST-urls.txt"
try:
    with open(BASE_DIR / WHITELIST_FILE, "r") as f:
        url_whitelist = [
            line.strip().lower()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        ]
except FileNotFoundError:
    url_whitelist = []


def get_url_host(url):
    parsed_url = urlparse(url if "://" in url else f"//{url}")
    host = parsed_url.hostname or ""
    return host.lower().strip(".")


def get_url_extension(host):
    if not host or host.replace(".", "").isdigit() or "." not in host:
        return "unknown"
    return host.rsplit(".", 1)[-1]


def is_whitelisted_host(host, trusted_domain):
    trusted_domain = trusted_domain.strip().lower().removeprefix("www.")
    normalized_host = host.removeprefix("www.")
    return normalized_host == trusted_domain or normalized_host.endswith(f".{trusted_domain}")


def get_matching_whitelisted_domain(host):
    for trusted_domain in url_whitelist:
        if is_whitelisted_host(host, trusted_domain):
            return trusted_domain
    return None

def extract_url_features(url):
    """Extract the same features as in your url-preprocessing.py"""
    # Simple implementation – adjust according to your actual preprocessing
    host = get_url_host(url)
    extension = get_url_extension(host)
    is_ip = 1 if host.replace(".", "").isdigit() else 0
    has_at = 1 if "@" in url else 0
    is_redirect = 1 if "redirect" in url.lower() else 0
    has_dash = 1 if "-" in url else 0
    domain_len = len(host)
    nos_subdomain = max(host.count(".") - 1, 0)
    extension_encoded = url_extension_encoder.get(extension, -1)
    return [is_ip, has_at, is_redirect, has_dash, domain_len, nos_subdomain, extension_encoded]

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

    numeric_feature_values = {
        "num_exclamations": num_exclamations,
        "num_questions": num_questions,
        "num_dollar": num_dollar,
        "num_email_addresses": num_email_addresses,
        "body_length": body_length,
        "num_words": num_words,
        "subject_length": subject_length,
        "urgent_word_count": urgent_count,
        "has_urgent_words": has_urgent
    }

    numeric_values = np.array([[
        num_exclamations, num_questions, num_dollar, num_email_addresses,
        body_length, num_words, subject_length, urgent_count, has_urgent
    ]])

    email_text = f"{subject} {body}".strip()
    X_tfidf = email_tfidf.transform([email_text])
    X_num_scaled = email_scaler.transform(numeric_values)
    X_combined = hstack([X_tfidf, X_num_scaled])

    pred = email_model.predict(X_combined)[0]
    prob = email_model.predict_proba(X_combined)[0].max()
    risk_score = get_email_risk_score(pred, prob, body, subject, numeric_feature_values)
    label = "Phishing" if risk_score >= 50 else "Legitimate"
    top_features = get_email_top_features(X_combined, numeric_feature_values, email_text, pred)

    return jsonify({
        "label": label,
        "confidence": round(prob, 4),
        "risk_score": round(risk_score, 1),
        "top_features": top_features
    })

@app.route("/predict_url", methods=["POST"])
def predict_url():
    data = request.json
    url = data.get("url", "").lower()
    host = get_url_host(url)

    # --- BLACKLIST CHECK ---
    for blocked in url_blacklist:
        if blocked in url:
            top_features = [
                {
                    "feature": "Known phishing blacklist match",
                    "value": blocked,
                    "impact": 1.0
                }
            ]
            return jsonify({
                "label": "Phishing",
                "confidence": 1.0,
                "risk_score": 100.0,
                "blacklisted": True,
                "whitelisted": False,
                "top_features": top_features
            })

    # --- TRUSTED DOMAIN CHECK ---
    whitelisted_domain = get_matching_whitelisted_domain(host)
    if whitelisted_domain:
        top_features = [
            {
                "feature": "Trusted domain whitelist match",
                "value": whitelisted_domain,
                "impact": -1.0
            },
            {
                "feature": "Hostname",
                "value": host,
                "impact": -1.0
            }
        ]
        return jsonify({
            "label": "Legitimate",
            "confidence": 1.0,
            "risk_score": 0.0,
            "blacklisted": False,
            "whitelisted": True,
            "top_features": top_features
        })

    # --- Continue with normal ML prediction ---
    features = extract_url_features(url)  # your existing feature extraction


    print(f"DEBUG: Features for {url} -> {features}")
    

    expected_url_feature_count = getattr(url_scaler, "n_features_in_", len(features))
    feature_names = URL_FEATURE_NAMES[:expected_url_feature_count]
    features = features[:expected_url_feature_count]

    X = np.array(features).reshape(1, -1)
    X_scaled = url_scaler.transform(X)
    pred = url_model.predict(X_scaled)[0]
    prob = url_model.predict_proba(X_scaled)[0].max()
    url_shap_values = get_url_shap_values(X_scaled, pred)
    feature_values = dict(zip(feature_names, features))
    feature_values["extension"] = get_url_extension(host)
    top_features = get_top_shap_features(url_shap_values, feature_names, feature_values)

    return jsonify({
        "label": "Phishing" if pred == 1 else "Legitimate",
        "confidence": round(prob, 4),
        "blacklisted": False,
        "whitelisted": False,
        "top_features": top_features
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
