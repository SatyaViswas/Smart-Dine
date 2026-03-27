from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from psycopg2.extras import RealDictCursor
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
class ToggleRequest(BaseModel): shop: str; is_active: bool

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

        # Calculate velocity over the last 15 minutes
        fifteen_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=15)

        # How many joined recently?
        c.execute("SELECT COUNT(*) as joined_count FROM active_queue WHERE shop = %s AND time_in >= %s", (shop, fifteen_mins_ago))
        res = c.fetchone()
        joined_recent = res[0] if isinstance(res, tuple) else res.get('joined_count', 0)

        # How many were served recently?
        c.execute("SELECT COUNT(*) as served_count FROM history_log WHERE shop = %s AND time_served >= %s", (shop, fifteen_mins_ago))
        res = c.fetchone()
        served_recent = res[0] if isinstance(res, tuple) else res.get('served_count', 0)

        # Determine the trend
        if joined_recent > (served_recent + 1):
            trend = "up"
        elif served_recent > (joined_recent + 1):
            trend = "down"
        else:
            trend = "stable"

        traffic = "High" if queue >= 15 else "Medium" if queue >= 7 else "Low"
        return {"queue": queue, "wait": round((queue * avg_speed) / 60), "seats": available_seats, "traffic": traffic, "avg_speed_seconds": int(avg_speed), "trend": trend}
    finally:
        release_db_connection(conn)

@app.post("/api/join")
def join_queue(req: CheckInReq):
    validate_shop(req.shop)
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        clean_roll_no = req.roll_no.strip().upper()

        c.execute("SELECT is_active FROM shop_settings WHERE shop = %s", (req.shop,))
        is_active_row = c.fetchone()
        if is_active_row is not None:
            is_active = is_active_row["is_active"]
            if not is_active:
                return JSONResponse(status_code=400, content={"error": f"The {req.shop} station is currently paused."})

        c.execute("SELECT COUNT(*) FROM active_queue WHERE roll_no = %s AND shop = %s", (clean_roll_no, req.shop))
        existing_count = c.fetchone()["count"]
        if existing_count > 0:
            return JSONResponse(
                status_code=400,
                content={"error": "You already have an active order in this section. Please wait until it is served."}
            )

        # 1. Get current queue length safely (handles both dict and tuple cursors)
        c.execute("SELECT COUNT(*) as count FROM active_queue WHERE shop = %s", (req.shop,))
        queue_res = c.fetchone()
        queue_len = int(queue_res['count'] if isinstance(queue_res, dict) else queue_res[0])

        # 2. Get current average speed safely
        c.execute("SELECT AVG(service_duration) as avg_speed FROM (SELECT service_duration FROM history_log WHERE shop = %s AND service_duration > 0 ORDER BY id DESC LIMIT 10) AS sub", (req.shop,))
        avg_res = c.fetchone()
        avg_val = avg_res['avg_speed'] if isinstance(avg_res, dict) else avg_res[0]
        avg_speed = float(avg_val) if avg_val else 60.0

        # 3. Calculate this specific student's wait time dynamically
        # (queue_len + 1) because the student clicking the button is joining the line
        expected_wait_seconds = (queue_len + 1) * avg_speed

        exact_time_in = datetime.now(timezone.utc)
        c.execute(
            "INSERT INTO active_queue (roll_no, shop, time_in, expected_wait_seconds) VALUES (%s, %s, %s, %s)",
            (clean_roll_no, req.shop, exact_time_in, expected_wait_seconds)
        )
        conn.commit()
        return {"status": "success"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to join queue")
    finally:
        release_db_connection(conn)

@app.get("/api/shop_settings")
def get_shop_settings():
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute("SELECT shop, is_active FROM shop_settings")
        rows = c.fetchall()
        return {row["shop"]: row["is_active"] for row in rows}
    finally:
        release_db_connection(conn)

@app.post("/api/toggle_shop")
def toggle_shop(req: ToggleRequest):
    validate_shop(req.shop)
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("UPDATE shop_settings SET is_active = %s WHERE shop = %s", (req.is_active, req.shop))
        conn.commit()
        return {"message": "Success"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to update shop status")
    finally:
        release_db_connection(conn)

@app.get("/api/my_orders")
def get_my_orders(roll_no: str):
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()
        clean_roll_no = roll_no.strip().upper()

        # Get current time in IST
        now_ist = datetime.now(IST)
        # Roll it back to 12:00:00 AM today
        start_of_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        # Convert that midnight strictly to UTC for the database
        start_of_today_utc = start_of_today_ist.astimezone(timezone.utc)

        c.execute("SELECT shop, time_in, expected_wait_seconds FROM active_queue WHERE roll_no = %s ORDER BY time_in DESC", (clean_roll_no,))
        active = []
        for r in c.fetchall():
            order_dict = {"shop": r[0], "time_in": None}
            if r[1]:
                time_utc = r[1].replace(tzinfo=timezone.utc)
                time_ist = time_utc.astimezone(IST)
                order_dict["time_in"] = time_ist.strftime('%I:%M %p')
                order_dict["time_in_raw"] = time_utc.isoformat() if time_utc else None
            else:
                order_dict["time_in_raw"] = None
            order_dict["expected_wait_seconds"] = r[2] if len(r) > 2 else 0
            active.append(order_dict)

        c.execute('''SELECT shop, time_served 
             FROM history_log 
             WHERE roll_no = %s AND time_served >= %s 
             ORDER BY time_served DESC''', 
          (clean_roll_no, start_of_today_utc))
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
            "INSERT INTO active_queue (roll_no, shop, time_in) VALUES (%s, %s, %s)",
            (clean_roll_no, req.shop, datetime.now(timezone.utc))
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
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute("SELECT id, roll_no, shop, time_in, expected_wait_seconds FROM active_queue WHERE shop = %s ORDER BY time_in ASC", (shop,))
        orders = []
        for row in c.fetchall():
            order_dict = {"id": row["id"], "uid": row["roll_no"], "shop": row["shop"], "time_in": None}
            if row["time_in"]:
                time_utc = row["time_in"].replace(tzinfo=timezone.utc)
                time_ist = time_utc.astimezone(IST)
                order_dict["time_in"] = time_ist.strftime('%I:%M %p')
                order_dict["time_in_raw"] = time_utc.isoformat() if time_utc else None
            else:
                order_dict["time_in_raw"] = None
            order_dict["expected_wait_seconds"] = row.get("expected_wait_seconds", 120)
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

        c.execute("SELECT roll_no, shop, time_in FROM active_queue WHERE id=%s", (order_id,))
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