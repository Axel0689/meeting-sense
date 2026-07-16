"""Estrazione strutturata via OpenRouter (API compatibile OpenAI, modelli :free)."""

import json
import os
import re

import httpx

from .models import MeetingAnalysis

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_CHARS = 30_000  # limite prudente per il contesto dei modelli free

SYSTEM_PROMPT = """\
Sei MeetingSense, un assistente che analizza trascrizioni di riunioni aziendali.
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, conforme a questo schema:
{
  "summary": "riassunto discorsivo della riunione (3-6 frasi)",
  "key_points": ["punto discusso 1", "..."],
  "decisions": ["decisione presa 1", "..."],
  "action_items": [{"task": "cosa fare", "assignee": "nome della persona o 'Non assegnato'", "due_hint": "scadenza citata o null"}],
  "follow_ups": ["follow-up suggerito 1", "..."],
  "participants": ["nomi dedotti dalla trascrizione"],
  "risks": ["rischio o blocker 1", "..."],
  "open_questions": ["domanda rimasta senza risposta 1", "..."],
  "metrics": [{"label": "nome della metrica", "value": "valore citato così come detto", "context": "nota breve o null"}]
}
Regole:
- Scrivi nella stessa lingua della trascrizione.
- Riporta solo decisioni realmente prese, non ipotesi discusse.
- Assegna gli action item alla persona corretta quando è chiaro dal contesto.
- In follow_ups suggerisci 2-4 passi successivi utili (verifiche, riunioni, comunicazioni).
- In risks elenca problemi, ostacoli, dipendenze o preoccupazioni emersi durante la
  discussione, anche se nessuno li ha definiti esplicitamente "rischi".
- In open_questions riporta SOLO domande realmente poste a voce da un partecipante
  durante la riunione e rimaste senza risposta chiara o completa. Non inventare
  domande che nessuno ha posto, anche se ti sembrano rilevanti: se non sei sicuro
  che una domanda sia stata posta esplicitamente nel testo, non includerla.
- In metrics estrai SOLO numeri, importi, percentuali, date o obiettivi citati
  esplicitamente nella trascrizione (es. budget, KPI, scadenze, target). value è il
  valore così come detto, senza arrotondare o convertire unità. Non inventare
  metriche non citate nel testo.
- Se una sezione non ha contenuti, usa una lista vuota."""


class LLMError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _models() -> list[str]:
    primary = os.environ.get("LLM_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
    fallback = os.environ.get("LLM_FALLBACK_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")
    return [primary] + ([fallback] if fallback and fallback != primary else [])


def _extract_json(content: str) -> str:
    """I modelli free a volte avvolgono il JSON in ```fence``` o testo: isola l'oggetto."""
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", content, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start, end = content.find("{"), content.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("nessun oggetto JSON nella risposta")
    return content[start : end + 1]


def truncate(transcript: str) -> tuple[str, bool]:
    if len(transcript) <= MAX_CHARS:
        return transcript, False
    return transcript[:MAX_CHARS], True


async def _call_model(client: httpx.AsyncClient, model: str, transcript: str, api_key: str) -> str:
    response = await client.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://meetingsense.vercel.app",
            "X-Title": "MeetingSense",
        },
        json={
            "model": model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Trascrizione della riunione:\n\n{transcript}"},
            ],
        },
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


async def analyze_transcript(transcript: str) -> tuple[MeetingAnalysis, str]:
    """Ritorna (analisi, modello usato). Prova il modello primario e, su rate
    limit o errore server, il fallback; ritenta una volta se il JSON è malformato."""
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise LLMError(
            "OPENROUTER_API_KEY non configurata: crea una chiave gratuita su openrouter.ai "
            "e impostala nel file .env (o nelle variabili d'ambiente su Vercel).",
            status_code=500,
        )

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=90) as client:
        for model in _models():
            for _attempt in range(2):  # secondo tentativo se il JSON non valida
                try:
                    content = await _call_model(client, model, transcript, api_key)
                    analysis = MeetingAnalysis.model_validate_json(_extract_json(content))
                    return analysis, model
                except httpx.HTTPStatusError as e:
                    last_error = e
                    if e.response.status_code in (401, 403):
                        raise LLMError("Chiave OpenRouter non valida o senza permessi.", 500)
                    break  # 429/5xx: passa al modello di fallback
                except (ValueError, json.JSONDecodeError) as e:
                    last_error = e  # JSON malformato: ritenta lo stesso modello
                except httpx.HTTPError as e:
                    last_error = e
                    break

    if isinstance(last_error, httpx.HTTPStatusError) and last_error.response.status_code == 429:
        raise LLMError(
            "I modelli gratuiti sono momentaneamente saturi (rate limit). Riprova tra qualche minuto.",
            status_code=503,
        )
    print(f"[MeetingSense] analisi fallita, ultimo errore: {last_error!r}")
    raise LLMError(
        "Analisi non riuscita per un errore imprevisto. Riprova tra qualche minuto.",
        status_code=502,
    )
