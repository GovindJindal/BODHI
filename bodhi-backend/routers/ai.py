from fastapi import Request
from core.rate_limit import limiter
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
import base64
import tempfile
import os
import traceback
from services.sarvam_service import generate_bodhi_speech, transcribe_audio
from services.brain_service import process_user_intent

router = APIRouter(prefix="/ai", tags=["AI Integration"])

class SpeechRequest(BaseModel):
    text: str

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

@router.post("/speak", response_model=SpeechResponse)
async def get_bodhi_voice(request: SpeechRequest):
    print(f"🎙️ AI Speak requested for text: '{request.text[:50]}...'")
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    base64_audio = await generate_bodhi_speech(request.text)
    print("✅ Voice generated successfully.")
    return {"audio_base64": base64_audio}

@router.get("/stream_tts/{filename}")
async def stream_tts_audio(filename: str, text: str):
    """Generates Sarvam speech and returns an audio file stream directly."""
    print(f"🎧 Streaming TTS requested for: '{text[:50]}...'")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        base64_audio = await generate_bodhi_speech(text)
        audio_bytes = base64.b64decode(base64_audio)
        
        # Save to temp file
        tf = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tf.write(audio_bytes)
        tf.close()
        
        print(f"✅ Voice generated and cached to temp file.")
        return FileResponse(tf.name, media_type="audio/wav")
    except Exception as e:
        print(f"❌ Streaming TTS Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to stream audio")

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_speech(file: UploadFile = File(...)):
    """Accepts an audio file upload and returns the Sarvam STT transcript."""
    print(f"📡 Incoming audio for transcription: {file.filename}")
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    
    transcript = await transcribe_audio(contents, file.filename or "audio.mp4")
    print(f"📝 Transcription result: '{transcript}'")
    return {"transcript": transcript}

@router.post("/command", response_model=AICommandResponse)
async def process_voice_command(file: UploadFile = File(...)):
    """Unified endpoint: Audio -> Text -> Intent -> Response Text + Voice."""
    try:
        print(f"🚀 Processing full AI Command for {file.filename}...")
        
        # 1. Transcription (STT)
        audio_bytes = await file.read()
        transcript = await transcribe_audio(audio_bytes, file.filename or "audio.mp4")
        print(f"  [1/3] Transcribed Text: '{transcript}'")
        
        if not transcript or transcript.strip() == "":
            print("  ⚠️ Empty transcript received.")
            return {
                "transcript": "",
                "intent": "general_chat",
                "text_response": "I couldn't quite hear you. Could you repeat that?",
                "suggested_action": None,
                "audio_base64": None,
                "transaction_data": None
            }

        # 2. Brain Analysis (LLM)
        brain_result = await process_user_intent(transcript)
        print(f"  [2/3] Brain Intent: {brain_result.get('intent')} | Action: {brain_result.get('suggested_action')}")
        
        # 3. Voice Generation (TTS) - Optional/Auto
        audio_response = await generate_bodhi_speech(brain_result['text_response'])
        print(f"  [3/3] Audio response generated successfully.")
        
        return {
            "transcript": transcript,
            "intent": brain_result["intent"],
            "text_response": brain_result["text_response"],
            "suggested_action": brain_result.get("suggested_action"),
            "audio_base64": audio_response,
            "transaction_data": brain_result.get("transaction_data"),
        }
    except HTTPException:
        # Re-raise explicit HTTP exceptions (e.g. from missing keys or specific API failures)
        raise
    except Exception as e:
        print(f"❌ CRASH in process_voice_command: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")