from fastapi import FastAPI, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from psycopg2.extras import RealDictCursor
import hashlib
from datetime import datetime, timezone, timedelta
import random
from ml_model import predict_future_wait
import os
from pathlib import Path # Ensure this is imported
from dotenv import load_dotenv
from twilio.twiml.messaging_response import MessagingResponse
from twilio.rest import Client

# 1. Setup Paths
# This finds the 'backend' folder, then goes one level up to 'Smart-Dine-1'
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR

# 2. Load Environment
env_path = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_path)
DB_URL = os.getenv("DATABASE_URL")
db_pool = SimpleConnectionPool(1, 10, DB_URL)
IST = timezone(timedelta(hours=5, minutes=30))
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

# Safety Check: If SID is None, Twilio calls will fail. 
if not TWILIO_SID or not TWILIO_TOKEN:
    print("❌ FATAL ERROR: Twilio Credentials not found in .env!")
    # In a real app, you might raise an error here.
else:
    print(f"✅ Twilio Initialized for SID: {TWILIO_SID[:5]}...")

client = Client(TWILIO_SID, TWILIO_TOKEN)
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 3. Serve Files
# Mount the frontend folder so FastAPI can find style.css and script.js
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
async def read_index():
    index_path = FRONTEND_DIR / "index.html"
    return FileResponse(index_path)

VALID_SHOPS = {"Meals", "Snacks", "Beverages"}
CANTEEN_OPEN_HOUR = 8
CANTEEN_CLOSE_HOUR = 17
CLOSED_DAYS = [6]


