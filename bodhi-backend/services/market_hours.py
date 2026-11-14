from datetime import datetime, time
import pytz

IST = pytz.timezone("Asia/Kolkata")

# Updated NSE holidays to include 2026 dates
NSE_HOLIDAYS = {
    "2024-01-22", "2024-03-25", "2024-03-29", "2024-04-11",
    "2024-04-14", "2024-04-17", "2024-04-21", "2024-05-23",
    "2024-06-17", "2024-07-17", "2024-08-15", "2024-10-02",
    "2024-11-01", "2024-11-15", "2024-11-20", "2024-12-25",
    "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10",
    "2025-04-14", "2025-04-18", "2025-05-01", "2025-08-15",
    "2025-08-27", "2025-10-02", "2025-10-21", "2025-10-22", 
    "2025-11-05", "2025-12-25",
    # Added 2026 Dates for current accuracy
    "2026-01-26", "2026-03-03", "2026-03-24", "2026-04-03",
    "2026-04-14", "2026-05-01", "2026-08-15", "2026-10-02",
    "2026-11-08", "2026-12-25"
}

MARKET_OPEN  = time(9, 15)
MARKET_CLOSE = time(15, 30)
PRE_OPEN     = time(9, 0)
POST_CLOSE   = time(16, 0)

def now_ist() -> datetime:
    return datetime.now(IST)

def is_market_open() -> bool:
    now = now_ist()
    date_str = now.strftime("%Y-%m-%d")
    if date_str in NSE_HOLIDAYS:
        return False
    if now.weekday() >= 5:          
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE

def market_status() -> dict:
    now = now_ist()
    date_str = now.strftime("%Y-%m-%d")
    t = now.time()

    if date_str in NSE_HOLIDAYS:
        return {"open": False, "status": "holiday", "message": "NSE is closed today (public holiday).", "next_open": _next_open_str(now)}
    if now.weekday() >= 5:
        return {"open": False, "status": "weekend", "message": "NSE is closed on weekends.", "next_open": _next_open_str(now)}
    if t < PRE_OPEN:
        return {"open": False, "status": "pre_market", "message": f"NSE opens at 9:15 AM IST. Current time: {now.strftime('%I:%M %p')} IST.", "next_open": today_open_str(now)}
    if t < MARKET_OPEN:
        return {"open": False, "status": "pre_open_session", "message": "NSE pre-open session (9:00–9:15 AM). Market opens shortly.", "next_open": today_open_str(now)}
    if t <= MARKET_CLOSE:
        return {"open": True, "status": "open", "message": "NSE is LIVE. Closes at 3:30 PM IST.", "closes_at": "3:30 PM IST"}
    if t <= POST_CLOSE:
        return {"open": False, "status": "post_market", "message": "NSE closed at 3:30 PM IST. Post-market session until 4:00 PM.", "next_open": _next_open_str(now)}
    
    return {"open": False, "status": "closed", "message": "NSE is closed. Opens at 9:15 AM IST tomorrow.", "next_open": _next_open_str(now)}

def today_open_str(now: datetime) -> str:
    return now.strftime("%d %b %Y") + " at 9:15 AM IST"

def _next_open_str(now: datetime) -> str:
    from datetime import timedelta
    candidate = now + timedelta(days=1)
    for _ in range(10):
        ds = candidate.strftime("%Y-%m-%d")
        if candidate.weekday() < 5 and ds not in NSE_HOLIDAYS:
            return candidate.strftime("%d %b %Y") + " at 9:15 AM IST"
        candidate += timedelta(days=1)
    return "next trading day at 9:15 AM IST"