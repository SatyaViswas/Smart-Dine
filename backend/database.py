import psycopg2
import random
import math
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# Load the secrets from the .env file into Python's memory
load_dotenv() 

# Securely fetch the URL
DB_URL = os.getenv("DATABASE_URL")
IST = ZoneInfo("Asia/Kolkata")

# --- (The rest of your code remains exactly the same!) ---
def initialize_cloud_database():
    # Connect to Neon
    conn = psycopg2.connect(DB_URL)
    c = conn.cursor()
    
    # 1. Create Tables (Notice 'SERIAL' instead of 'AUTOINCREMENT' for Postgres)
    c.execute('''CREATE TABLE IF NOT EXISTS active_queue 
                 (id SERIAL PRIMARY KEY, roll_no TEXT, shop TEXT, time_in TIMESTAMP, expected_wait_seconds REAL)''')
    c.execute('''ALTER TABLE active_queue ADD COLUMN IF NOT EXISTS roll_no TEXT''')
    c.execute('''ALTER TABLE active_queue ADD COLUMN IF NOT EXISTS expected_wait_seconds REAL''')
    c.execute('''
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'active_queue' AND column_name = 'uid'
    ''')
    if c.fetchone():
        c.execute('''UPDATE active_queue SET roll_no = uid WHERE roll_no IS NULL AND uid IS NOT NULL''')

    # Migrate legacy epoch-based time_in values to TIMESTAMP.
    c.execute('''
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'active_queue' AND column_name = 'time_in'
    ''')
    time_in_type = c.fetchone()
    if time_in_type and time_in_type[0] in ("real", "double precision", "numeric"):
        c.execute('''
            ALTER TABLE active_queue
            ALTER COLUMN time_in TYPE TIMESTAMP
            USING to_timestamp(time_in)
        ''')
                  
    c.execute('''CREATE TABLE IF NOT EXISTS history_log 
                 (id SERIAL PRIMARY KEY, roll_no TEXT, shop TEXT, day_of_week INTEGER, hour_of_day INTEGER, minute INTEGER, queue_length INTEGER, service_duration REAL, occupies_seat BOOLEAN, seat_release_time TIMESTAMP, time_served TIMESTAMP)''')

    # Ensure existing deployments also have minute-level granularity support
    c.execute('''ALTER TABLE history_log ADD COLUMN IF NOT EXISTS minute INTEGER''')
    c.execute('''ALTER TABLE history_log ADD COLUMN IF NOT EXISTS roll_no TEXT''')
    c.execute('''ALTER TABLE history_log ADD COLUMN IF NOT EXISTS occupies_seat BOOLEAN DEFAULT FALSE''')
    c.execute('''ALTER TABLE history_log ADD COLUMN IF NOT EXISTS seat_release_time TIMESTAMP DEFAULT '2000-01-01 00:00:00' ''')
    c.execute('''ALTER TABLE history_log ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT NOW()''')
    c.execute('''ALTER TABLE history_log ADD COLUMN IF NOT EXISTS time_served TIMESTAMP''')
    #c.execute('''UPDATE history_log SET roll_no = uid WHERE roll_no IS NULL AND uid IS NOT NULL''')
    c.execute('''UPDATE history_log SET occupies_seat = FALSE WHERE occupies_seat IS NULL''')
    c.execute('''UPDATE history_log SET seat_release_time = '2000-01-01 00:00:00' WHERE seat_release_time IS NULL''')
    c.execute('''UPDATE history_log SET timestamp = NOW() WHERE timestamp IS NULL''')
    c.execute('''UPDATE history_log SET time_served = COALESCE(time_served, timestamp, NOW()) WHERE time_served IS NULL''')
    # Add this right below where you create the active_queue and history_log tables

    # 1. Create the Students Table
    c.execute('''CREATE TABLE IF NOT EXISTS students 
                 (roll_no TEXT PRIMARY KEY)''')
    c.execute('''CREATE TABLE IF NOT EXISTS student_phones (phone_number TEXT PRIMARY KEY, roll_no TEXT)''')

    # Ensure schema matches current auth model if the table was created earlier with extra columns
    c.execute('''ALTER TABLE students DROP COLUMN IF EXISTS name''')

    # 2. Create the Staff Table
    c.execute('''CREATE TABLE IF NOT EXISTS staff
                 (email TEXT PRIMARY KEY, password_hash TEXT, shop TEXT)''')

    # Ensure existing deployments also have the shop column
    c.execute('''ALTER TABLE staff ADD COLUMN IF NOT EXISTS shop TEXT''')

    c.execute('''CREATE TABLE IF NOT EXISTS shop_settings (shop TEXT PRIMARY KEY, is_active BOOLEAN)''')

    shops = ["Meals", "Snacks", "Beverages"]
    for s in shops:
        c.execute("INSERT INTO shop_settings (shop, is_active) VALUES (%s, TRUE) ON CONFLICT (shop) DO NOTHING", (s,))

    # 2. Inject your specific test user so you can log in
    c.execute('''INSERT INTO students (roll_no) 
                 VALUES (%s) ON CONFLICT (roll_no) DO NOTHING''', 
              ('24B81A67R1',))
    
    # Check if data already exists
    c.execute("SELECT COUNT(*) FROM history_log")
    if c.fetchone()[0] == 0:
        print("Injecting 2500 rows of highly realistic training data...")
        shops = ["Meals", "Snacks", "Beverages"]

        # Monday=0, Tuesday=1, Wed=2, Thu=3, Fri=4, Sat=5
        day_multipliers = {0: 1.0, 1: 1.15, 2: 1.25, 3: 1.0, 4: 0.75, 5: 0.3}

        for i in range(2500):
            shop = random.choice(shops)
            day = random.randint(0, 5)
            hour = random.randint(8, 17)
            minute = random.randint(0, 59)
            time_float = hour + (minute / 60.0)

            if shop == "Meals":
                base_queue = random.randint(0, 4)  # Allows for completely dead periods (0-2 people)
                # One massive, wide curve centered at 1:00 PM (13.0) covering 12:10 to 14:00
                lunch_rush = 36 * math.exp(-((time_float - 13.0) ** 2) / 1.5)
                queue_len = base_queue + lunch_rush
                service_duration = random.uniform(35.0, 42.0)

            elif shop == "Snacks":
                base_queue = random.randint(1, 5)  # Snacks have slightly more baseline traffic
                peak_morn = 12 * math.exp(-((time_float - 10.8) ** 2) / 0.5)
                peak_lunch = 12 * math.exp(-((time_float - 13.0) ** 2) / 1.5)
                peak_eve = 15 * math.exp(-((time_float - 16.0) ** 2) / 0.8)
                queue_len = base_queue + peak_morn + peak_lunch + peak_eve
                service_duration = random.uniform(15.0, 20.0)

            elif shop == "Beverages":
                base_queue = random.randint(0, 2)  # Beverages can easily be empty
                peak_lunch = 8 * math.exp(-((time_float - 13.0) ** 2) / 1.5)
                peak_eve = 6 * math.exp(-((time_float - 16.0) ** 2) / 1.0)
                queue_len = base_queue + peak_lunch + peak_eve
                service_duration = random.uniform(55.0, 65.0)

            # Apply the day multiplier and ensure queue doesn't drop below 0
            queue_len = max(0, int(round(queue_len * day_multipliers[day])))

            c.execute('''INSERT INTO history_log (roll_no, shop, day_of_week, hour_of_day, minute, queue_length, service_duration, occupies_seat, seat_release_time, time_served)
                         VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                      (f"24B81A{random.randint(1000,9999)}", shop, day, hour, minute, queue_len, service_duration, False, datetime(2000, 1, 1, 0, 0, 0), datetime.now(IST)))

            if i % 100 == 0 and i > 0:
                print(f"Pushed {i} rows...")

        print("Neon Cloud Database successfully initialized!")
    else:
        print("Data already exists in the cloud.")
        
    # MOVE THESE TWO LINES HERE, UNINDENTED:
    conn.commit() 
    conn.close()

if __name__ == "__main__":
    initialize_cloud_database()