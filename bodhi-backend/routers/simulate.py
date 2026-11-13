from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from typing import Optional
import pandas as pd
import logging

from services.yfinance_service import get_historical, get_stock_info
from core.crash_events import (
    CRASH_EVENTS,
    list_crash_events,
    compute_max_drawdown,
    compute_volatility_annualized,
    compute_alpha_score,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request / Response schemas ──────────────────────────────────────────────

class CrashSimRequest(BaseModel):
    symbol:           str   = Field(..., example="RELIANCE.NS")
    crash_event_id:   str   = Field(..., example="covid_2020")
    investment_inr:   float = Field(10_000, gt=0)


class ReplayRequest(BaseModel):
    symbol:         str   = Field(..., example="TATAMOTORS.NS")
    start_date:     str   = Field(..., example="2020-01-01")   # YYYY-MM-DD
    investment_inr: float = Field(10_000, gt=0)
    compare_symbol: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────────────

def _build_chart_data(df: pd.DataFrame, shares: float) -> list[dict]:
    """Convert a price DataFrame into a list of {date, price, value} dicts for Recharts."""
    out = []
    for ts, row in df.iterrows():
        date_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
        price = round(float(row["Close"]), 2)
        out.append({
            "date":  date_str,
            "price": price,
            "value": round(shares * price, 2),
        })
    return out


async def _simulate_single(
    symbol: str,
    investment_inr: float,
    start: str,
    end: str,
) -> dict:
    """Core simulation: buy shares at start price, track through end."""
    # Now using await for the background yfinance worker
    df = await get_historical(symbol, start=start, end=end)

    entry_price     = float(df["Close"].iloc[0])
    shares          = investment_inr / entry_price

    exit_price      = float(df["Close"].iloc[-1])
    peak_price      = float(df["Close"].max())
    trough_price    = float(df["Close"].min())
    peak_date       = df["Close"].idxmax().strftime("%Y-%m-%d")
    trough_date     = df["Close"].idxmin().strftime("%Y-%m-%d")

    value_now       = shares * exit_price
    value_peak      = shares * peak_price
    value_trough    = shares * trough_price

    gain_pct        = round((value_now - investment_inr) / investment_inr * 100, 2)
    loss_at_trough  = round((value_trough - investment_inr) / investment_inr * 100, 2)

    volatility      = compute_volatility_annualized(df["Close"])
    max_drawdown    = compute_max_drawdown(df["Close"])
    trading_days    = len(df)
    calendar_days   = (df.index[-1] - df.index[0]).days

    alpha = compute_alpha_score(
        gain_pct=gain_pct,
        volatility=volatility,
        max_drawdown=max_drawdown,
        recovery_speed_days=calendar_days,
    )

    chart_data = _build_chart_data(df, shares)

    milestones = [
        {"date": df.index[0].strftime("%Y-%m-%d"),  "label": "You invested",    "type": "entry"},
        {"date": trough_date,                        "label": "Lowest point",    "type": "bottom"},
        {"date": peak_date,                          "label": "Highest point",   "type": "peak"},
        {"date": df.index[-1].strftime("%Y-%m-%d"), "label": "Today / End",     "type": "exit"},
    ]

    try:
        # Await the stock info worker
        info = await get_stock_info(symbol)
        display_name = info.get("name", symbol)
    except Exception:
        display_name = symbol

    return {
        "symbol":           symbol.upper(),
        "display_name":     display_name,
        "investment_inr":   investment_inr,
        "shares_bought":    round(shares, 6),
        "entry_price":      round(entry_price, 2),
        "exit_price":       round(exit_price, 2),
        "value_now":        round(value_now, 2),
        "value_trough":     round(value_trough, 2),
        "value_peak":       round(value_peak, 2),
        "gain_pct":         gain_pct,
        "loss_at_trough_pct": loss_at_trough,
        "max_drawdown_pct": max_drawdown,
        "volatility_pct":   volatility,
        "alpha_score":      alpha,
        "trading_days":     trading_days,
        "calendar_days":    calendar_days,
        "trough_date":      trough_date,
        "peak_date":        peak_date,
        "chart_data":       chart_data,
        "milestones":       milestones,
        "start_date":       start,
        "end_date":         end,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_crash_events():
    """Return all available historical crash events for the UI picker."""
    return {"events": list_crash_events()}


@router.post("/crash")
async def simulate_crash(req: CrashSimRequest):
    """
    Replay a named historical crash event for a given stock + investment amount.
    """
    event = CRASH_EVENTS.get(req.crash_event_id)
    if not event:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown crash event '{req.crash_event_id}'. "
                   f"Valid IDs: {list(CRASH_EVENTS.keys())}",
        )

    try:
        # Added await here
        result = await _simulate_single(
            symbol=req.symbol,
            investment_inr=req.investment_inr,
            start=event["start"],
            end=event["recovery"],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Crash simulation failed: {e}")
        raise HTTPException(status_code=500, detail="Data fetch failed. Try again.")

    fell_to   = result["value_trough"]
    grew_to   = result["value_now"]
    invested  = req.investment_inr
    gain      = result["gain_pct"]
    loss_low  = result["loss_at_trough_pct"]

    if gain >= 0:
        narrative = (
            f"Your ₹{invested:,.0f} fell as low as ₹{fell_to:,.0f} "
            f"({loss_low:.1f}%) during the {event['name']}. "
            f"But holding through the panic, it recovered to ₹{grew_to:,.2f} "
            f"(+{gain:.1f}%). Panic selling was the only way to actually lose."
        )
        outperformed_pct = max(0, round(gain - 7.0))
    else:
        narrative = (
            f"Your ₹{invested:,.0f} fell to ₹{grew_to:,.2f} ({gain:.1f}%) "
            f"by the end of this window. The worst point was ₹{fell_to:,.0f} "
            f"({loss_low:.1f}%). This event hasn't fully recovered yet in this window."
        )
        outperformed_pct = 0

    return {
        "event":            event,
        "simulation":       result,
        "narrative":        narrative,
        "outperformed_pct": outperformed_pct,
        "lesson":           event.get("lesson", ""),
        "generated_at":     datetime.utcnow().isoformat(),
    }


@router.post("/replay")
async def simulate_replay(req: ReplayRequest):
    """
    Free-form Time Warp: replay any stock from any past date until today.
    Optionally compare against a second symbol (What-If Multiplier).
    """
    try:
        start_dt = datetime.strptime(req.start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date must be YYYY-MM-DD")

    if start_dt >= datetime.utcnow() - timedelta(days=7):
        raise HTTPException(status_code=422, detail="start_date must be at least 7 days in the past")

    end_date = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")

    try:
        # Added await here
        primary = await _simulate_single(
            symbol=req.symbol,
            investment_inr=req.investment_inr,
            start=req.start_date,
            end=end_date,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Replay failed: {e}")
        raise HTTPException(status_code=500, detail="Data fetch failed. Try again.")

    comparison = None
    if req.compare_symbol and req.compare_symbol.upper() != req.symbol.upper():
        try:
            # Added await here
            comparison = await _simulate_single(
                symbol=req.compare_symbol,
                investment_inr=req.investment_inr,
                start=req.start_date,
                end=end_date,
            )
        except Exception as e:
            logger.warning(f"Comparison fetch failed for {req.compare_symbol}: {e}")

    years      = primary["calendar_days"] / 365
    fd_return  = round((primary["investment_inr"] * (1 + 0.07 * years)) - primary["investment_inr"], 2)
    fd_value   = round(primary["investment_inr"] + fd_return, 2)
    fd_pct     = round(0.07 * years * 100, 2)
    outperformed_savings_pct = round(
        ((primary["value_now"] - fd_value) / fd_value) * 100, 2
    ) if fd_value else 0

    return {
        "primary":                    primary,
        "comparison":                 comparison,
        "fd_benchmark":               {"value": fd_value, "gain_pct": fd_pct},
        "outperformed_savings_pct":   outperformed_savings_pct,
        "generated_at":               datetime.utcnow().isoformat(),
    }