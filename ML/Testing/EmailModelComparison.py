import pandas as pd
import numpy as np
import time
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import classification_report, accuracy_score

# 1. Load Dataset
df = pd.read_csv("cleaned_combined_email.csv")
X = df.drop(columns=["label"])
y = df["label"]

numeric_features = X.select_dtypes(include=['int64', 'float64']).columns
categorical_features = X.select_dtypes(include=['object']).columns

# 2. Memory-Safe Preprocessor (Sparse=True)
# use MinMaxScaler because MultinomialNB cannot handle negative numbers 
# produced by StandardScaler.
preprocessor = ColumnTransformer(
    transformers=[
        ('num', MinMaxScaler(), numeric_features),
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=True), categorical_features)
    ])

# 3. Split Data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 4. Define Models and Parameters
models_to_run = {
    "Multinomial NB": (
        Pipeline([('pre', preprocessor), ('clf', MultinomialNB())]),
        {"clf__alpha": [0.01, 0.1, 1.0]}
    ),
    "Decision Tree": (
        Pipeline([('pre', preprocessor), ('clf', DecisionTreeClassifier(random_state=42))]),
        {"clf__max_depth": [10, 20, None], "clf__min_samples_split": [2, 5]}
    ),
    "Random Forest": (
        Pipeline([('pre', preprocessor), ('clf', RandomForestClassifier(random_state=42))]),
        {"clf__n_estimators": [100], "clf__max_depth": [10, 20]}
    ),
    "KNN": (
        Pipeline([('pre', preprocessor), ('clf', KNeighborsClassifier())]),
        {"clf__n_neighbors": [5, 11], "clf__weights": ["distance"]}
    )
}

# 5. Execution Loop
results = []
best_estimators = {}

print(f"Starting memory-optimized training on {len(X_train)} samples...")

for name, (pipe, params) in models_to_run.items():
    print(f"Running {name}...")
    start_time = time.time()
    
    # pre_dispatch='2*n_jobs' limits memory usage during parallel processing
    grid = GridSearchCV(
        pipe, 
        params, 
        cv=5, 
        scoring='accuracy', 
        n_jobs=-1, 
        pre_dispatch='2*n_jobs'
    )
    
    try:
        grid.fit(X_train, y_train)
        
        duration = time.time() - start_time
        best_estimators[name] = grid.best_estimator_
        
        # Evaluation
        y_pred = grid.predict(X_test)
        test_acc = accuracy_score(y_test, y_pred)
        
        results.append({
            "Model": name,
            "Test Accuracy": test_acc,
            "Time (sec)": round(duration, 2),
            "Best Params": grid.best_params_
        })
        print(f"✅ Finished {name} in {round(duration, 2)}s")
        
    except Exception as e:
        print(f"❌ {name} failed: {e}")

# 6. Final Comparison Table
results_df = pd.DataFrame(results)
print("\n--- Final Model Comparison ---")
if not results_df.empty:
    print(results_df[["Model", "Test Accuracy", "Time (sec)"]])
    
    # Detailed report for the top performer
    best_model_name = results_df.iloc[results_df['Test Accuracy'].idxmax()]['Model']
    print(f"\n--- Detailed Report for {best_model_name} ---")
    print(classification_report(y_test, best_estimators[best_model_name].predict(X_test)))
else:
    print("No models were successfully trained.")