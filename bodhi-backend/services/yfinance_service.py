import yfinance as yf
import pandas as pd
import asyncio
from datetime import datetime, timedelta
import logging
import math

from cachetools import TTLCache

logger = logging.getLogger(__name__)

# Live quotes are cached briefly per warm container: a portfolio with 10 holdings
# no longer makes 10 fresh Yahoo round-trips on every screen refresh.
_PRICE_CACHE: TTLCache = TTLCache(maxsize=512, ttl=15)

def _ns(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if "." not in symbol:
        return symbol + ".NS"
    return symbol

# ── Sync Background Workers (Your Original Logic) ──────────────────────────

def _get_historical_sync(symbol: str, start: str, end: str, interval: str = "1d") -> pd.DataFrame:
    ticker_sym = _ns(symbol)
    
    # 1. Convert string dates to actual datetime objects
    # This prevents Yahoo from getting confused by timezone strings
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d")
        end_dt = datetime.strptime(end, "%Y-%m-%d")
        # Add 1 day to end_dt because yfinance end dates are EXCLUSIVE
        end_dt = end_dt + timedelta(days=1)
    except Exception:
        # Fallback just in case the string is formatted weirdly
        start_dt, end_dt = start, end 
        
    # 2. Try the primary Ticker API
    ticker = yf.Ticker(ticker_sym)
    df = ticker.history(start=start_dt, end=end_dt, interval=interval)
    
    # 3. If the primary API hits the crumb/cookie block, fallback to download API
    if df.empty:
        logger.warning(f"Ticker.history blocked for {ticker_sym}. Falling back to yf.download...")
        df = yf.download(ticker_sym, start=start_dt, end=end_dt, interval=interval, progress=False)
        
    # 4. If it's STILL empty, Yahoo is completely rejecting the request
    if df.empty:
        raise ValueError(f"No historical data for {symbol} between {start} and {end}")
        
    # 5. Clean up weird formatting yfinance sometimes applies
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    # Ensure columns are Capitalized (yfinance sometimes lowercases them randomly)
    df.columns = [str(c).capitalize() for c in df.columns]
        
    # 6. Clean the index for our frontend JSON
    df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
        
    return df[["Open", "High", "Low", "Close", "Volume"]]

def _get_live_price_sync(symbol: str) -> dict:
    ticker = yf.Ticker(_ns(symbol))
    try:
        fi = ticker.fast_info
        price     = float(fi.last_price)
        if not math.isfinite(price) or price <= 0:
            raise ValueError(f"No valid price for {symbol}")
        prev      = float(fi.previous_close) if fi.previous_close else price
        change    = round(price - prev, 2)
        change_pct = round((change / prev) * 100, 2) if prev else 0.0
        return {
            "symbol":     symbol.upper(),
            "price":      round(price, 2),
            "change":     change,
            "change_pct": change_pct,
            "currency":   "INR",
            "timestamp":  datetime.utcnow().isoformat(),
            "source":     "yfinance",
        }
    except Exception as e:
        logger.error(f"get_live_price failed for {symbol}: {e}")
        raise

def _search_symbols_sync(query: str, max_results: int = 10) -> list[dict]:
    try:
        results = yf.Search(query, max_results=max_results)
        hits = []
        for q in results.quotes:
            exchange = q.get("exchange", "")
            if exchange in ("NSI", "BSE", "NSE", "BOM"):
                hits.append({
                    "symbol":   q.get("symbol", "").replace(".NS", "").replace(".BO", ""),
                    "name":     q.get("longname") or q.get("shortname", ""),
                    "exchange": "NSE" if exchange in ("NSI", "NSE") else "BSE",
                    "type":     q.get("quoteType", "EQUITY"),
                })
        return hits[:max_results]
    except Exception as e:
        logger.warning(f"Symbol search failed: {e}")
        return _nifty50_fallback(query)

# ── Nifty 50 fallback list ──────────────────────────────────────────────────
_NIFTY50 = [
    ("RELIANCE", "Reliance Industries"), ("TCS", "Tata Consultancy Services"), 
    ("HDFCBANK", "HDFC Bank"), ("INFY", "Infosys"), ("ICICIBANK", "ICICI Bank"),
    ("HINDUNILVR", "Hindustan Unilever"), ("SBIN", "State Bank of India"), 
    ("BAJFINANCE", "Bajaj Finance"), ("BHARTIARTL", "Bharti Airtel"), 
    ("KOTAKBANK", "Kotak Mahindra Bank"), ("AXISBANK", "Axis Bank"), 
    ("ASIANPAINT", "Asian Paints"), ("MARUTI", "Maruti Suzuki"), 
    ("TATAMOTORS", "Tata Motors"), ("WIPRO", "Wipro"), 
    ("ULTRACEMCO", "UltraTech Cement"), ("NESTLEIND", "Nestle India"), 
    ("TITAN", "Titan Company"), ("HCLTECH", "HCL Technologies"), 
    ("ADANIENT", "Adani Enterprises"), ("ONGC", "Oil & Natural Gas Corporation"), 
    ("NTPC", "NTPC"), ("POWERGRID", "Power Grid Corp"), ("LTIM", "LTIMindtree"), 
    ("SUNPHARMA", "Sun Pharma"), ("DRREDDY", "Dr. Reddy's Laboratories"), 
    ("CIPLA", "Cipla"), ("COALINDIA", "Coal India"), ("TECHM", "Tech Mahindra"), 
    ("INDUSINDBK", "IndusInd Bank")
]

def _nifty50_fallback(query: str) -> list[dict]:
    q = query.upper()
    return [{"symbol": sym, "name": name, "exchange": "NSE", "type": "EQUITY"} 
            for sym, name in _NIFTY50 if q in sym or q in name.upper()][:10]

# ── Async Exposed Functions for FastAPI Routers ────────────────────────────

async def get_live_price(symbol: str) -> dict:
    key = _ns(symbol)
    cached = _PRICE_CACHE.get(key)
    if cached is not None:
        return cached
    data = await asyncio.to_thread(_get_live_price_sync, symbol)
    _PRICE_CACHE[key] = data
    return data

async def get_historical(symbol: str, start: str, end: str, interval: str = "1d") -> pd.DataFrame:
    return await asyncio.to_thread(_get_historical_sync, symbol, start, end, interval)

async def search_symbols(query: str, max_results: int = 10) -> list[dict]:
    return await asyncio.to_thread(_search_symbols_sync, query, max_results)

def _get_stock_info_sync(symbol: str) -> dict:
    ticker = yf.Ticker(_ns(symbol))
    info = ticker.info
    return {
        "symbol":      symbol.upper(),
        "name":        info.get("longName") or info.get("shortName", symbol),
        "sector":      info.get("sector", "—"),
        "industry":    info.get("industry", "—"),
        "exchange":    info.get("exchange", "NSE"),
        "market_cap":  info.get("marketCap"),
        "currency":    info.get("currency", "INR"),
        "logo_url":    info.get("logo_url"),
    }

async def get_stock_info(symbol: str) -> dict:
    return await asyncio.to_thread(_get_stock_info_sync, symbol)