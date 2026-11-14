from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from models.core import User
from models.portfolio import PortfolioItem, Transaction
import logging
from fastapi import HTTPException
from sqlalchemy import update

logger = logging.getLogger(__name__)

# ── Indian market cost calculator ──────────────────────────────────────────
def compute_costs(trade_value: float, side: str) -> dict:
    brokerage     = min(20.0, trade_value * 0.0003)
    stt           = trade_value * (0.001 if side == "SELL" else 0.0)
    exchange_fee  = trade_value * 0.0000335
    sebi_fee      = trade_value * 0.000001
    stamp_duty    = trade_value * (0.00015 if side == "BUY" else 0.0)
    gst           = (brokerage + exchange_fee + sebi_fee) * 0.18

    total_charges = brokerage + stt + exchange_fee + sebi_fee + stamp_duty + gst

    return {
        "brokerage": round(brokerage, 4),
        "stt": round(stt, 4),
        "exchange_fee": round(exchange_fee, 4),
        "sebi_fee": round(sebi_fee, 6),
        "stamp_duty": round(stamp_duty, 4),
        "gst": round(gst, 4),
        "total": round(total_charges, 4),
    }

def normalize_symbol(symbol: str) -> str:
    """Store every NSE symbol the same way (RELIANCE → RELIANCE.NS) to avoid duplicate holdings."""
    symbol = (symbol or "").upper().strip()
    return symbol if "." in symbol else f"{symbol}.NS"


async def _locked_user(db, user_id) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _locked_holding(db, user_id, symbol):
    result = await db.execute(
        select(PortfolioItem)
        .where(PortfolioItem.user_id == user_id, PortfolioItem.symbol.in_({symbol, symbol.split(".")[0]}))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalars().first()


# ── Async Trade Execution ────────────────────────────────────────────────
async def execute_buy(db, user_id, symbol, amount_inr, current_price, is_market_open):
    symbol = normalize_symbol(symbol)
    if not current_price or current_price <= 0:
        return {"error": "Live price unavailable. Please try again."}

    qty = int(amount_inr // current_price)
    if qty <= 0:
        return {"error": f"Amount too low to buy even 1 share (price ₹{current_price:,.2f})."}
    total_cost = round(qty * current_price, 2)

    # Lock the user row so two quick taps can't spend the same paper cash twice.
    user = await _locked_user(db, user_id)
    current_balance = user.paper_balance if user.paper_balance is not None else 0.0
    if current_balance + 1e-9 < total_cost:
        raise HTTPException(status_code=400, detail=f"Insufficient paper balance (₹{current_balance:,.2f}).")

    # Block the funds immediately (also for AMOs) so they can't be double-spent overnight.
    user.paper_balance = round(current_balance - total_cost, 2)

    if is_market_open:
        holding = await _locked_holding(db, user_id, symbol)
        if holding:
            old_total = holding.quantity * holding.average_buy_price
            holding.quantity += qty
            holding.average_buy_price = (old_total + total_cost) / holding.quantity
            holding.symbol = symbol
        else:
            db.add(PortfolioItem(user_id=user_id, symbol=symbol, quantity=qty, average_buy_price=current_price))
        txn_status = "EXECUTED"
        msg = f"Successfully bought {qty} shares of {symbol}."
    else:
        # Market closed: AMO. Cash is blocked, shares arrive when it executes at 9:15 AM.
        txn_status = "PENDING_AMO"
        msg = "Market is closed. Your order is placed as an AMO and will execute at 9:15 AM."

    db.add(Transaction(user_id=user_id, type="BUY", symbol=symbol, quantity=qty,
                       price=current_price, total_value=total_cost, status=txn_status))
    await db.commit()
    return {"status": "success", "message": msg, "order_status": txn_status,
            "quantity": qty, "price": current_price, "paper_balance": user.paper_balance}


async def execute_sell(db, user_id, symbol, quantity_to_sell, current_price, is_market_open):
    symbol = normalize_symbol(symbol)
    if not current_price or current_price <= 0:
        return {"error": "Live price unavailable. Please try again."}

    user = await _locked_user(db, user_id)
    holding = await _locked_holding(db, user_id, symbol)
    if not holding or holding.quantity < quantity_to_sell:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient holdings. You only have {holding.quantity if holding else 0} shares of {symbol}."
        )

    total_credit = round(quantity_to_sell * current_price, 2)
    # Shares are blocked immediately in both cases.
    holding.quantity -= quantity_to_sell
    if holding.quantity <= 0:
        await db.delete(holding)

    if is_market_open:
        user.paper_balance = round((user.paper_balance or 0.0) + total_credit, 2)
        txn_status = "EXECUTED"
        msg = f"Successfully sold {quantity_to_sell} shares of {symbol}."
    else:
        # AMO: cash is credited when the order executes.
        txn_status = "PENDING_AMO"
        msg = "Market is closed. Your sell order is placed as an AMO."

    db.add(Transaction(user_id=user_id, type="SELL", symbol=symbol, quantity=quantity_to_sell,
                       price=current_price, total_value=total_credit, status=txn_status))
    await db.commit()
    return {"status": "success", "message": msg, "order_status": txn_status,
            "quantity": quantity_to_sell, "price": current_price, "paper_balance": user.paper_balance}


async def reset_portfolio_db(db: AsyncSession, user_id: str):
    try:
        # 1. Reset balance to 1 Lakh
        await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(paper_balance=100000.0)
        )
        
        # 2. Delete all holdings (PortfolioItems)
        await db.execute(
            delete(PortfolioItem).where(PortfolioItem.user_id == user_id)
        )
        
        # 3. Delete all trade history (Transactions)
        # Note: Ensure the class name matches your model (e.g., Transaction or TradeTransaction)
        await db.execute(
            delete(Transaction).where(Transaction.user_id == user_id)
        )

        # 4. Commit the changes
        await db.commit()
        return True
        
    except Exception as e:
        await db.rollback() # 🟢 Must await the rollback now!
        logger.error(f"Reset Database Error: {e}")
        return False