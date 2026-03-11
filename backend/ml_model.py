import pandas as pd
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestRegressor
import os
from dotenv import load_dotenv

# Load the secrets from the .env file into Python's memory
load_dotenv() 

# Securely fetch the URL
DB_URL = os.getenv("DATABASE_URL")

# --- (The rest of your code remains exactly the same!) ---
def predict_future_wait(shop_name: str, day_of_week: int, hour_of_day: int):
    # Pandas uses SQLAlchemy to connect to Postgres
    engine = create_engine(DB_URL)
    
    # Query the cloud database
    query = "SELECT day_of_week, hour_of_day, queue_length, service_duration FROM history_log WHERE shop = %(shop_name)s"
    df = pd.read_sql_query(query, engine, params={"shop_name": shop_name})
    
    if len(df) < 10: 
        return {"predicted_queue": 0, "predicted_wait_mins": 0, "hourly_graph": []}
        
    # Train the Random Forest Models
    X = df[['day_of_week', 'hour_of_day']]
    rf_time = RandomForestRegressor(n_estimators=50, random_state=42).fit(X, df['service_duration'])
    rf_queue = RandomForestRegressor(n_estimators=50, random_state=42).fit(X, df['queue_length'])
    
    # Predict requested time
    future_data = pd.DataFrame({'day_of_week': [day_of_week], 'hour_of_day': [hour_of_day]})
    predicted_time_seconds = rf_time.predict(future_data)[0]
    predicted_queue = rf_queue.predict(future_data)[0]
    
    # Generate graph data
    hourly_graph = []
    for h in range(9, 18):
        q = rf_queue.predict(pd.DataFrame({'day_of_week': [day_of_week], 'hour_of_day': [h]}))[0]
        hourly_graph.append(int(q))
    
    return {
        "predicted_queue": int(predicted_queue),
        "predicted_wait_mins": max(1, round((predicted_queue * predicted_time_seconds) / 60)),
        "hourly_graph": hourly_graph
    }