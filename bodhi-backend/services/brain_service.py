import os
import json
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

# General System Prompt
_SYSTEM_PROMPT = """You are 'GAP', Bodhi's AI financial co-pilot for Indian users.
You understand Hindi, Hinglish, and English voice commands. Respond in the same language as the user.
Your job is to understand user intents and provide helpful financial coaching.
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

async def process_user_intent(message: str) -> Dict[str, Any]:
    """
    Analyzes user message. If trigger words are found, uses a specialized extraction prompt.
    Otherwise, uses the general financial co-pilot prompt.
    """
    from core.config import settings
    gemini_key = settings.gemini_api_key
    if not gemini_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY environment variable is not set. Cannot process AI intent.")

    msg_lower = message.lower()
    has_trigger = any(kw in msg_lower for kw in _TRANSACTION_KEYWORDS)
    
    system_instruction = _SYSTEM_PROMPT
    if has_trigger:
        print(f"🎯 TRIGGER DETECTED in: '{message}'. Switching to EXTRACTION PROMPT.")
        system_instruction = _TRANSACTION_EXTRACTION_PROMPT
    else:
        print(f"🗨️ No trigger found in: '{message}'. Using GENERAL PROMPT.")

    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        
        model = genai.GenerativeModel(
            model_name=os.getenv("LLM_MODEL", "gemini-1.5-flash"),
            system_instruction=system_instruction,
        )

        print(f"🧠 Brain analyzing message: '{message[:50]}...'")
        response = model.generate_content(
            message,
            generation_config={"temperature": 0.1, "response_mime_type": "application/json"} # Low temp for precision
        )
        
        raw_text = (response.text or "").strip()
        return json.loads(raw_text)

    except Exception as exc:
        logger.exception("Bodhi Brain failed: %s", exc)
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=f"AI Brain (Gemini) failed: {str(exc)}")
