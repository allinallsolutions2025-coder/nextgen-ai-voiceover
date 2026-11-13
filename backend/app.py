from __future__ import annotations

import io
import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import soundfile as sf
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from kokoro import KModel, KPipeline

from api_security import matches_configured_api_key
from voice_catalog import LANGUAGE_BY_CODE, LANGUAGE_TEST_TEXT, VOICE_BY_ID, VOICE_CATALOG

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("nextgen-kokoro")

MODEL_REPO_ID = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24000
MAX_TEXT_CHARACTERS = 20000
ALLOWED_ORIGINS = [
    "https://allinallsolutions2025-coder.github.io",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
ENGINE_LOCK = threading.RLock()
ENGINE: dict[str, Any] = {
    "ready": False,
    "device": "cpu",
    "model": None,
    "pipelines": {},
    "voices": [],
    "language_errors": {},
}


class SpeechRequest(BaseModel):
    input: str = Field(min_length=1, max_length=MAX_TEXT_CHARACTERS)
    voice: str
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    expected = os.environ.get("NEXTGEN_API_KEY", "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="API access is disabled until the NEXTGEN_API_KEY secret is configured.",
        )
    if not matches_configured_api_key(expected, x_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


def _extract_audio_chunks(pipeline: KPipeline, text: str, voice_id: str, speed: float) -> list[np.ndarray]:
    chunks: list[np.ndarray] = []
    for _graphemes, _phonemes, audio in pipeline(text, voice=voice_id, speed=speed):
        if audio is None:
            continue
        if hasattr(audio, "detach"):
            audio = audio.detach().cpu().numpy()
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        if samples.size:
            chunks.append(samples)
    return chunks


def initialize_engine() -> None:
    if ENGINE["ready"]:
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.set_num_threads(max(1, int(os.environ.get("TORCH_NUM_THREADS", "2"))))
    logger.info("Loading Kokoro model %s on %s", MODEL_REPO_ID, device)

    model = KModel(repo_id=MODEL_REPO_ID).to(device).eval()
    pipelines: dict[str, KPipeline] = {}
    language_errors: dict[str, str] = {}
    available: list[dict[str, str]] = []

    for code, _language, label, female_voices, male_voices in LANGUAGE_BY_CODE.values():
        expected_ids = [*female_voices, *male_voices]
        if not expected_ids:
            continue
        try:
            pipeline = KPipeline(lang_code=code, repo_id=MODEL_REPO_ID, model=model)
            # Advertise a language only after its language-aware G2P and model synthesize audio.
            test_voice = expected_ids[0]
            pipeline.load_voice(test_voice)
            with torch.inference_mode():
                test_chunks = _extract_audio_chunks(
                    pipeline, LANGUAGE_TEST_TEXT[code], test_voice, 1.0
                )
            if not test_chunks:
                raise RuntimeError("Language smoke test returned no audio.")
            pipelines[code] = pipeline

            for voice_id in expected_ids:
                try:
                    pipeline.load_voice(voice_id)
                    available.append(VOICE_BY_ID[voice_id])
                except Exception as error:
                    logger.warning("Voice asset %s could not be loaded: %s", voice_id, error)
        except Exception as error:
            language_errors[code] = str(error)
            logger.exception("Language %s (%s) failed its startup test", code, label)

    if not available:
        raise RuntimeError("Kokoro did not expose any working voice. Check model downloads and language dependencies.")

    ENGINE.update({
        "ready": True,
        "device": device,
        "model": model,
        "pipelines": pipelines,
        "voices": sorted(available, key=lambda item: item["id"]),
        "language_errors": language_errors,
    })
    logger.info(
        "Kokoro engine ready: %d/%d voices across %d/%d languages",
        len(available), len(VOICE_CATALOG), len(pipelines), len(LANGUAGE_BY_CODE),
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_engine()
    yield


app = FastAPI(
    title="NextGen AI Voiceover — Multilingual Kokoro API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "NextGen AI Voiceover multilingual engine",
        "health": "/health",
        "voices": "/v1/voices",
        "speech": "/v1/audio/speech",
    }


@app.get("/health", dependencies=[Depends(require_api_key)])
def health() -> dict[str, Any]:
    if not ENGINE["ready"]:
        raise HTTPException(status_code=503, detail="The Kokoro engine is not ready.")
    return {
        "status": "ready",
        "device": ENGINE["device"],
        "voice_count": len(ENGINE["voices"]),
        "language_count": len(ENGINE["pipelines"]),
        "expected_voice_count": len(VOICE_CATALOG),
    }


@app.get("/v1/voices", dependencies=[Depends(require_api_key)])
def list_voices() -> dict[str, Any]:
    if not ENGINE["ready"]:
        raise HTTPException(status_code=503, detail="The Kokoro engine is not ready.")
    return {"voices": ENGINE["voices"]}


@app.post("/v1/audio/speech", dependencies=[Depends(require_api_key)])
def create_speech(request: SpeechRequest) -> Response:
    text = request.input.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Input text cannot be blank.")
    if len(text) > MAX_TEXT_CHARACTERS:
        raise HTTPException(status_code=413, detail=f"Input exceeds {MAX_TEXT_CHARACTERS} characters.")
    if not ENGINE["ready"]:
        raise HTTPException(status_code=503, detail="The Kokoro engine is not ready.")

    voice = VOICE_BY_ID.get(request.voice)
    if voice is None:
        raise HTTPException(status_code=400, detail="Unknown Kokoro voice ID.")
    ready_voice_ids = {item["id"] for item in ENGINE["voices"]}
    if request.voice not in ready_voice_ids:
        raise HTTPException(status_code=503, detail=f"Voice {request.voice} did not pass the server startup test.")

    pipeline = ENGINE["pipelines"].get(voice["language_code"])
    if pipeline is None:
        raise HTTPException(status_code=503, detail=f"The {voice['language_label']} pipeline is unavailable.")

    try:
        with ENGINE_LOCK, torch.inference_mode():
            chunks = _extract_audio_chunks(pipeline, text, request.voice, request.speed)
        if not chunks:
            raise RuntimeError("Kokoro returned no speech audio.")
        silence = np.zeros(int(SAMPLE_RATE * 0.09), dtype=np.float32)
        pieces: list[np.ndarray] = []
        for index, chunk in enumerate(chunks):
            if index:
                pieces.append(silence)
            pieces.append(chunk)
        samples = np.concatenate(pieces)

        output = io.BytesIO()
        sf.write(output, samples, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        return Response(
            content=output.getvalue(),
            media_type="audio/wav",
            headers={"Content-Disposition": 'attachment; filename="nextgen-voiceover.wav"'},
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Speech generation failed for voice %s", request.voice)
        raise HTTPException(status_code=500, detail=f"Speech generation failed for {request.voice}: {error}") from error