@app.post("/api/whatsapp")
async def whatsapp_webhook(From: str = Form(...), Body: str = Form(...)):
    sender_phone = From  # e.g., "whatsapp:+919876543210"
    incoming_msg = Body.strip().lower()

    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)

        # Check if we know this phone number
        c.execute("SELECT roll_no FROM student_phones WHERE phone_number = %s", (sender_phone,))
        user = c.fetchone()

        resp = MessagingResponse()
        msg = resp.message()

        # Registration Flow
        if not user:
            if incoming_msg.startswith("register"):
                parts = incoming_msg.split()
                if len(parts) == 2:
                    roll_no = parts[1].upper()
                    c.execute(
                        "INSERT INTO student_phones (phone_number, roll_no) VALUES (%s, %s)",
                        (sender_phone, roll_no),
                    )
                    conn.commit()
                    msg.body(f"Successfully linked your WhatsApp to {roll_no}! Type 'menu' to see options.")
                else:
                    msg.body("Please reply with 'register [YourRollNo]'. Example: register 24B81A67R1")
            else:
                msg.body("Welcome to Smart-Dine! We do not recognize this number. Please reply with 'register [YourRollNo]' to link your account.")

            return Response(content=str(resp), media_type="application/xml")

        roll_no = user["roll_no"] if isinstance(user, dict) else user[0]

        if incoming_msg == "menu":
            msg.body(
                "🍔 *Smart-Dine Menu*\n"
                "1. 'join meals'\n"
                "2. 'join snacks'\n"
                "3. 'join beverages'\n"
                "4. 'status' (Check your active orders)\n"
                "5. 'seats' - View live seat availability\n"
                "6. 'traffic' - View campus crowd status\n"
                "7. 'predict [shop] [DD-MM] [HH:MM] [AM/PM]' - AI predictions\n"
                "8. 'stats [shop]' - View status (shows if closed)"
            )
        elif incoming_msg == "status":
            c.execute("SELECT shop, expected_wait_seconds FROM active_queue WHERE roll_no = %s", (roll_no,))
            active_orders = c.fetchall()

            if not active_orders:
                msg.body("You have no active orders in the kitchen. 🍽️")
            else:
                status_text = "📊 *Your Active Orders:*\n"
                for order in active_orders:
                    mins = max(1, int(order['expected_wait_seconds'] / 60))
                    status_text += f"- *{order['shop']}*: Approx {mins} mins wait\n"
                msg.body(status_text)
        elif incoming_msg == "seats":
            # Mirror /api/status seat logic
            purge_ghost_orders(c, conn)
            c.execute("SELECT COUNT(*) as count FROM history_log WHERE occupies_seat = TRUE AND seat_release_time > NOW()")
            occupied_seats = c.fetchone()
            occupied_count = occupied_seats[0] if isinstance(occupied_seats, tuple) else occupied_seats.get("count", 0)
            available_seats = max(0, 120 - occupied_count)
            msg.body(f"🪑 Live seat availability: *{available_seats} seats* currently free.")
        elif incoming_msg == "traffic":
            # Mirror /api/status traffic banding (High/Medium/Low)
            purge_ghost_orders(c, conn)
            c.execute("SELECT COUNT(*) as count FROM active_queue")
            queue_res = c.fetchone()
            queue = int(queue_res["count"] if isinstance(queue_res, dict) else queue_res[0])
            traffic = "High" if queue >= 15 else "Medium" if queue >= 7 else "Low"
            msg.body(f"🚦 Campus traffic status: *{traffic}* (active queue: {queue}).")
        elif incoming_msg.startswith("stats"):
            parts = incoming_msg.split()
            if len(parts) != 2:
                msg.body("📊 Please specify a section. Example: 'stats meals' or 'stats snacks'.")
            elif parts[1] not in ["meals", "snacks", "beverages"]:
                msg.body("⚠️ Invalid section. Use: meals, snacks, or beverages.")
            else:
                shop = parts[1].capitalize()

                now_ist = datetime.now(IST)
                if now_ist.hour < CANTEEN_OPEN_HOUR or now_ist.hour > CANTEEN_CLOSE_HOUR or (now_ist.hour == CANTEEN_CLOSE_HOUR and now_ist.minute > 0):
                    msg.body("🏮 The canteen is currently CLOSED for the day. See you tomorrow at 8 AM!")
                    return Response(content=str(resp), media_type="application/xml")

                c.execute("SELECT is_active FROM shop_settings WHERE shop = %s", (shop,))
                active_row = c.fetchone()
                is_active = active_row["is_active"] if isinstance(active_row, dict) else active_row[0]
                if not is_active:
                    msg.body(f"❌ The {shop} station is currently CLOSED. Please check back later!")
                    return Response(content=str(resp), media_type="application/xml")

                c.execute("SELECT COUNT(*) as count FROM active_queue WHERE shop = %s", (shop,))
                queue_res = c.fetchone()
                queue_count = int(queue_res["count"] if isinstance(queue_res, dict) else queue_res[0])

                c.execute("SELECT AVG(service_duration) as avg_speed FROM (SELECT service_duration FROM history_log WHERE shop = %s AND service_duration > 0 ORDER BY id DESC LIMIT 10) AS sub", (shop,))
                avg_res = c.fetchone()
                avg_val = avg_res["avg_speed"] if isinstance(avg_res, dict) else avg_res[0]
                avg_speed = float(avg_val) if avg_val else 60.0

                est_wait_mins = max(1, round(((queue_count + 1) * avg_speed) / 60))

                if avg_speed < 60:
                    speed_status = "Fast"
                elif avg_speed < 120:
                    speed_status = "Normal"
                else:
                    speed_status = "Busy"

                msg.body(
                    f"📍 *Live {shop} Status*\n"
                    f"👥 People in line: {queue_count}\n"
                    f"⏳ Estimated wait: {est_wait_mins} minutes\n"
                    f"🚀 Kitchen Speed: {speed_status}"
                )
        elif incoming_msg.startswith("predict"):
            parts = incoming_msg.split()
            if len(parts) != 5:
                msg.body("⚠️ Use: 'predict meals 28-03 01:30 PM'.")
            elif parts[1] not in ["meals", "snacks", "beverages"]:
                msg.body("⚠️ Use: 'predict meals 28-03 01:30 PM'.")
            else:
                shop = parts[1].capitalize()
                date_text = parts[2]
                time_text = parts[3]
                am_pm = parts[4]
                try:
                    full_dt = datetime.strptime(f"{date_text} {time_text} {am_pm.upper()}", "%d-%m %I:%M %p")
                    target_dt = full_dt.replace(year=2026)

                    if target_dt.weekday() in CLOSED_DAYS:
                        msg.body("🏮 The canteen is closed on Sundays. No predictions available.")
                        return Response(content=str(resp), media_type="application/xml")

                    if target_dt.hour < CANTEEN_OPEN_HOUR or target_dt.hour > CANTEEN_CLOSE_HOUR or (target_dt.hour == CANTEEN_CLOSE_HOUR and target_dt.minute > 0):
                        msg.body("🌙 The canteen is closed at that time. Operating hours are 8 AM to 5 PM.")
                        return Response(content=str(resp), media_type="application/xml")

                    prediction = predict_future_wait(shop, target_dt.weekday(), target_dt.hour, target_dt.minute)
                    predicted_wait = prediction.get("predicted_wait_mins", 0)
                    predicted_queue = prediction.get("predicted_queue", 0)
                    msg.body(
                        f"🔮 AI Prediction for *{shop}* on *{date_text}* at *{time_text} {am_pm.upper()}*:\n"
                        f"⏱️ Expected wait: *{predicted_wait} mins*\n"
                        f"👥 Expected queue length: *{predicted_queue}*"
                    )
                except ValueError:
                    msg.body("⚠️ Use: 'predict meals 28-03 01:30 PM'.")
        elif incoming_msg.startswith("join"):
            parts = incoming_msg.split()
            if len(parts) != 2 or parts[1] not in ["meals", "snacks", "beverages"]:
                msg.body("⚠️ Invalid format. Try: 'join meals', 'join snacks', or 'join beverages'")
            else:
                shop = parts[1].capitalize()

                result = process_queue_join(roll_no, shop, c, conn)
                if not result["success"]:
                    if "paused" in result["message"].lower():
                        msg.body(f"❌ {result['message']} Please try again later.")
                    elif "already in" in result["message"].lower():
                        msg.body(f"⚠️ {result['message']} Type 'status' to check your wait time.")
                    else:
                        msg.body(f"⚠️ {result['message']}")
                else:
                    mins = max(1, int(result["expected_wait"] / 60))
                    msg.body(f"✅ Success! You joined the *{shop}* queue.\n⏱️ Estimated wait: {mins} minutes.\nType 'status' anytime to check.")
        else:
            msg.body("I didn't understand that. 🤔 Type 'menu' to see what I can do!")

        return Response(content=str(resp), media_type="application/xml")
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to process WhatsApp webhook")
    finally:
        release_db_connection(conn)

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

