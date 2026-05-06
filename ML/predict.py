from flask import Flask, request, jsonify
from flask_cors import CORS         
import joblib
import numpy as np
import pandas as pd
import re
import shap
from scipy.sparse import hstack
from pathlib import Path
from urllib.parse import urlparse

app = Flask(__name__)
CORS(app)                            # (allows all origins)

BASE_DIR = Path(__file__).resolve().parent

# Load email models
email_tfidf = joblib.load(BASE_DIR / "email_tfidf.pkl")
email_scaler = joblib.load(BASE_DIR / "email_scaler.pkl")
email_model = joblib.load(BASE_DIR / "email_model.pkl")
try:
    email_sender_feature_encoders = joblib.load(BASE_DIR / "email_sender_feature_encoders.pkl")
except FileNotFoundError:
    email_sender_feature_encoders = {
        "sender_email_domain": {"unknown": 0},
        "sender_email_extension": {"unknown": 0}
    }

# Load URL models
url_scaler = joblib.load(BASE_DIR / "url_scaler.pkl")
url_model = joblib.load(BASE_DIR / "url_model.pkl")
try:
    url_extension_encoder = joblib.load(BASE_DIR / "url_extension_encoder.pkl")
except FileNotFoundError:
    url_extension_encoder = {}

EMAIL_NUMERIC_FEATURE_NAMES = [
    "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
    "body_length", "num_words", "subject_length", "credential_threat_count",
    "payment_threat_count", "reward_scam_count", "time_pressure_count",
    "sender_email_domain", "sender_email_extension", "sender_domain_has_dash",
    "sender_domain_subdomain_count"
]

EMAIL_EXPLANATION_FEATURE_NAMES = [
    "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
    "body_length", "num_words", "subject_length", "credential_threat_count",
    "payment_threat_count", "reward_scam_count", "time_pressure_count",
    "sender_email_extension", "sender_domain_has_dash", "sender_domain_subdomain_count"
]

LEGACY_EMAIL_NUMERIC_FEATURE_NAMES = [
    "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
    "body_length", "num_words", "subject_length", "urgent_word_count",
    "sender_email_domain", "sender_email_extension", "sender_domain_has_dash",
    "sender_domain_subdomain_count"
]

URL_FEATURE_NAMES = [
    "is_ip", "has_at", "is_redirect", "has_dash", "domain_len", "nos_subdomain", "extension"
]

URL_FEATURE_LABELS = {
    "is_ip": "URL uses an IP address:",
    "has_at": "Contains @ symbol (nullifies previous text in URL):",
    "is_redirect": "Contains redirect text (directs to different URL):",
    "has_dash": "Contains dash (scam trick to mimic domains):",
    "domain_len": "Domain length (lengthy domains can be a scam trying to mimic legitimate domains):",
    "nos_subdomain": "Number of subdomains (ex. www./blog./en./etc.):",
    "extension": "Domain extension:"
}

EMAIL_FEATURE_LABELS = {
    "num_exclamations": "Number of Exclamation marks:",
    "num_questions": "Number of Question marks:",
    "num_dollar": "Number of Dollar signs: ",
    "num_email_addresses": "Email address count:",
    "body_length": "Email body length:",
    "num_words": "Word count:",
    "subject_length": "Subject length:",
    "credential_threat_count": "Credential threat phrases:",
    "payment_threat_count": "Payment threat phrases:",
    "reward_scam_count": "Prize or reward scam phrases:",
    "time_pressure_count": "Time pressure phrases:",
    "sender_email_domain": "Sender email domain:",
    "sender_email_extension": "Sender email extension:",
    "sender_domain_has_dash": "Sender domain contains dash:",
    "sender_domain_subdomain_count": "Sender domain subdomain count:"
}

