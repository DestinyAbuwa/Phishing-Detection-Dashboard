import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import VotingClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import classification_report, accuracy_score

# 1. Load and Split
df = pd.read_csv("cleaned_combined_email.csv")
X = df.drop(columns=["label"])
y = df["label"]

numeric_features = X.select_dtypes(include=['int64', 'float64']).columns
categorical_features = X.select_dtypes(include=['object']).columns

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 2. Preprocessor
preprocessor = ColumnTransformer(
    transformers=[
        ('num', MinMaxScaler(), numeric_features),
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=True), categorical_features)
    ])

# 3. Define Individual Pipelines
# Using KNN instead of Random Forest
nb_pipe = Pipeline([('pre', preprocessor), ('clf', MultinomialNB(alpha=0.1))])
dt_pipe = Pipeline([('pre', preprocessor), ('clf', DecisionTreeClassifier(max_depth=20, random_state=42))])
knn_pipe = Pipeline([('pre', preprocessor), ('clf', KNeighborsClassifier(n_neighbors=5, weights='distance'))])

# 4. Create the Voting Classifier
# Using 'soft' voting so models can weigh in based on their confidence levels
voting_clf = VotingClassifier(
    estimators=[
        ('nb', nb_pipe),
        ('dt', dt_pipe),
        ('knn', knn_pipe)
    ],
    voting='soft',
    n_jobs=-1
)

# 5. Train and Evaluate
print(f"Training Voting Classifier (KNN version) on {len(X_train)} samples...")
start_time = time.time()

voting_clf.fit(X_train, y_train)

duration = time.time() - start_time
y_pred = voting_clf.predict(X_test)

# 6. Final Results
print(f"\n✅ Voting Classifier finished in {round(duration, 2)}s")
print(f"Ensemble Accuracy: {accuracy_score(y_test, y_pred):.4f}")

print("\n--- Detailed Classification Report ---")
print(classification_report(y_test, y_pred))