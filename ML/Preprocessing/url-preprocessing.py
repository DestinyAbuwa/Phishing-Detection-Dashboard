import pandas as pd
from sklearn.preprocessing import StandardScaler
import os

# Load Data
filename = "url_dataset.csv"
df = pd.read_csv(filename)

# Drop API-Dependent Columns
df = df.drop(columns=[c for c in ["valid", "ranking", "activeDuration"] if c in df.columns])

# Handle Missing Values
numeric_cols = df.select_dtypes(include=["int64", "float64"]).columns.tolist()
for col in numeric_cols:
    df[col] = df[col].fillna(df[col].median())

df["domain"] = df["domain"].fillna("unknown")

# Remove Duplicate Domains
df = df.drop_duplicates(subset="domain")

# Create Extension Feature
def get_extension(url):
    url = str(url).lower().split("//")[-1]  # remove http(s)://
    url = url.split("/")[0]                  # remove path
    if "." not in url:
        return "unknown"
    return url.split(".")[-1]

df["extension"] = df["domain"].apply(get_extension)

# Verify Binary Features
binary_cols = ["is@", "isredirect", "haveDash", "isIp"]
for col in binary_cols:
    if col in df.columns:
        df[col] = df[col].apply(lambda x: 1 if x == 1 else 0)

# Scale Numeric Features
numeric_features = df.drop(columns=["domain", "extension", "label"], errors="ignore")

scaler = StandardScaler()
X = scaler.fit_transform(numeric_features)

# Target
y = df["label"]

# Save Cleaned Dataset
base = os.path.basename(filename)
cleaned_filename = f"cleaned_{base}"
df.to_csv(cleaned_filename, index=False)

print("Cleaned dataset saved as:", cleaned_filename)