EMAIL_SCAM_KEYWORD_GROUPS = {
    "credential_threat_count": [
        "verify account", "verify your account", "confirm account", "confirm your account",
        "verify your identity", "confirm identity", "account verification",
        "account suspended", "account locked", "account disabled", "account on hold",
        "recover account", "recovery phrase", "password", "password reset",
        "reset your password", "login", "sign in", "signin", "secure login",
        "security alert", "unauthorized activity", "unusual activity",
        "two-factor", "2fa", "mfa", "one-time password", "otp", "authentication",
        "validate account", "restore access", "access blocked", "identity verification"
    ],
    "payment_threat_count": [
        "payment", "payment failed", "update your payment", "update payment",
        "billing problem", "billing issue", "billing update", "invoice", "invoice overdue",
        "past due", "pay now", "pay toll", "unpaid", "outstanding balance",
        "wire transfer", "bank transfer", "credit card", "debit card", "card declined",
        "refund", "refund pending", "tax refund", "zelle", "cash app", "venmo",
        "paypal", "crypto", "bitcoin", "ethereum", "wallet", "seed phrase",
        "gift card", "purchase failed", "subscription expired", "renew payment"
    ],
    "reward_scam_count": [
        "claim prize", "claim reward", "winner", "lottery", "congratulations",
        "you have been selected", "selected winner", "free gift", "gift card",
        "reward", "prize", "prizes", "won", "you won", "win", "sweepstakes",
        "giveaway", "bonus", "cash reward", "exclusive offer", "special offer",
        "limited offer", "voucher", "coupon", "redeem now", "claim now"
    ],
    "time_pressure_count": [
        "urgent", "respond now", "asap", "act now", "limited time",
        "immediate action required", "action required", "final notice", "last warning",
        "expires today", "expires soon", "within 24 hours", "24 hours",
        "immediately", "right away", "now", "deadline", "before it expires",
        "avoid suspension", "avoid closure", "legal action", "account closure",
        "today only", "do not ignore", "time sensitive", "scan here", "click here",
        "open attachment", "download attachment"
    ]
}

EMAIL_URGENCY_KEYWORDS = sorted({
    keyword
    for keywords in EMAIL_SCAM_KEYWORD_GROUPS.values()
    for keyword in keywords
})

REDIRECT_PARAMS = [
    "url", "redirect", "redirect_uri", "next",
    "return", "target", "to", "goto"
]