def process_queue_join(roll_no, shop, cursor, conn):
    # Check if station is paused
    cursor.execute("SELECT is_active FROM shop_settings WHERE shop = %s", (shop,))
    is_active_row = cursor.fetchone()
    if is_active_row is None:
        return {"success": False, "message": f"The {shop} station is currently paused.", "expected_wait": None}
    is_active = is_active_row["is_active"] if isinstance(is_active_row, dict) else is_active_row[0]
    if not is_active:
        return {"success": False, "message": f"The {shop} station is currently paused.", "expected_wait": None}

    # Check if already in queue
    cursor.execute("SELECT COUNT(*) as count FROM active_queue WHERE roll_no = %s AND shop = %s", (roll_no, shop))
    is_in_queue = cursor.fetchone()
    existing_count = is_in_queue["count"] if isinstance(is_in_queue, dict) else is_in_queue[0]
    if existing_count > 0:
        return {"success": False, "message": f"You are already in the {shop} queue.", "expected_wait": None}

    # Calculate SLA using current queue depth and recent service speed
    cursor.execute("SELECT COUNT(*) as count FROM active_queue WHERE shop = %s", (shop,))
    queue_res = cursor.fetchone()
    queue_len = int(queue_res["count"] if isinstance(queue_res, dict) else queue_res[0])

    cursor.execute("SELECT AVG(service_duration) as avg_speed FROM (SELECT service_duration FROM history_log WHERE shop = %s AND service_duration > 0 ORDER BY id DESC LIMIT 10) AS sub", (shop,))
    avg_res = cursor.fetchone()
    avg_val = avg_res["avg_speed"] if isinstance(avg_res, dict) else avg_res[0]
    avg_speed = float(avg_val) if avg_val else 60.0
    expected_wait = (queue_len + 1) * avg_speed

    # Insert active order
    time_in = datetime.now(timezone.utc)
    cursor.execute(
        "INSERT INTO active_queue (roll_no, shop, time_in, expected_wait_seconds) VALUES (%s, %s, %s, %s)",
        (roll_no, shop, time_in, expected_wait),
    )
    conn.commit()

    return {
        "success": True,
        "message": f"Success! You joined the {shop} queue.",
        "expected_wait": expected_wait,
    }

def purge_ghost_orders(cursor, conn):
    """Delete any active order older than 2 hours (120 minutes)."""
    ghost_time_limit = datetime.now(timezone.utc) - timedelta(hours=2)
    cursor.execute("DELETE FROM active_queue WHERE time_in < %s", (ghost_time_limit,))
    conn.commit()

@app.get("/api/status")
def get_status(shop: str):
    validate_shop(shop)
    conn = None
    try:
        conn = get_db_connection()
        c = conn.cursor()

        # Clean up ghost orders before calculating queue status
        purge_ghost_orders(c, conn)

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

        result = process_queue_join(clean_roll_no, req.shop, c, conn)
        if not result["success"]:
            return JSONResponse(status_code=400, content={"error": result["message"]})

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

        # Check for existing active order
        c.execute("SELECT COUNT(*) as count FROM active_queue WHERE roll_no = %s AND shop = %s", (clean_roll_no, req.shop))
        is_in_queue = c.fetchone()
        count = is_in_queue['count'] if isinstance(is_in_queue, dict) else is_in_queue[0]

        if count > 0:
            return JSONResponse(status_code=400, content={"error": f"You are already in the {req.shop} queue."})

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
        
        # Clean up ghost orders before fetching KDS list
        purge_ghost_orders(c, conn)
        
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
    print(f"DEBUG: Attempting to serve order {order_id}")
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
            print(f"DEBUG: Found Roll No: '{roll_no}'")

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

            # Best-effort WhatsApp notification: failures must not block serving flow.
            c.execute("SELECT phone_number FROM student_phones WHERE roll_no = %s", (roll_no,))
            phone_record = c.fetchone()
            print(f"DEBUG: Found Phone Data: {phone_record}")
            if phone_record:
                student_phone = phone_record[0]
                try:
                    from_number = TWILIO_NUMBER if str(TWILIO_NUMBER).startswith("whatsapp:") else f"whatsapp:{TWILIO_NUMBER}"
                    message = client.messages.create(
                        body=f"🎉 Your {shop} order is ready! Please collect it from Counter 1. Enjoy your meal! 🍔",
                        from_=from_number,
                        to=student_phone,
                    )
                    print(f"DEBUG: Twilio Message SID: {message.sid}")
                except Exception as notify_err:
                    print(f"WhatsApp notification failed for {roll_no}: {notify_err}")
            else:
                print(f"DEBUG: No phone number registered for {roll_no}. Skipping WhatsApp.")

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