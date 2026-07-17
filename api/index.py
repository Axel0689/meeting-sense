from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.llm import LLMError, analyze_transcript, truncate
from app.models import AnalyzeRequest, AnalyzeResponse
from app.parsing import normalize_transcript
from app.ratelimit import RateLimitExceeded, enforce as enforce_rate_limit

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="MeetingSense", version="0.1.0")

MIN_CHARS = 80


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


def _client_ip(request: Request) -> str:
    # Dietro un singolo proxy fidato (Vercel), l'ultimo valore della catena
    # X-Forwarded-For è quello aggiunto dal proxy stesso; i valori precedenti
    # possono essere impostati liberamente dal client e non vanno fidati.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest, request: Request) -> AnalyzeResponse:
    transcript = normalize_transcript(payload.transcript, payload.filename)
    if len(transcript) < MIN_CHARS:
        raise HTTPException(
            status_code=400,
            detail="La trascrizione è vuota o troppo corta per essere analizzata "
            "(servono almeno un paio di scambi).",
        )
    try:
        await enforce_rate_limit(_client_ip(request))
    except RateLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    transcript, truncated = truncate(transcript)
    try:
        analysis, model_used = await analyze_transcript(transcript, payload.language)
    except LLMError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    return AnalyzeResponse(analysis=analysis, truncated=truncated, model_used=model_used)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# In locale FastAPI serve anche il frontend; su Vercel ci pensa il CDN (public/).
PUBLIC_DIR = ROOT / "public"
if PUBLIC_DIR.is_dir():

    @app.get("/", include_in_schema=False)
    async def home() -> FileResponse:
        return FileResponse(PUBLIC_DIR / "index.html")

    app.mount("/", StaticFiles(directory=PUBLIC_DIR), name="static")
