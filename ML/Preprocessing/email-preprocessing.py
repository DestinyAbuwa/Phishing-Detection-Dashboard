import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler
from scipy.sparse import hstack
import os

# Load Data
filename = "combined_email.csv"
df = pd.read_csv(filename)

# Drop date and urls Features
if "date" in df.columns:
    df = df.drop(columns=["date"])

df = df.drop(columns=["urls"])

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

# Urgent / Scam Keyword Features
urgent_words = [
    "urgent",
    "respond now",
    "asap",
    "act now",
    "limited time",
    "verify account",
    "bank transfer",
    "claim prize",
    "lottery",
    "winner"
]

def count_keywords(text):
    text = text.lower()
    return sum(text.count(word) for word in urgent_words)

df["urgent_word_count"] = df["body"].apply(count_keywords)
df["has_urgent_words"] = (df["urgent_word_count"] > 0).astype(int)

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
        "urgent_word_count",
        "has_urgent_words"
    ]
]

# Scale Numeric Features
scaler = StandardScaler()
X_num = scaler.fit_transform(numeric_features)

X = hstack([X_text, X_num])
y = df["label"]

# Save Cleaned Dataset
base = os.path.basename(filename)
cleaned_filename = f"cleaned_{base}"
df.to_csv(cleaned_filename, index=False)

print("Cleaned dataset saved as:", cleaned_filename)