import sqlite3
import random

def initialize_database():
    conn = sqlite3.connect('smartdine.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS active_queue 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, shop TEXT, time_in REAL)''')
                  
    c.execute('''CREATE TABLE IF NOT EXISTS history_log 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, shop TEXT, day_of_week INTEGER, hour_of_day INTEGER, queue_length INTEGER, service_duration REAL)''')

    c.execute("SELECT COUNT(*) FROM history_log")
    if c.fetchone()[0] == 0:
        print("Generating realistic historical training data...")
        shops = ["Meals", "Snacks", "Beverages"]
        for _ in range(800):
            shop = random.choice(shops)
            day = random.randint(0, 4) # Monday to Friday
            hour = random.randint(8, 17) # 8 AM to 5 PM
            
            # TEACH THE AI: Massive spike during peak lunch hours
            if hour in [12, 13]: # 12 PM to 1:59 PM
                queue_len = random.randint(40, 80)
            elif hour in [11, 14]: # Shoulder hours
                queue_len = random.randint(15, 30)
            else: # Morning and late afternoon (8 AM, etc.)
                queue_len = random.randint(0, 8)
                
            base_time = 45 if shop == "Meals" else 20
            # If the queue is huge, the kitchen slows down due to stress
            service_duration = base_time + (queue_len * random.uniform(0.8, 1.2))
            
            c.execute('''INSERT INTO history_log (uid, shop, day_of_week, hour_of_day, queue_length, service_duration) VALUES (?, ?, ?, ?, ?, ?)''', 
                      (f"UID_{random.randint(1000,9999)}", shop, day, hour, queue_len, service_duration))
        conn.commit()
        print("Database initialized with realistic peak-hour data.")
    conn.close()

if __name__ == "__main__":
    initialize_database()