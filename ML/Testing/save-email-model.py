import pandas as pd
import joblib
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler
from sklearn.naive_bayes import MultinomialNB
from scipy.sparse import hstack


# Load preprocessed email data
df = pd.read_csv("cleaned_combined_email.csv")

# Numeric features (must match your email-preprocessing.py)
numeric_features = [
    "num_exclamations", "num_questions", "num_dollar", "num_email_addresses",
    "body_length", "num_words", "subject_length", "urgent_word_count", "has_urgent_words"
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
joblib.dump(tfidf, "email_tfidf.pkl")
joblib.dump(scaler, "email_scaler.pkl")
joblib.dump(model, "email_model.pkl")

print("Email model saved")
