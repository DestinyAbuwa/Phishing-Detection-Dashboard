import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import LabelEncoder
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import accuracy_score

# Load Preprocessed url Dataset
df = pd.read_csv("cleaned_url_dataset.csv")

# Encode Categorical Variables
label_encoders = {}
for col in df.select_dtypes(include=['object']).columns:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col])
    label_encoders[col] = le

# Features and Target
X = df.drop(columns=["label"])
y = df["label"]

# Train/test split (20%)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Hyperparameter tuning

# KNN Tuning
knn_params = {
    "n_neighbors": list(range(1, 21)),
    "weights": ["uniform", "distance"]
}
knn_grid = GridSearchCV(KNeighborsClassifier(), knn_params, cv=5, scoring="accuracy")
knn_grid.fit(X_train, y_train)
best_knn = knn_grid.best_estimator_

# Decision Tree Tuning
dt_params = {
    "max_depth": [None, 5, 10, 20],
    "min_samples_split": [2, 5, 10]
}
dt_grid = GridSearchCV(DecisionTreeClassifier(random_state=42), dt_params, cv=5, scoring="accuracy")
dt_grid.fit(X_train, y_train)
best_dt = dt_grid.best_estimator_

# Naive Bayes Tuning (only var_smoothing to tune)
nb_params = {
    "var_smoothing": [1e-9, 1e-8, 1e-7]
}
nb_grid = GridSearchCV(GaussianNB(), nb_params, cv=5, scoring="accuracy")
nb_grid.fit(X_train, y_train)
best_nb = nb_grid.best_estimator_

# Show Best Hyperparameters

print("\nBest Hyperparameters:")
print("KNN:", knn_grid.best_params_)
print("Decision Tree:", dt_grid.best_params_)
print("Naive Bayes:", nb_grid.best_params_)

# Evaluation + Comparison Table

results = []

models = {
    "KNN": best_knn,
    "Decision Tree": best_dt,
    "Naive Bayes": best_nb
}

for name, model in models.items():
    # Cross-Validation Accuracy
    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='accuracy')
    cv_mean = cv_scores.mean()
    
    # Test Accuracy
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    test_acc = accuracy_score(y_test, y_pred)
    
    results.append([name, cv_mean, test_acc])

# Create Comparison Table
results_df = pd.DataFrame(results, columns=["Model", "CV Accuracy (Mean)", "Test Accuracy"])

print("\nModel Comparison Table:")
print(results_df)