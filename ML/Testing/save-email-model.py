import pandas as pd
import joblib
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler
from sklearn.naive_bayes import MultinomialNB
from scipy.sparse import hstack

BASE_DIR = Path(__file__).resolve().parents[1]

# Load preprocessed email data
df = pd.read_csv(BASE_DIR / "Testing" / "cleaned_combined_email.csv")

if "sender_email_domain" not in df.columns:
    df["sender_email_domain"] = "unknown"
if "sender_email_extension" not in df.columns:
    df["sender_email_extension"] = "unknown"
if "sender_domain_has_dash" not in df.columns:
    df["sender_domain_has_dash"] = 0
if "sender_domain_subdomain_count" not in df.columns:
    df["sender_domain_subdomain_count"] = 0
for feature_name in [
    "credential_threat_count", "payment_threat_count",
    "reward_scam_count", "time_pressure_count"
]:
    if feature_name not in df.columns:
        df[feature_name] = 0

df["sender_email_domain"] = df["sender_email_domain"].fillna("unknown").astype(str).str.lower()
df["sender_email_extension"] = df["sender_email_extension"].fillna("unknown").astype(str).str.lower()

sender_feature_encoders = {}
for feature_name in ["sender_email_domain", "sender_email_extension"]:
    values = sorted(set(df[feature_name].tolist()) | {"unknown"})
    mapping = {value: index for index, value in enumerate(values)}
    sender_feature_encoders[feature_name] = mapping
    df[feature_name] = df[feature_name].map(mapping).fillna(mapping["unknown"])

# Numeric features (must match your email-preprocessing.py)
numeric_features = [
    "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
    "body_length", "num_words", "subject_length", "credential_threat_count",
    "payment_threat_count", "reward_scam_count", "time_pressure_count",
    "sender_email_domain", "sender_email_extension", "sender_domain_has_dash",
    "sender_domain_subdomain_count"
]

X_text = (df["subject"].fillna("") + " " + df["body"].fillna("")).str.strip()
X_num = df[numeric_features]
y = df["label"]

# 1. TF-IDF on subject + email body.
# The n-grams help phishing phrases like "verify account" carry more meaning than
# single harmless words like "love" or "school".
tfidf = TfidfVectorizer(
    stop_words="english",
    max_features=5000,
    ngram_range=(1, 2),
    min_df=2,
    max_df=0.95,
    sublinear_tf=True
)
X_tfidf = tfidf.fit_transform(X_text)

# 2. MinMaxScaler on numeric features (keeps values in [0,1] for MultinomialNB)
scaler = MinMaxScaler()
X_num_scaled = scaler.fit_transform(X_num)

# 3. Combine
X_combined = hstack([X_tfidf, X_num_scaled])

# 4. Train MultinomialNB (best from your comparison)
model = MultinomialNB(alpha=0.1)
model.fit(X_combined, y)

# 5. Save all pieces
joblib.dump(scaler, BASE_DIR / "email_scaler.pkl")
joblib.dump(model, BASE_DIR / "email_model.pkl")
joblib.dump(tfidf, BASE_DIR / "email_tfidf.pkl")
joblib.dump(sender_feature_encoders, BASE_DIR / "email_sender_feature_encoders.pkl")

print("Email model saved")
