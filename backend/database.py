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
                 (roll_no TEXT PRIMARY KEY, name TEXT)''')

    # 2. Inject your specific test user so you can log in
    c.execute('''INSERT INTO students (roll_no, name) 
                 VALUES (%s, %s) ON CONFLICT (roll_no) DO NOTHING''', 
              ('24B81A67R1', 'M.V.S.VISWAS'))
    
    # 2. Check if data already exists
    c.execute("SELECT COUNT(*) FROM history_log")
    if c.fetchone()[0] == 0:
        print("Injecting 800 rows of realistic training data into Neon Cloud...")
        shops = ["Meals", "Snacks", "Beverages"]
        for i in range(800):
            shop = random.choice(shops)
            day = random.randint(0, 4)
            hour = random.randint(8, 17)
            
            # Simulated traffic spikes at 12 PM and 1 PM
            if hour in [12, 13]: queue_len = random.randint(40, 80)
            elif hour in [11, 14]: queue_len = random.randint(15, 30)
            else: queue_len = random.randint(0, 8)
                
            base_time = 45 if shop == "Meals" else 20
            service_duration = base_time + (queue_len * random.uniform(0.8, 1.2))
            
            # Postgres uses %s for placeholders instead of ?
            c.execute('''INSERT INTO history_log (uid, shop, day_of_week, hour_of_day, queue_length, service_duration) VALUES (%s, %s, %s, %s, %s, %s)''', 
                      (f"UID_{random.randint(1000,9999)}", shop, day, hour, queue_len, service_duration))
            
            if i % 100 == 0 and i > 0:
                print(f"Pushed {i} rows...")
                
        conn.commit()
        print("Neon Cloud Database successfully initialized!")
    else:
        print("Data already exists in the cloud.")
        
    conn.close()

if __name__ == "__main__":
    initialize_cloud_database()