import os
import json
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

# General System Prompt
_SYSTEM_PROMPT = """You are 'GAP', Bodhi's AI financial co-pilot for Indian users.
You understand Hindi, Hinglish, and English. Respond in the same language as the user,
in a friendly, concise way (2-3 sentences max) with a light, witty tone.
Your job is to understand user intents and provide helpful financial coaching.

Return ONLY this JSON:
{
  "intent": "general_chat" | "balance_query" | "spending_query" | "investment_query" | "payment_request",
  "text_response": "<your answer for the user>",
  "suggested_action": null | "<short action key such as open_trade, open_payments, open_insurance>"
}
"""

# Specialized Extraction Prompt for Transactions
_TRANSACTION_EXTRACTION_PROMPT = """You are a high-precision financial parser. 
The user wants to LOG a transaction. Your ONLY goal is to extract the following fields into JSON:

- amount: numeric (extract from words like 'do sau', '500 rs', '₹120', 'रुपये', '500')
- merchant: who was paid (e.g., 'Aman', 'Zomato', 'Kirana', 'Petrol Pump')
- category: one of [Food, Transport, Shopping, Bills, Entertainment, Health, Other]
- type: 'DEBIT' or 'CREDIT' (default DEBIT if money was spent)
- text_response: A very short confirmation like 'Done! ₹500 added for Zomato.' in the user's language.

IMPORTANT: Even if the user uses informal language, identify the amount and merchant. 
Return ONLY this JSON:
{
  "intent": "add_transaction",
  "text_response": "...",
  "suggested_action": "add_transaction",
  "transaction_data": {
    "amount": 0,
    "merchant": "Unknown",
    "category": "Other",
    "type": "DEBIT"
  }
}
"""

_TRANSACTION_KEYWORDS = [
    "add", "record", "log", "spent", "paid", "bought", "expense", "transaction", "history",
    "जोड़ो", "लिखो", "दिए", "दिया", "खर्च", "खर्चा", "भुगतान", "ट्रांजैक्शन", "लॉग", "लॉग्स", "डाल", "रुपये"
]

_ALLOWED_CATEGORIES = {"Food", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Other"}
_models: Dict[str, Any] = {}


def _get_model(system_instruction: str):
    """Configured Gemini models are cached per prompt (one per warm Lambda)."""
    model = _models.get(system_instruction)
    if model is None:
        import google.generativeai as genai
        from core.config import settings

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(
            model_name=os.getenv("LLM_MODEL", "gemini-flash-latest"),
            system_instruction=system_instruction,
        )
        _models[system_instruction] = model
    return model


def _normalise(result: Any, is_transaction: bool) -> Dict[str, Any]:
    """Guarantee the keys the routers and the app rely on, whatever the LLM returned."""
    if not isinstance(result, dict):
        result = {"text_response": str(result)}
    text = str(result.get("text_response") or "").strip() or "Sorry, I could not work that out. Could you rephrase?"
    out: Dict[str, Any] = {
        "intent": str(result.get("intent") or ("add_transaction" if is_transaction else "general_chat")),
        "text_response": text,
        "suggested_action": result.get("suggested_action") or None,
        "transaction_data": None,
    }
    tx = result.get("transaction_data")
    if out["intent"] == "add_transaction" and isinstance(tx, dict):
        try:
            amount = round(abs(float(str(tx.get("amount", 0)).replace(",", ""))), 2)
        except (TypeError, ValueError):
            amount = 0.0
        category = str(tx.get("category") or "Other").title()
        out["transaction_data"] = {
            "amount": amount,
            "merchant": (str(tx.get("merchant") or "Unknown").strip() or "Unknown")[:100],
            "category": category if category in _ALLOWED_CATEGORIES else "Other",
            "type": "CREDIT" if str(tx.get("type", "")).upper() == "CREDIT" else "DEBIT",
        }
    return out


async def process_user_intent(message: str) -> Dict[str, Any]:
    """
    Analyzes user message. If trigger words are found, uses a specialized extraction prompt.
    Otherwise, uses the general financial co-pilot prompt.
    Always returns a dict with intent / text_response / suggested_action / transaction_data.
    """
    from fastapi import HTTPException
    from core.config import settings

    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="AI assistant is not configured on the server.")

    msg_lower = message.lower()
    has_trigger = any(kw in msg_lower for kw in _TRANSACTION_KEYWORDS)
    system_instruction = _TRANSACTION_EXTRACTION_PROMPT if has_trigger else _SYSTEM_PROMPT

    try:
        model = _get_model(system_instruction)
        response = await model.generate_content_async(
            message,
            generation_config={"temperature": 0.1 if has_trigger else 0.6, "response_mime_type": "application/json"},
        )
        raw_text = (response.text or "").strip()
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            parsed = {"text_response": raw_text}
        return _normalise(parsed, has_trigger)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Bodhi Brain failed: %s", exc)
        raise HTTPException(status_code=502, detail="The AI assistant is temporarily unavailable. Please try again.") from None
