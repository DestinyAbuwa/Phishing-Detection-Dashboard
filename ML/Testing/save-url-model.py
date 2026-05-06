import pandas as pd
import joblib
from pathlib import Path
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parents[1]

df = pd.read_csv(BASE_DIR / "Testing" / "cleaned_url_dataset.csv")

df["extension"] = df["extension"].fillna("unknown").astype(str).str.lower()
extension_mapping = {
    extension: index
    for index, extension in enumerate(sorted(df["extension"].unique()))
}
df["extension_encoded"] = df["extension"].map(extension_mapping)

# Drop non-numeric columns
X = df.drop(
    columns=[
        "domain", "extension", "label",
        "url_len", "url_length", "urlLen", "URLLength", "urlLength"
    ],
    errors="ignore"
)
y = df["label"]

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Use best hyperparameters from url-model-comparison.py
# (Check your output – example values below)
model = DecisionTreeClassifier(max_depth=20, min_samples_split=2, random_state=42)
model.fit(X_scaled, y)

joblib.dump(scaler, BASE_DIR / "url_scaler.pkl")
joblib.dump(model, BASE_DIR / "url_model.pkl")
joblib.dump(extension_mapping, BASE_DIR / "url_extension_encoder.pkl")

print("URL model saved without URL length and with encoded extension")
