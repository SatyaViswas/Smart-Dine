import sqlite3
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

def predict_future_wait(shop_name: str, day_of_week: int, hour_of_day: int):
    conn = sqlite3.connect('smartdine.db')
    df = pd.read_sql_query("SELECT day_of_week, hour_of_day, queue_length, service_duration FROM history_log WHERE shop=?", conn, params=(shop_name,))
    conn.close()
    
    if len(df) < 10: 
        return {"predicted_queue": 0, "predicted_wait_mins": 0, "hourly_graph": []}
        
    X = df[['day_of_week', 'hour_of_day']]
    rf_time = RandomForestRegressor(n_estimators=50, random_state=42).fit(X, df['service_duration'])
    rf_queue = RandomForestRegressor(n_estimators=50, random_state=42).fit(X, df['queue_length'])
    
    # Predict the exact time the user requested
    future_data = pd.DataFrame({'day_of_week': [day_of_week], 'hour_of_day': [hour_of_day]})
    predicted_time_seconds = rf_time.predict(future_data)[0]
    predicted_queue = rf_queue.predict(future_data)[0]
    
    # Loop through the day to generate the data for the UI Graph (9 AM to 5 PM)
    hourly_graph = []
    for h in range(9, 18):
        q = rf_queue.predict(pd.DataFrame({'day_of_week': [day_of_week], 'hour_of_day': [h]}))[0]
        hourly_graph.append(int(q))
    
    return {
        "predicted_queue": int(predicted_queue),
        "predicted_wait_mins": max(1, round((predicted_queue * predicted_time_seconds) / 60)),
        "hourly_graph": hourly_graph  # This gets sent to the Javascript chart!
    }