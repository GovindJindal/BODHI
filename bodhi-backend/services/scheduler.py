import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.future import select

from database import AsyncSessionLocal
from models.core import User
from models.portfolio import PortfolioItem, Transaction
from services.yfinance_service import get_live_price

logger = logging.getLogger(__name__)

# NSE runs on IST; without an explicit timezone the job fired at 09:15 *UTC* (14:45 IST).
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


async def process_morning_amos():
    """Execute After-Market Orders at the opening price.

    BUY:  cash was blocked at the order price → refund/charge the difference.
    SELL: shares were blocked at order time  → credit the proceeds now.
    """
    if AsyncSessionLocal is None:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Transaction).where(Transaction.status == "PENDING_AMO").with_for_update(skip_locked=True)
        )
        pending_orders = result.scalars().all()
        executed = 0

        for order in pending_orders:
            try:
                price_data = await get_live_price(order.symbol)
                open_price = float(price_data["price"])
                user = (await db.execute(
                    select(User).where(User.id == order.user_id).with_for_update().execution_options(populate_existing=True)
                )).scalar_one_or_none()
                if user is None:
                    order.status = "REJECTED"
                    continue

                new_value = round(order.quantity * open_price, 2)
                if order.type == "BUY":
                    blocked = order.total_value or 0.0
                    user.paper_balance = round((user.paper_balance or 0.0) + blocked - new_value, 2)
                    holding = (await db.execute(
                        select(PortfolioItem).where(PortfolioItem.user_id == order.user_id,
                                                    PortfolioItem.symbol == order.symbol)
                    )).scalars().first()
                    if holding:
                        old_total = holding.quantity * holding.average_buy_price
                        holding.quantity += order.quantity
                        holding.average_buy_price = (old_total + new_value) / holding.quantity
                    else:
                        db.add(PortfolioItem(user_id=order.user_id, symbol=order.symbol,
                                             quantity=order.quantity, average_buy_price=open_price))
                elif order.type == "SELL":
                    user.paper_balance = round((user.paper_balance or 0.0) + new_value, 2)

                order.status = "EXECUTED"
                order.price = open_price
                order.total_value = new_value
                executed += 1
            except Exception as e:
                logger.error(f"Failed to execute AMO {order.id} for {order.symbol}: {e}")

        await db.commit()
        logger.info(f"Processed {executed}/{len(pending_orders)} AMOs.")


# Monday–Friday at 09:15 IST (market open)
scheduler.add_job(process_morning_amos, "cron", day_of_week="mon-fri", hour=9, minute=15)
