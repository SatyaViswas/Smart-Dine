import psycopg2
import random
import os
from dotenv import load_dotenv

# Load the secrets from the .env file into Python's memory
load_dotenv() 

# Securely fetch the URL
DB_URL = os.getenv("DATABASE_URL")

# --- (The rest of your code remains exactly the same!) ---
def initialize_cloud_database():
    # Connect to Neon
    conn = psycopg2.connect(DB_URL)
    c = conn.cursor()
    
    # 1. Create Tables (Notice 'SERIAL' instead of 'AUTOINCREMENT' for Postgres)
    c.execute('''CREATE TABLE IF NOT EXISTS active_queue 
                 (id SERIAL PRIMARY KEY, uid TEXT, shop TEXT, time_in REAL)''')
                  
    c.execute('''CREATE TABLE IF NOT EXISTS history_log 
                 (id SERIAL PRIMARY KEY, uid TEXT, shop TEXT, day_of_week INTEGER, hour_of_day INTEGER, queue_length INTEGER, service_duration REAL)''')
    # Add this right below where you create the active_queue and history_log tables

    # 1. Create the Students Table
    c.execute('''CREATE TABLE IF NOT EXISTS students 
                 (roll_no TEXT PRIMARY KEY)''')

    # Ensure schema matches current auth model if the table was created earlier with extra columns
    c.execute('''ALTER TABLE students DROP COLUMN IF EXISTS name''')

    # 2. Create the Staff Table
    c.execute('''CREATE TABLE IF NOT EXISTS staff
                 (email TEXT PRIMARY KEY, password_hash TEXT)''')

    # 2. Inject your specific test user so you can log in
    c.execute('''INSERT INTO students (roll_no) 
                 VALUES (%s) ON CONFLICT (roll_no) DO NOTHING''', 
              ('24B81A67R1',))
    
    # 2. Check if data already exists
    c.execute("SELECT COUNT(*) FROM history_log")
    if c.fetchone()[0] == 0:
        print("Injecting 800 rows of realistic training data into Neon Cloud...")
        shops = ["Meals", "Snacks", "Beverages"]
        for i in range(800):
            shop = random.choice(shops)
            day = random.randint(0, 5)  # Monday(0) to Saturday(5), Sunday excluded
            hour = random.randint(8, 17)
            
            # Simulated traffic spikes at 12 PM and 1 PM
            if hour in [12, 13]: queue_len = random.randint(40, 80)
            elif hour in [11, 14]: queue_len = random.randint(15, 30)
            else: queue_len = random.randint(0, 8)

            # Add strong day-of-week signal for the ML model.
            # Tue/Wed are heavier, Friday is lighter, Sunday is excluded above.
            day_multiplier = 1.0
            if day in [1, 2]:
                day_multiplier = 1.5
            elif day == 4:
                day_multiplier = 0.5
            queue_len = max(0, int(round(queue_len * day_multiplier)))
                
            base_time = 45 if shop == "Meals" else 20
            service_duration = base_time + (queue_len * random.uniform(0.8, 1.2))
            
            # Postgres uses %s for placeholders instead of ?
            c.execute('''INSERT INTO history_log (uid, shop, day_of_week, hour_of_day, queue_length, service_duration) VALUES (%s, %s, %s, %s, %s, %s)''', 
                      (f"UID_{random.randint(1000,9999)}", shop, day, hour, queue_len, service_duration))
            
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