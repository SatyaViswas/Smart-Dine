from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3, time
from datetime import datetime
try:
    from .ml_model import predict_future_wait
    from .database import initialize_database
except ImportError:
    from ml_model import predict_future_wait
    from database import initialize_database

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "smartdine.db"


def get_conn():
    return sqlite3.connect(DB_PATH)

app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class CheckInReq(BaseModel): uid: str; shop: str
class PredictReq(BaseModel): shop: str; date_string: str; time_string: str


@app.on_event("startup")
def on_startup():
    initialize_database()


@app.get("/health")
def health():
    return {"ok": True}

@app.get("/api/status")
def get_status(shop: str = "Meals"):
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM active_queue WHERE shop=?", (shop,))
    queue = c.fetchone()[0]
    c.execute("SELECT service_duration FROM history_log WHERE shop=? ORDER BY id DESC LIMIT 5", (shop,))
    recent = c.fetchall()
    avg_speed = sum([t[0] for t in recent]) / len(recent) if recent else 60.0
    c.execute("SELECT COUNT(*) FROM active_queue WHERE shop='Meals'")
    available_seats = max(0, 120 - c.fetchone()[0])
    conn.close()
    traffic = "High" if queue >= 15 else "Medium" if queue >= 7 else "Low"
    return {"queue": queue, "wait": round((queue * avg_speed) / 60), "seats": available_seats, "traffic": traffic}

@app.post("/api/join")
def join_queue(req: CheckInReq):
    conn = get_conn()
    conn.execute("INSERT INTO active_queue (uid, shop, time_in) VALUES (?, ?, ?)", (req.uid, req.shop, time.time()))
    conn.commit(); conn.close()
    return {"status": "success"}

@app.get("/api/orders")
def get_orders():
    conn = get_conn()
    orders = [{"id": r[0], "uid": r[1], "shop": r[2], "time_in": r[3]} for r in conn.execute("SELECT id, uid, shop, time_in FROM active_queue ORDER BY time_in ASC")]
    conn.close()
    return orders

@app.post("/api/serve/{order_id}")
def serve_order(order_id: int):
    conn = get_conn()
    order = conn.execute("SELECT uid, shop, time_in FROM active_queue WHERE id=?", (order_id,)).fetchone()
    if order:
        duration = time.time() - order[2]
        now = datetime.now()
        queue = conn.execute("SELECT COUNT(*) FROM active_queue WHERE shop=?", (order[1],)).fetchone()[0]
        conn.execute("INSERT INTO history_log (uid, shop, day_of_week, hour_of_day, queue_length, service_duration) VALUES (?, ?, ?, ?, ?, ?)", (order[0], order[1], now.weekday(), now.hour, queue, duration))
        conn.execute("DELETE FROM active_queue WHERE id=?", (order_id,))
        conn.commit()
    conn.close()
    return {"status": "served"}

@app.post("/api/predict")
def predict_wait(req: PredictReq):
    date_obj = datetime.strptime(req.date_string, "%Y-%m-%d")
    time_obj = datetime.strptime(req.time_string, "%H:%M")
    return predict_future_wait(req.shop, date_obj.weekday(), time_obj.hour)