from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.pool import SimpleConnectionPool
import hashlib
import time
from datetime import datetime
from ml_model import predict_future_wait
import os
from dotenv import load_dotenv

# Load the secrets from the .env file into Python's memory
load_dotenv() 

# Securely fetch the URL
DB_URL = os.getenv("DATABASE_URL")
db_pool = SimpleConnectionPool(1, 10, DB_URL)


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

VALID_SHOPS = {"Meals", "Snacks", "Beverages"}

class CheckInReq(BaseModel): roll_no: str; shop: str
class PredictReq(BaseModel): shop: str; date_string: str; time_string: str
class ScanCheckInReq(BaseModel): roll_no: str; shop: str

def get_db_connection():
    return db_pool.getconn()

def release_db_connection(conn):
    if conn:
        db_pool.putconn(conn)

def validate_shop(shop: str):
    if shop not in VALID_SHOPS:
        raise HTTPException(status_code=400, detail="Invalid shop selected.")

@app.get("/api/status")
def get_status(shop: str):
    validate_shop(shop)
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()

        c.execute("SELECT COUNT(*) FROM active_queue WHERE shop=%s", (shop,))
        queue = c.fetchone()[0]

        c.execute("SELECT service_duration FROM history_log WHERE shop=%s ORDER BY id DESC LIMIT 5", (shop,))
        recent = c.fetchall()
        avg_speed = sum([t[0] for t in recent]) / len(recent) if recent else 60.0

        c.execute("SELECT COUNT(*) FROM active_queue WHERE shop='Meals'")
        available_seats = max(0, 120 - c.fetchone()[0])

        traffic = "High" if queue >= 15 else "Medium" if queue >= 7 else "Low"
        return {"queue": queue, "wait": round((queue * avg_speed) / 60), "seats": available_seats, "traffic": traffic, "avg_speed_seconds": int(avg_speed)}
    finally:
        release_db_connection(conn)

@app.post("/api/join")
def join_queue(req: CheckInReq):
    validate_shop(req.shop)
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        clean_roll_no = req.roll_no.strip().upper()
        c.execute("INSERT INTO active_queue (uid, shop, time_in) VALUES (%s, %s, %s)", (clean_roll_no, req.shop, time.time()))
        conn.commit()
        return {"status": "success"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to join queue")
    finally:
        release_db_connection(conn)

@app.post("/api/scan_checkin")
def scan_checkin(req: ScanCheckInReq):
    validate_shop(req.shop)
    conn = None

    clean_roll_no = req.roll_no.strip().upper()

    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT 1 FROM students WHERE roll_no = %s", (clean_roll_no,))
        if not c.fetchone():
            c.execute("INSERT INTO students (roll_no) VALUES (%s)", (clean_roll_no,))

        c.execute(
            "INSERT INTO active_queue (uid, shop, time_in) VALUES (%s, %s, %s)",
            (clean_roll_no, req.shop, time.time())
        )
        conn.commit()
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to process scan check-in")
    finally:
        release_db_connection(conn)

    return {"success": True, "message": "Scan check-in successful"}

@app.get("/api/orders")
def get_orders(shop: str):
    validate_shop(shop)
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT id, uid, shop, time_in FROM active_queue WHERE shop = %s ORDER BY time_in ASC", (shop,))
        orders = [{"id": r[0], "uid": r[1], "shop": r[2], "time_in": r[3]} for r in c.fetchall()]
        return orders
    finally:
        release_db_connection(conn)

@app.post("/api/serve/{order_id}")
def serve_order(order_id: int):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()

        c.execute("SELECT uid, shop, time_in FROM active_queue WHERE id=%s", (order_id,))
        order = c.fetchone()
        if order:
            duration = time.time() - order[2]
            now = datetime.now()
            current_minute = now.minute

            c.execute("SELECT COUNT(*) FROM active_queue WHERE shop=%s", (order[1],))
            queue = c.fetchone()[0]

            c.execute("INSERT INTO history_log (uid, shop, day_of_week, hour_of_day, minute, queue_length, service_duration) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                      (order[0], order[1], now.weekday(), now.hour, current_minute, queue, duration))
            c.execute("DELETE FROM active_queue WHERE id=%s", (order_id,))
            conn.commit()

        return {"status": "served"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to serve order")
    finally:
        release_db_connection(conn)

@app.post("/api/predict")
def predict_wait(req: PredictReq):
    date_obj = datetime.strptime(req.date_string, "%Y-%m-%d")
    time_obj = datetime.strptime(req.time_string, "%H:%M")
    return predict_future_wait(req.shop, date_obj.weekday(), time_obj.hour, time_obj.minute)


class SignupReq(BaseModel): 
    roll_no: str

@app.post("/api/signup")
def signup_student(req: SignupReq):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()

        clean_roll_no = req.roll_no.strip().upper()

        c.execute("SELECT roll_no FROM students WHERE roll_no = %s", (clean_roll_no,))
        if c.fetchone():
            raise HTTPException(status_code=400, detail="Roll Number already registered. Please log in.")

        c.execute("INSERT INTO students (roll_no) VALUES (%s)", (clean_roll_no,))
        conn.commit()
        return {"success": True, "roll_no": clean_roll_no}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to sign up student")
    finally:
        release_db_connection(conn)
# 1. Ensure LoginReq ONLY asks for roll_no
class LoginReq(BaseModel): 
    roll_no: str

# 2. Ensure your endpoint is using LoginReq (not SignupReq)
@app.post("/api/login")
def login_student(req: LoginReq):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()

        clean_roll_no = req.roll_no.strip().upper()
        c.execute("SELECT roll_no FROM students WHERE roll_no = %s", (clean_roll_no,))
        student = c.fetchone()

        if student:
            return {"success": True, "roll_no": student[0]}
        raise HTTPException(status_code=401, detail="Invalid Roll Number")
    finally:
        release_db_connection(conn)


# --- STAFF AUTH ---

class StaffSignupReq(BaseModel):
    email: str
    password: str
    shop: str

class StaffLoginReq(BaseModel):
    email: str
    password: str

@app.post("/api/staff/signup")
def staff_signup(req: StaffSignupReq):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        clean_email = req.email.strip().lower()
        validate_shop(req.shop)

        c.execute("SELECT email FROM staff WHERE email = %s", (clean_email,))
        if c.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered. Please log in.")

        password_hash = hashlib.sha256(req.password.encode()).hexdigest()
        c.execute("INSERT INTO staff (email, password_hash, shop) VALUES (%s, %s, %s)", (clean_email, password_hash, req.shop))
        conn.commit()
        return {"success": True, "email": clean_email, "shop": req.shop}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to sign up staff")
    finally:
        release_db_connection(conn)

@app.post("/api/staff/login")
def staff_login(req: StaffLoginReq):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        clean_email = req.email.strip().lower()

        c.execute("SELECT shop, password_hash FROM staff WHERE email = %s", (clean_email,))
        row = c.fetchone()

        if row and row[1] == hashlib.sha256(req.password.encode()).hexdigest():
            return {"success": True, "shop": row[0]}
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    finally:
        release_db_connection(conn)