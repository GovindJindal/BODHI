from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from pydantic import BaseModel, Field

from database import get_db
from models.core import User
from models.portfolio import PortfolioItem, Transaction

# Our real services
from services.trade_service import execute_buy, execute_sell, compute_costs, reset_portfolio_db
from services.auth_service import get_current_user
from services.yfinance_service import get_live_price
from services.market_hours import market_status
from sqlalchemy.orm import Session
import yfinance as yf
import asyncio
import math

from services.scheduler import process_morning_amos
import os

router = APIRouter()

# ─── Internal EventBridge Triggers ───────────────────────────────────────────
@router.post("/internal/trigger_amos", include_in_schema=False)
async def trigger_amos(req: Request):
    # Verify the secret token sent by AWS EventBridge
    from core.config import settings
    secret = req.headers.get("x-bodhi-cron-secret")
    if not secret or secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    await process_morning_amos()
    return {"status": "success", "message": "AMO Processing triggered"}

# ─── Endpoints ───────────────────────────────────────────────────────────────

class BuyRequest(BaseModel):
    symbol: str = Field(..., example="RELIANCE.NS")
    amount_inr: float = Field(..., gt=0)

class SellRequest(BaseModel):
    symbol: str = Field(..., example="RELIANCE.NS")
    quantity: int = Field(..., gt=0)


@router.post("/buy")
async def buy_stock(
    req: BuyRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 🔒 Requires Login
):
    status = market_status()
    
    try:
        price_data = await get_live_price(req.symbol)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch live price for {req.symbol}")
    
    # 🔥 FIX: Pass status["open"] as the final argument
    result = await execute_buy(db, current_user.id, req.symbol.upper(), req.amount_inr, price_data["price"], status["open"])
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    result["market_status"] = status
    return result


@router.post("/sell")
async def sell_stock(
    req: SellRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 🔒 Requires Login
):
    status = market_status()
    
    try:
        price_data = await get_live_price(req.symbol)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch live price for {req.symbol}")
    
    # 🔥 FIX: Pass status["open"] as the final argument
    result = await execute_sell(db, current_user.id, req.symbol.upper(), req.quantity, price_data["price"], status["open"])
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    result["market_status"] = status
    return result


@router.get("/portfolio")
async def get_portfolio_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 🔒 Requires Login
):
    # Fetch all holdings for the logged-in user
    result = await db.execute(select(PortfolioItem).where(PortfolioItem.user_id == current_user.id))
    holdings = result.scalars().all()
    
    STARTING_CAPITAL = 100000.0  # Used for percentage calculations
    
    # 🔥 FIX: Handle existing users who have NULL (None) in the new paper_balance column
    current_cash = current_user.paper_balance if current_user.paper_balance is not None else STARTING_CAPITAL
    
    total_value = current_cash
    holdings_detail = []

    for holding in holdings:
        # Try to get the live price, if yfinance fails, fallback to average buy price
        try:
            price_data = await get_live_price(holding.symbol)
            live_price = price_data["price"]
            day_change_pct = price_data.get("change_pct", 0)
            company_name = price_data.get("shortName", holding.symbol) 
        except Exception:
            live_price = holding.average_buy_price
            day_change_pct = 0.0
            company_name = holding.symbol
        
        current_value = holding.quantity * live_price
        invested_value = holding.quantity * holding.average_buy_price
        pnl = current_value - invested_value
        pnl_pct = round((pnl / invested_value) * 100, 2) if invested_value else 0
        
        total_value += current_value
        
        holdings_detail.append({
            "symbol": holding.symbol,
            "name": company_name,                
            "qty": holding.quantity,
            "avg_price": round(holding.average_buy_price, 2),
            "live_price": round(live_price, 2),
            "current_value": round(current_value, 2),
            "invested_value": round(invested_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": pnl_pct,
            "day_change_pct": day_change_pct
        })

    total_pnl = round(total_value - STARTING_CAPITAL, 2)
    total_pnl_pct = round((total_pnl / STARTING_CAPITAL) * 100, 2)  
    
    return {
        "username": current_user.email,
        "cash": round(current_cash, 2),          # <-- Updated to use safe fallback
        "starting_capital": STARTING_CAPITAL,    
        "total_value": round(total_value, 2),
        "total_pnl": total_pnl,
        "total_pnl_pct": total_pnl_pct,          
        "holdings": holdings_detail,
        "market_status": market_status()
    }

@router.get("/history")
async def transaction_history(
    limit: int = Query(50), 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 🔒 Requires Login
):
    result = await db.execute(
        select(Transaction).where(Transaction.user_id == current_user.id).order_by(desc(Transaction.timestamp)).limit(limit)
    )
    txns = result.scalars().all()
    return {"transactions": txns}


@router.post("/reset")
async def reset_portfolio(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # We pass current_user.id to the service
    success = await reset_portfolio_db(db, str(current_user.id))
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to reset portfolio in database")
        
    return {"status": "success", "message": "Balance reset to ₹1,00,000"}


@router.get("/costs-preview")
async def costs_preview(
    symbol: str = Query(...), 
    amount_inr: float = Query(...), 
    side: str = Query("BUY"),
    current_user: User = Depends(get_current_user)
):
    try:
        price_data = await get_live_price(symbol)
        # 🔥 CHECK: If yfinance returned an error or no price
        if not price_data or "price" not in price_data or price_data["price"] is None:
            raise HTTPException(status_code=404, detail=f"Stock symbol '{symbol}' not found.")
            
        live_price = price_data["price"]
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error in costs-preview: {e}")
        raise HTTPException(status_code=502, detail=f"Could not fetch price for {symbol}")
    
    qty = int(amount_inr / live_price)
    trade_value = qty * live_price
    costs = compute_costs(trade_value, side.upper())
    
    net = trade_value + costs["total"] if side.upper() == "BUY" else trade_value - costs["total"]

    return {
        "symbol": symbol.upper(),
        "live_price": live_price,
        "quantity": qty,
        "trade_value": round(trade_value, 2),
        "costs": costs,
        "net_amount": round(net, 2),
        "market_status": market_status()
    }

@router.get("/chart")
async def get_chart_data(symbol: str = Query(...), period: str = Query("1mo")):
    # 1. Clean the symbol for Indian Markets
    clean_symbol = symbol.upper()
    if not clean_symbol.endswith(".NS") and not clean_symbol.endswith(".BO"):
        clean_symbol = f"{clean_symbol}.NS"

    # 2. Define the worker function INSIDE the async function
    def fetch_history():
        ticker = yf.Ticker(clean_symbol)
        # Fetching data for the requested period
        hist = ticker.history(period=period, interval="1d")
        
        if hist.empty:
            return []

        data = []
        for date, row in hist.iterrows():
            # Skip empty/zero candles that break the chart
            if row["Open"] == 0 or math.isnan(row["Open"]):
                continue 

            def safe_float(val, default=0.0):
                try:
                    if math.isnan(val) or math.isinf(val):
                        return default
                    return round(float(val), 2)
                except:
                    return default

            data.append({
                "time": date.strftime("%Y-%m-%d"),
                "open": safe_float(row["Open"]),
                "high": safe_float(row["High"]),
                "low": safe_float(row["Low"]),
                "close": safe_float(row["Close"])
            })
        return data

    # 3. Execute and return
    try:
        # We run the blocking yfinance call in a separate thread
        chart_data = await asyncio.to_thread(fetch_history)
        return {"symbol": clean_symbol, "data": chart_data}
    except Exception as e:
        print(f"Chart Error for {clean_symbol}: {e}")
        return {"symbol": clean_symbol, "data": []}