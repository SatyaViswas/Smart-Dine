from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import psycopg2
from psycopg2.pool import SimpleConnectionPool
import hashlib
from datetime import datetime, timezone, timedelta
import random
from ml_model import predict_future_wait
import os
from dotenv import load_dotenv

# Load the secrets from the .env file into Python's memory
load_dotenv() 

# Securely fetch the URL
DB_URL = os.getenv("DATABASE_URL")
db_pool = SimpleConnectionPool(1, 10, DB_URL)
IST = timezone(timedelta(hours=5, minutes=30))


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

        c.execute("SELECT service_duration FROM history_log WHERE shop=%s ORDER BY id DESC LIMIT 10", (shop,))
        recent = c.fetchall()
        avg_speed = sum([t[0] for t in recent]) / len(recent) if recent else 60.0

        c.execute("SELECT COUNT(*) FROM history_log WHERE occupies_seat = TRUE AND seat_release_time > NOW()")
        occupied_seats = c.fetchone()[0]
        available_seats = max(0, 120 - occupied_seats)

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

        c.execute("SELECT COUNT(*) FROM active_queue WHERE roll_no = %s AND shop = %s", (clean_roll_no, req.shop))
        existing_count = c.fetchone()[0]
        if existing_count > 0:
            return JSONResponse(
                status_code=400,
                content={"error": "You already have an active order in this section. Please wait until it is served."}
            )

        exact_time_in = datetime.now(timezone.utc)
        c.execute(
            "INSERT INTO active_queue (uid, roll_no, shop, time_in) VALUES (%s, %s, %s, %s)",
            (clean_roll_no, clean_roll_no, req.shop, exact_time_in)
        )
        conn.commit()
        return {"status": "success"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to join queue")
    finally:
        release_db_connection(conn)

@app.get("/api/my_orders")
def get_my_orders(roll_no: str):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        clean_roll_no = roll_no.strip().upper()

        c.execute("SELECT shop, time_in FROM active_queue WHERE roll_no = %s ORDER BY time_in DESC", (clean_roll_no,))
        active = []
        for r in c.fetchall():
            order_dict = {"shop": r[0], "time_in": None}
            if r[1]:
                time_utc = r[1].replace(tzinfo=timezone.utc)
                time_ist = time_utc.astimezone(IST)
                order_dict["time_in"] = time_ist.strftime('%I:%M %p')
            active.append(order_dict)

        c.execute(
            "SELECT shop, time_served FROM history_log WHERE roll_no = %s ORDER BY time_served DESC LIMIT 5",
            (clean_roll_no,)
        )
        completed = []
        for r in c.fetchall():
            order_dict = {"shop": r[0], "time_served": None, "time_served_raw": None}
            time_utc = None
            if r[1]:
                time_utc = r[1].replace(tzinfo=timezone.utc)
                time_ist = time_utc.astimezone(IST)
                order_dict["time_served"] = time_ist.strftime('%I:%M %p')
            order_dict["time_served_raw"] = time_utc.isoformat() if time_utc else None
            completed.append(order_dict)

        return {"active": active, "completed": completed}
    finally:
        release_db_connection(conn)

@app.post("/api/scan_checkin")
def scan_checkin(req: ScanCheckInReq):
    validate_shop(req.shop)
    conn = None

    clean_roll_no = req.roll_no.strip().upper()
    if not clean_roll_no:
        raise HTTPException(status_code=400, detail="Invalid roll number in barcode")

    try:
        conn = get_db_connection()
        c = conn.cursor()

        # Auto-register student if this roll number does not exist yet.
        c.execute("SELECT 1 FROM students WHERE roll_no = %s", (clean_roll_no,))
        if not c.fetchone():
            c.execute("INSERT INTO students (roll_no) VALUES (%s)", (clean_roll_no,))

        # Avoid duplicate active orders for the same student and shop.
        c.execute("SELECT COUNT(*) FROM active_queue WHERE roll_no = %s AND shop = %s", (clean_roll_no, req.shop))
        existing_count = c.fetchone()[0]
        if existing_count > 0:
            return JSONResponse(
                status_code=400,
                content={"error": "This roll number already has an active order in this section."}
            )

        c.execute(
            "INSERT INTO active_queue (uid, roll_no, shop, time_in) VALUES (%s, %s, %s, %s)",
            (clean_roll_no, clean_roll_no, req.shop, datetime.now(timezone.utc))
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
        c.execute("SELECT id, COALESCE(uid, roll_no), shop, time_in FROM active_queue WHERE shop = %s ORDER BY time_in ASC", (shop,))
        orders = []
        for r in c.fetchall():
            order_dict = {"id": r[0], "uid": r[1], "shop": r[2], "time_in": None}
            if r[3]:
                time_utc = r[3].replace(tzinfo=timezone.utc)
                time_ist = time_utc.astimezone(IST)
                order_dict["time_in"] = time_ist.strftime('%I:%M %p')
            orders.append(order_dict)
        return orders
    finally:
        release_db_connection(conn)

@app.post("/api/serve/{order_id}")
def serve_order(order_id: int):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()

        c.execute("SELECT COALESCE(roll_no, uid), shop, time_in FROM active_queue WHERE id=%s", (order_id,))
        order = c.fetchone()
        if order:
            time_served = datetime.now(timezone.utc)
            time_in_value = order[2]
            if isinstance(time_in_value, datetime):
                time_in_utc = time_in_value.replace(tzinfo=timezone.utc)
            else:
                time_in_utc = datetime.fromtimestamp(float(time_in_value), timezone.utc)

            service_duration = max(0.0, (time_served - time_in_utc).total_seconds())

            current_minute = time_served.minute
            roll_no = order[0]
            shop = order[1]

            occupies_seat = False
            seat_release_time = time_served

            if shop == "Meals":
                occupies_seat = True
                seat_release_time = time_served + timedelta(minutes=random.randint(20, 25))
            elif shop in ["Snacks", "Beverages"]:
                if random.random() <= 0.20:
                    occupies_seat = True
                    seat_release_time = time_served + timedelta(minutes=random.randint(10, 15))

            c.execute("SELECT COUNT(*) FROM active_queue WHERE shop=%s", (shop,))
            queue = c.fetchone()[0]

            c.execute(
                "INSERT INTO history_log (roll_no, shop, day_of_week, hour_of_day, minute, queue_length, service_duration, occupies_seat, seat_release_time, time_served) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (roll_no, shop, time_served.weekday(), time_served.hour, current_minute, queue, service_duration, occupies_seat, seat_release_time, time_served)
            )
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