import os
import httpx
from fastapi import HTTPException

# In production, ensure SARVAM_API_KEY is in your .env file
# e.g., SARVAM_API_KEY="your_actual_key_here"

_http_client = None

def get_http_client():
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient()
    return _http_client

async def generate_bodhi_speech(text: str) -> str:
    from core.config import settings
    api_key = settings.sarvam_api_key
    if not api_key:
        print("CRITICAL: SARVAM_API_KEY environment variable is missing.")
        raise HTTPException(status_code=500, detail="AI Voice is not configured on the server.")

    # SARVAM V3 SPEC: https://api.sarvam.ai/text-to-speech
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json"
    }
    
    # NOTE: V3 uses 'text' instead of 'inputs', and 'sample_rate' instead of 'speech_sample_rate'
    # 'pitch' and 'loudness' are no longer supported in V3.
    payload = {
        "text": text,
        "target_language_code": "hi-IN", # Hindi
        "speaker": "ritu",                # Female voice model (V3 supported)
        "pace": 1.1,
        "sample_rate": 24000,            # V3 Default
        "enable_preprocessing": True,
        "model": "bulbul:v3"
    }

    client = get_http_client()
    try:
        print(f"🎙️ Contacting Sarvam V3 TTS for text: '{text[:50]}...'")
        response = await client.post(url, json=payload, headers=headers, timeout=15.0)
        
        if response.status_code != 200:
            print(f"❌ Sarvam TTS Failed ({response.status_code}): {response.text}")
            response.raise_for_status()
            
        data = response.json()
        
        if "audios" in data and len(data["audios"]) > 0:
            return data["audios"][0] # Returns the Base64 string
        else:
            raise HTTPException(status_code=500, detail="No audio returned from Sarvam API")
            
    except httpx.HTTPError as e:
        error_msg = f"Sarvam API Error: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f" | Body: {e.response.text}"
        print(error_msg)
        raise HTTPException(status_code=502, detail=f"Text-to-Speech API failed: {e}")
    except Exception as e:
        print(f"❌ UNEXPECTED TTS CRASH: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error in Text-to-Speech: {e}")


async def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    """Speech-to-Text via Sarvam API. Keeps the API key server-side."""
    from core.config import settings
    api_key = settings.sarvam_api_key
    if not api_key:
        print("CRITICAL: SARVAM_API_KEY environment variable is missing.")
        raise HTTPException(status_code=500, detail="AI Voice transcription is not configured.")

    url = "https://api.sarvam.ai/speech-to-text"
    headers = {
        "api-subscription-key": api_key,
    }

    client = get_http_client()
    try:
        # SARVAM V3 SPEC: multipart/form-data
        # Using application/octet-stream to be resilient to various audio containers
        files = {"file": (filename or "audio.mp4", file_bytes, "application/octet-stream")}
        data = {
            "model": "saaras:v3",
            "language_code": "hi-IN", # Hindi
            "mode": "transcribe"
        }
        
        print(f"📡 Contacting Sarvam V3 STT for {filename}...")
        response = await client.post(url, headers=headers, files=files, data=data, timeout=20.0)
        
        if response.status_code != 200:
            print(f"❌ Sarvam STT Failed ({response.status_code}): {response.text}")
            response.raise_for_status()

        result = response.json()

        if "transcript" in result and result["transcript"]:
            return result["transcript"]
        else:
            raise HTTPException(status_code=500, detail="No transcript returned from Sarvam API")

    except httpx.HTTPError as e:
        error_msg = f"Sarvam STT Error: {e}"
        if hasattr(e, 'response') and e.response is not None:
            error_msg += f" | Body: {e.response.text}"
        print(error_msg)
        raise HTTPException(status_code=502, detail=f"Speech-to-Text API failed: {e}")
    except Exception as e:
        print(f"❌ UNEXPECTED STT CRASH: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error in Speech-to-Text: {e}")