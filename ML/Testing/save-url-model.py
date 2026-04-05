import pandas as pd
import joblib
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("cleaned_url_dataset.csv")

# Drop non-numeric columns (adjust if your CSV has different names)
X = df.drop(columns=["domain", "extension", "label"])
y = df["label"]

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Use best hyperparameters from url-model-comparison.py
# (Check your output – example values below)
model = DecisionTreeClassifier(max_depth=20, min_samples_split=2, random_state=42)
model.fit(X_scaled, y)

joblib.dump(scaler, "url_scaler.pkl")
joblib.dump(model, "url_model.pkl")

print("URL model saved")