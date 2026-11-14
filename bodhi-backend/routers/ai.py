import base64
import logging
import os
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from starlette.background import BackgroundTask
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.rate_limit import limiter
from services.auth_service import get_current_user
from services.brain_service import process_user_intent
from services.sarvam_service import generate_bodhi_speech, transcribe_audio

logger = logging.getLogger(__name__)

# Every AI route costs money (Gemini/Sarvam), so all of them require a logged-in user.
router = APIRouter(prefix="/ai", tags=["AI Integration"], dependencies=[Depends(get_current_user)])

MAX_AUDIO_BYTES = 10 * 1024 * 1024


class SpeechRequest(BaseModel):
    text: str = Field(..., max_length=2500)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    speak: bool = True


class SpeechResponse(BaseModel):
    audio_base64: str


class TranscribeResponse(BaseModel):
    transcript: str


class AICommandResponse(BaseModel):
    transcript: str
    intent: str
    text_response: str
    suggested_action: str | None
    audio_base64: str | None
    transaction_data: dict | None = None  # Populated when intent == 'add_transaction'


async def _optional_speech(text: str) -> str | None:
    """TTS is a nice-to-have: never fail the whole request because voice failed."""
    try:
        return await generate_bodhi_speech(text)
    except Exception as exc:
        logger.warning(f"TTS skipped: {exc}")
        return None


async def _read_audio(file: UploadFile) -> bytes:
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip is too long")
    return contents


@router.post("/speak", response_model=SpeechResponse)
@limiter.limit("30/minute")
async def get_bodhi_voice(request: Request, payload: SpeechRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    return {"audio_base64": await generate_bodhi_speech(payload.text)}


@router.post("/chat", response_model=AICommandResponse)
@limiter.limit("30/minute")
async def chat(request: Request, payload: ChatRequest):
    """Typed message → GAP brain → (optional) voice reply."""
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    brain = await process_user_intent(message)
    audio = await _optional_speech(brain["text_response"]) if payload.speak else None
    return {"transcript": message, "audio_base64": audio, **brain}

@router.get("/stream_tts/{filename}")
async def stream_tts_audio(filename: str, text: str):
    """Generates Sarvam speech and returns an audio file stream directly."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        base64_audio = await generate_bodhi_speech(text)
        audio_bytes = base64.b64decode(base64_audio)
        
        # Save to temp file
        tf = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tf.write(audio_bytes)
        tf.close()
        
        # Cleanup helper to prevent disk exhaustion
        def cleanup_temp_file(path: str):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError as e:
                logger.warning(f"Failed to cleanup temporary audio file {path}: {e}")

        return FileResponse(tf.name, media_type="audio/wav", background=BackgroundTask(cleanup_temp_file, tf.name))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Streaming TTS Error: {e}")
        raise HTTPException(status_code=502, detail="Failed to stream audio") from None

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_speech(file: UploadFile = File(...)):
    """Accepts an audio file upload and returns the Sarvam STT transcript."""
    contents = await _read_audio(file)
    transcript = await transcribe_audio(contents, file.filename or "audio.mp4")
    return {"transcript": transcript}

@router.post("/command", response_model=AICommandResponse)
async def process_voice_command(file: UploadFile = File(...)):
    """Unified endpoint: Audio -> Text -> Intent -> Response Text + Voice."""
    audio_bytes = await _read_audio(file)
    transcript = (await transcribe_audio(audio_bytes, file.filename or "audio.mp4") or "").strip()
    if not transcript:
        return {
            "transcript": "",
            "intent": "general_chat",
            "text_response": "I couldn't quite hear you. Could you repeat that?",
            "suggested_action": None,
            "audio_base64": None,
            "transaction_data": None,
        }
    brain = await process_user_intent(transcript)
    audio = await _optional_speech(brain["text_response"])
    return {"transcript": transcript, "audio_base64": audio, **brain}
