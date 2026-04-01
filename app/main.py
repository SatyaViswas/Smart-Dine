"""Uvicorn entrypoint adapter for `uvicorn app.main:app`."""

from pathlib import Path
import sys

# Add backend directory to import path so existing backend/main.py can be reused.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402,F401