NOMINAL_FEATURE_VALUES = {
    "is_ip": {0: "No", 1: "Yes"},
    "has_at": {0: "No", 1: "Yes"},
    "is_redirect": {0: "No", 1: "Yes"},
    "has_dash": {0: "No", 1: "Yes"},
    "sender_domain_has_dash": {0: "No", 1: "Yes"}
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


def count_keyword_matches(text, keywords):
    text = text.lower()
    return sum(text.count(keyword) for keyword in keywords)


def get_email_scam_category_counts(text):
    return {
        feature_name: count_keyword_matches(text, keywords)
        for feature_name, keywords in EMAIL_SCAM_KEYWORD_GROUPS.items()
    }


def get_email_domain(email_address):
    match = re.search(r"@([A-Za-z0-9.-]+\.[A-Za-z]{2,})", str(email_address))
    if not match:
        return "unknown"
    return match.group(1).lower().strip(".")


def get_email_extension(domain):
    if not domain or domain == "unknown" or "." not in domain:
        return "unknown"
    return domain.rsplit(".", 1)[-1]


def encode_email_sender_feature(feature_name, value):
    mapping = email_sender_feature_encoders.get(feature_name, {"unknown": 0})
    return mapping.get(value, mapping.get("unknown", 0))


def get_email_suspicion_score(body, subject, numeric_feature_values):
    credential_count = numeric_feature_values.get("credential_threat_count", 0)
    payment_count = numeric_feature_values.get("payment_threat_count", 0)
    reward_count = numeric_feature_values.get("reward_scam_count", 0)
    time_pressure_count = numeric_feature_values.get("time_pressure_count", 0)

    score = 0
    score += min(credential_count * 14, 35)
    score += min(payment_count * 12, 30)
    score += min(reward_count * 10, 25)
    score += min(time_pressure_count * 10, 25)
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


def get_email_top_features(X_combined, numeric_feature_values, email_text, predicted_class, numeric_feature_names):
    feature_names = list(email_tfidf.get_feature_names_out()) + numeric_feature_names
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
        for feature_name in list(email_tfidf.get_feature_names_out())
    }
    feature_values.update(numeric_feature_values)

    # Display only engineered email fields in the UI
    # word/phrase weights are confusing as user-facing explanations.
    filtered_indices = []
    for i, name in enumerate(feature_names):
        if name in numeric_feature_names and name in EMAIL_EXPLANATION_FEATURE_NAMES:
            filtered_indices.append(i)
            
    # Reconstruct the lists using only the filtered indices
    final_names = [feature_names[i] for i in filtered_indices]
    final_contributions = [email_shap_contributions[i] for i in filtered_indices]

    return get_top_shap_features(final_contributions, final_names, feature_values)

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
    is_redirect = 1 if any(word in url.lower() for word in REDIRECT_PARAMS) else 0
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
    sender = data.get("sender", "")

    # Numeric features
    num_exclamations = body.count("!")
    num_questions = body.count("?")
    num_dollar = body.count("$")
    num_email_addresses = body.count("@")
    body_length = len(body)
    num_words = len(body.split())
    subject_length = len(subject)

    email_text = f"{subject} {body}".strip()
    scam_category_counts = get_email_scam_category_counts(email_text)
    sender_domain = get_email_domain(sender)
    sender_extension = get_email_extension(sender_domain)
    sender_domain_encoded = encode_email_sender_feature("sender_email_domain", sender_domain)
    sender_extension_encoded = encode_email_sender_feature("sender_email_extension", sender_extension)
    sender_domain_has_dash = 1 if "-" in sender_domain else 0
    sender_domain_subdomain_count = 0 if sender_domain == "unknown" else max(sender_domain.count(".") - 1, 0)

    numeric_feature_values = {
        "num_exclamations": num_exclamations,
        "num_questions": num_questions,
        "num_dollar": num_dollar,
        "num_email_addresses": num_email_addresses,
        "body_length": body_length,
        "num_words": num_words,
        "subject_length": subject_length,
        "credential_threat_count": scam_category_counts["credential_threat_count"],
        "payment_threat_count": scam_category_counts["payment_threat_count"],
        "reward_scam_count": scam_category_counts["reward_scam_count"],
        "time_pressure_count": scam_category_counts["time_pressure_count"],
        "sender_email_domain": sender_domain,
        "sender_email_extension": sender_extension,
        "sender_domain_has_dash": sender_domain_has_dash,
        "sender_domain_subdomain_count": sender_domain_subdomain_count
    }

    numeric_model_values = {
        "num_exclamations": num_exclamations,
        "num_questions": num_questions,
        "num_dollar": num_dollar,
        "num_email_addresses": num_email_addresses,
        "body_length": body_length,
        "num_words": num_words,
        "subject_length": subject_length,
        "credential_threat_count": scam_category_counts["credential_threat_count"],
        "payment_threat_count": scam_category_counts["payment_threat_count"],
        "reward_scam_count": scam_category_counts["reward_scam_count"],
        "time_pressure_count": scam_category_counts["time_pressure_count"],
        "sender_email_domain": sender_domain_encoded,
        "sender_email_extension": sender_extension_encoded,
        "sender_domain_has_dash": sender_domain_has_dash,
        "sender_domain_subdomain_count": sender_domain_subdomain_count
    }

    expected_email_numeric_count = getattr(email_scaler, "n_features_in_", len(EMAIL_NUMERIC_FEATURE_NAMES))
    numeric_feature_names = EMAIL_NUMERIC_FEATURE_NAMES[:expected_email_numeric_count]
    if expected_email_numeric_count == len(LEGACY_EMAIL_NUMERIC_FEATURE_NAMES):
        numeric_feature_names = LEGACY_EMAIL_NUMERIC_FEATURE_NAMES
    if expected_email_numeric_count == 9:
        # Backward compatibility for older saved models that still expect
        # has_urgent_words before the sender metadata features existed.
        numeric_feature_names = [
            "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
            "body_length", "num_words", "subject_length", "urgent_word_count",
            "has_urgent_words"
        ]
        urgent_count = sum(scam_category_counts.values())
        numeric_model_values["urgent_word_count"] = urgent_count
        numeric_model_values["has_urgent_words"] = 1 if urgent_count > 0 else 0
    numeric_values = pd.DataFrame([[
        numeric_model_values[feature_name]
        for feature_name in numeric_feature_names
    ]], columns=numeric_feature_names)

    X_tfidf = email_tfidf.transform([email_text])
    X_num_scaled = email_scaler.transform(numeric_values)
    X_combined = hstack([X_tfidf, X_num_scaled])

    pred = email_model.predict(X_combined)[0]
    prob = email_model.predict_proba(X_combined)[0].max()
    risk_score = get_email_risk_score(pred, prob, body, subject, numeric_feature_values)
    label = "Phishing" if risk_score >= 50 else "Legitimate"
    top_features = get_email_top_features(
        X_combined,
        numeric_feature_values,
        email_text,
        pred,
        numeric_feature_names
    )

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

    # BLACKLIST CHECK
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

    #TRUSTED DOMAIN CHECK
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

    # Continue with normal ML prediction
    features = extract_url_features(url)


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
