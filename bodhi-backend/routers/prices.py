from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import asyncio
from datetime import datetime, timedelta
import logging

from services.yfinance_service import get_live_price, get_historical
from services.market_hours import market_status

router = APIRouter()
logger = logging.getLogger(__name__)

class BatchPriceRequest(BaseModel):
    symbols: list[str]

@router.get("/market-status")
async def get_market_status():
    """Returns whether NSE is open right now, with a user-facing message."""
    # market_status is a synchronous CPU function, so no await needed
    return market_status()

@router.get("/live")
async def live_price(symbol: str = Query(..., examples=["RELIANCE.NS"])):
    """
    Fetch the latest price for a single NSE symbol.
    During market hours this is the live price.
    Outside market hours it returns the last closing price with a note.
    """
    try:
        price_data = await get_live_price(symbol)
    except Exception as e:
        logger.error(f"live_price failed for {symbol}: {e}")
        raise HTTPException(status_code=502, detail=f"Could not fetch price for {symbol}")

    status = market_status()
    price_data["market_status"] = status

    if not status["open"]:
        price_data["note"] = f"Last closing price. {status.get('message', '')}"

    return price_data

@router.post("/batch")
async def batch_prices(req: BatchPriceRequest):
    """Fetch latest prices for multiple symbols in parallel."""
    if len(req.symbols) > 20:
        raise HTTPException(status_code=422, detail="Max 20 symbols per batch request")

    results = {}
    errors  = {}
    
    # Internal async worker for parallel fetching
    async def fetch_one(sym):
        try:
            res = await get_live_price(sym)
            return sym.upper(), res, None
        except Exception as e:
            return sym.upper(), None, str(e)

    # Fire all requests at the exact same time
    tasks = [fetch_one(sym) for sym in req.symbols]
    responses = await asyncio.gather(*tasks)

    # Sort the responses into successes and errors
    for sym, res, err in responses:
        if err:
            errors[sym] = err
        else:
            results[sym] = res

    return {"prices": results, "errors": errors, "market_status": market_status()}

@router.get("/history")
async def price_history(
    symbol:   str = Query(..., example="RELIANCE.NS"),
    period:   str = Query("1y",  description="1d | 5d | 1mo | 3mo | 6mo | 1y | 2y | 5y | 10y"),
    interval: str = Query("1d",  description="1m | 5m | 15m | 1h | 1d | 1wk | 1mo"),
):
    """
    OHLCV candle data for a symbol.
    Used by the Time Warp chart and portfolio history chart.
    """
    period_map = {
        "1d": 1, "5d": 5, "1mo": 30, "3mo": 90,
        "6mo": 180, "1y": 365, "2y": 730, "5y": 1825, "10y": 3650,
    }
    days = period_map.get(period, 365)
    end  = datetime.utcnow().strftime("%Y-%m-%d")
    start = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

    try:
        df = await get_historical(symbol, start=start, end=end, interval=interval)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"price_history failed for {symbol}: {e}")
        raise HTTPException(status_code=502, detail="Data fetch failed.")

    if df is None or getattr(df, "empty", True):
        raise HTTPException(status_code=404, detail=f"No price history for {symbol}.")

    candles = []
    # Format the dataframe exactly how your mobile app expects it (skip rows with gaps/NaN)
    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    for ts, row in df.iterrows():
        vol = row.get("Volume")
        candles.append({
            "date":   ts.strftime("%Y-%m-%d") if interval == "1d" else ts.strftime("%Y-%m-%dT%H:%M"),
            "open":   round(float(row["Open"]),   2),
            "high":   round(float(row["High"]),   2),
            "low":    round(float(row["Low"]),    2),
            "close":  round(float(row["Close"]),  2),
            "volume": int(vol) if vol == vol and vol is not None else 0,
        })

    return {
        "symbol":  symbol.upper(),
        "period":  period,
        "interval": interval,
        "candles": candles,
        "count":   len(candles),
    }