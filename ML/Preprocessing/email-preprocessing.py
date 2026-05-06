import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
from scipy.sparse import hstack
import os
from pathlib import Path
import re

BASE_DIR = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent

# Load Data
filename = "cleaned_combined_email.csv"
input_path = SCRIPT_DIR / filename
if not input_path.exists():
    input_path = BASE_DIR / "Testing" / filename
if not input_path.exists():
    input_path = BASE_DIR / filename

df = pd.read_csv(input_path)

# Drop date and urls Features
df = df.drop(columns=["date", "urls"], errors="ignore")

# Handle Missing Values
df["sender"] = df["sender"].fillna("unknown_sender")
df["receiver"] = df["receiver"].fillna("unknown_receiver")
df["subject"] = df["subject"].fillna("")
df["body"] = df["body"].fillna("")

# Remove Duplicate Emails
df = df.drop_duplicates(subset="body")

# Check For Existing Numeric Features
numeric_existing = df.select_dtypes(include=["int64", "float64"]).columns.tolist()

# Create Manual Spam Indicator Features
df["num_exclamations"] = df["body"].str.count("!")
df["num_questions"] = df["body"].str.count(r"\?")
df["num_dollar"] = df["body"].str.count(r"\$")
df["num_email_addresses"] = df["body"].str.count("@")

df["body_length"] = df["body"].apply(len)
df["num_words"] = df["body"].apply(lambda x: len(x.split()))
df["subject_length"] = df["subject"].apply(len)

def get_email_domain(email_address):
    match = re.search(r"@([A-Za-z0-9.-]+\.[A-Za-z]{2,})", str(email_address))
    if not match:
        return "unknown"
    return match.group(1).lower().strip(".")


def get_email_extension(domain):
    if not domain or domain == "unknown" or "." not in domain:
        return "unknown"
    return domain.rsplit(".", 1)[-1]


df["sender_email_domain"] = df["sender"].apply(get_email_domain)
df["sender_email_extension"] = df["sender_email_domain"].apply(get_email_extension)
df["sender_domain_has_dash"] = df["sender_email_domain"].str.contains("-", regex=False).astype(int)
df["sender_domain_subdomain_count"] = df["sender_email_domain"].apply(
    lambda domain: 0 if domain == "unknown" else max(domain.count(".") - 1, 0)
)

# Urgent / Scam Keyword Features
scam_keyword_groups = {
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


def count_keywords(text, keywords):
    text = text.lower()
    return sum(text.count(word) for word in keywords)

email_text = (df["subject"].fillna("") + " " + df["body"].fillna("")).str.strip()
for feature_name, keywords in scam_keyword_groups.items():
    df[feature_name] = email_text.apply(lambda text: count_keywords(text, keywords))

# Vectorize Email Text
vectorizer = TfidfVectorizer(
    stop_words="english",
    max_features=3000
)

X_text = vectorizer.fit_transform(df["body"])

# Build Numeric Feature Set
numeric_features = df[
    [
        "num_exclamations",
        "num_questions",
        "num_dollar",
        "num_email_addresses",
        "body_length",
        "num_words",
        "subject_length",
        "credential_threat_count",
        "payment_threat_count",
        "reward_scam_count",
        "time_pressure_count",
        "sender_domain_has_dash",
        "sender_domain_subdomain_count"
    ]
]

# Scale Numeric Features
scaler = StandardScaler()
X_num = scaler.fit_transform(numeric_features)

X = hstack([X_text, X_num])
y = df["label"]

# Save Cleaned Dataset
base = os.path.basename(filename)
cleaned_filename = base if base.startswith("cleaned_") else f"cleaned_{base}"
output_path = BASE_DIR / "Testing" / cleaned_filename
output_path.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(output_path, index=False)

print("Cleaned dataset saved as:", output_path)
