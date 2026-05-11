# Smart‑Dine

Streamlined digital waiting room for campus canteens — reducing crowding with AI-driven wait forecasting and a live dashboard.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white) ![scikit-learn](https://img.shields.io/badge/scikit--learn-FF9900?logo=scikit-learn&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white) ![Render](https://img.shields.io/badge/Render-000000?logo=render&logoColor=white) ![Netlify](https://img.shields.io/badge/Netlify-00C7B7?logo=netlify&logoColor=white)

---

## Introduction

Canteen congestion during peak meal hours creates long queues, inefficient staff utilization, and cramped seating. Smart‑Dine transforms the canteen into a digital waiting room by combining live telemetry, an operator-facing Kitchen Display System (KDS), a student-facing dashboard, and AI wait‑time forecasting — reducing physical crowding and smoothing service throughput.

---

## Key Features

- **Live Dashboard (Bento‑Grid UI):** Responsive frontend showing per‑station queue depth, wait estimates, velocity, and seat availability.
- **AI Wait‑Time Forecasting (Random Forest):** Random Forest regressors predict per‑shop queue length and service time to estimate wait minutes and hourly trends.
- **WhatsApp Bot (Twilio):** Phone-first interaction channel for registration, joining queues, live status, and push notifications when orders are ready.
- **Kitchen Display System (KDS):** Staff interface to view active queue, serve orders, and log fulfillment (integrates with the ML data sink).
- **Live Seat Tracking:** Best‑effort occupancy tracking in the database to show live seat availability on the dashboard and via WhatsApp.

---

## Tech Stack

- **Backend & AI:** FastAPI, SQLAlchemy / psycopg2, scikit‑learn (RandomForest), pandas, joblib, matplotlib / seaborn for diagnostics
- **Frontend:** Vanilla JS, HTML/CSS (Bento‑Grid inspired dashboard), Netlify hosting for static UI
- **Cloud Infrastructure:** PostgreSQL (Neon/Render/Postgres), Render for API hosting, Twilio (WhatsApp) for messaging

---

## System Architecture

Smart‑Dine uses a 3‑tier decoupled architecture:

- **Client Tier (Frontend & WhatsApp):** Student dashboard (Netlify) and the WhatsApp bot provide read/write interactions and receive notifications.
- **Application Tier (FastAPI):** Business logic, queue SLA engine, KDS endpoints, authentication flows, and the AI prediction bridge (deployed to Render or similar).
- **Data Tier (Postgres):** Normalized tables for `active_queue`, `history_log`, `students`, `student_phones`, `menu_items`, and `shop_settings`. The same history log is the ML training sink.

Communication is RESTful between frontend and FastAPI; Twilio webhooks post incoming WhatsApp messages to the `/api/whatsapp` endpoint; ML code reads from `history_log` for training and forecasting.

---

## Installation & Setup

Prerequisites: Python 3.11+, Git, PostgreSQL (or a hosted DB), and accounts for Twilio and hosting (Render / Netlify).

1. Clone the repo and create a virtual environment

```bash
git clone <repo-url>
cd Smart-Dine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Environment variables (.env)

Create a `.env` in the `backend/` folder (and copy to root if you run scripts there). At minimum set:

- `DATABASE_URL` — Postgres connection string (postgresql://user:pass@host:port/dbname)
- `TWILIO_ACCOUNT_SID` — Twilio account SID
- `TWILIO_AUTH_TOKEN` — Twilio auth token
- `TWILIO_WHATSAPP_NUMBER` — Twilio WhatsApp-enabled number (e.g. whatsapp:+1234567890)

Optional / recommended:

- `RENDER_SERVICE_URL` — If using Render environment variables for production
- `SECRET_KEY` — App secret for future auth features

3. Initialize the database (example uses the helper)

```bash
python backend/database.py
# or import and run initialize_cloud_database() from a Python REPL
```

4. Run the API server locally for development

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend: Serve `frontend/index.html` locally or deploy the `frontend/` folder to Netlify; change `BASE_URL` in `frontend/script.js` to your API host.

---

## ML Implementation

- Model: RandomForestRegressor (scikit‑learn) is used for two targets: predicted `service_duration` and `queue_length` given `day_of_week`, `hour_of_day`, and `minute` features.
- Training & Prediction: `backend/ml_model.py` reads `history_log` from Postgres, trains separate RF models, and produces minute/quarter‑hour forecasts plus an hourly graph for UI display.
- Validation: The repository includes a `generate_residual_plot()` utility that saves residual plots. Residual analysis is essential to detect bias, heteroscedasticity, and to validate whether a Random Forest is adequate before moving to more complex models.

---

## Deployment Notes

- Host the FastAPI backend on Render (or any containerized host). Configure environment variables in the host's dashboard.
- Deploy the frontend to Netlify and point to the backend API. Ensure CORS entries in `backend/main.py` allow the Netlify domain.
- Configure Twilio WhatsApp webhook to POST to `/api/whatsapp` on your deployed API URL.

---

## Future Scope

- **Digital Payments:** Integrate UPI / card payments and include payment slots to speed fulfillment.
- **Deep Learning Upgrades:** Upgrade forecasting to LSTM / Temporal CNN models using per‑order telemetry and embeddings for better long‑horizon predictions.
- **IoT & Hardware Expansion:** Add QR‑based seat sensors, BLE beacons, or Raspberry Pi counters for robust seat occupancy and real‑time KDS triggers.
- **Operational Analytics:** Add staff dashboards, SLA alerts, and automated dynamic staffing recommendations.

