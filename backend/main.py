from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import time
from datetime import datetime
from ml_model import predict_future_wait
import os
from dotenv import load_dotenv

# Load the secrets from the .env file into Python's memory
load_dotenv() 

# Securely fetch the URL
DB_URL = os.getenv("DATABASE_URL")


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class CheckInReq(BaseModel): uid: str; shop: str
class PredictReq(BaseModel): shop: str; date_string: str; time_string: str

def get_db_connection():
    return psycopg2.connect(DB_URL)

@app.get("/api/status")
def get_status(shop: str = "Meals"):
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute("SELECT COUNT(*) FROM active_queue WHERE shop=%s", (shop,))
    queue = c.fetchone()[0]
    
    c.execute("SELECT service_duration FROM history_log WHERE shop=%s ORDER BY id DESC LIMIT 5", (shop,))
    recent = c.fetchall()
    avg_speed = sum([t[0] for t in recent]) / len(recent) if recent else 60.0
    
    c.execute("SELECT COUNT(*) FROM active_queue WHERE shop='Meals'")
    available_seats = max(0, 120 - c.fetchone()[0])
    conn.close()
    
    traffic = "High" if queue >= 15 else "Medium" if queue >= 7 else "Low"
    return {"queue": queue, "wait": round((queue * avg_speed) / 60), "seats": available_seats, "traffic": traffic}

@app.post("/api/join")
def join_queue(req: CheckInReq):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO active_queue (uid, shop, time_in) VALUES (%s, %s, %s)", (req.uid, req.shop, time.time()))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/orders")
def get_orders():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, uid, shop, time_in FROM active_queue ORDER BY time_in ASC")
    orders = [{"id": r[0], "uid": r[1], "shop": r[2], "time_in": r[3]} for r in c.fetchall()]
    conn.close()
    return orders

@app.post("/api/serve/{order_id}")
def serve_order(order_id: int):
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute("SELECT uid, shop, time_in FROM active_queue WHERE id=%s", (order_id,))
    order = c.fetchone()
    if order:
        duration = time.time() - order[2]
        now = datetime.now()
        
        c.execute("SELECT COUNT(*) FROM active_queue WHERE shop=%s", (order[1],))
        queue = c.fetchone()[0]
        
        c.execute("INSERT INTO history_log (uid, shop, day_of_week, hour_of_day, queue_length, service_duration) VALUES (%s, %s, %s, %s, %s, %s)", 
                  (order[0], order[1], now.weekday(), now.hour, queue, duration))
        c.execute("DELETE FROM active_queue WHERE id=%s", (order_id,))
        conn.commit()
    
    conn.close()
    return {"status": "served"}

@app.post("/api/predict")
def predict_wait(req: PredictReq):
    date_obj = datetime.strptime(req.date_string, "%Y-%m-%d")
    time_obj = datetime.strptime(req.time_string, "%H:%M")
    return predict_future_wait(req.shop, date_obj.weekday(), time_obj.hour)