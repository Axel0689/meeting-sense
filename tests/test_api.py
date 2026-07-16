import pytest
from fastapi.testclient import TestClient

from api.index import app
from app.models import MeetingAnalysis
from app.parsing import normalize_transcript

client = TestClient(app)


@pytest.fixture(autouse=True)
def disable_rate_limit(monkeypatch):
    """I test non devono dipendere né consumare la quota reale di Upstash
    (che può essere configurata in .env per lo sviluppo locale)."""

    async def noop(client_ip: str):
        return None

    monkeypatch.setattr("api.index.enforce_rate_limit", noop)


SAMPLE_VTT = """WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Anna Rossi>Buongiorno a tutti, iniziamo con il budget.

2
00:00:04.500 --> 00:00:08.000
<v Marco Bianchi>Ok. Propongo di approvare i 50k per il Q3.

3
00:00:08.500 --> 00:00:10.000
<v Marco Bianchi>Ok. Propongo di approvare i 50k per il Q3.

4
00:00:10.500 --> 00:00:12.000
<v Anna Rossi>Sì

00:00:12.500 --> 00:00:15.000
Approvato. Marco prepara il report entro venerdì.
"""


def test_parse_vtt_extracts_speakers_and_dedupes():
    result = normalize_transcript(SAMPLE_VTT, "riunione.vtt")
    lines = result.splitlines()
    assert lines[0] == "Anna Rossi: Buongiorno a tutti, iniziamo con il budget."
    # la battuta ripetuta (caption rolling) compare una volta sola
    assert lines.count("Marco Bianchi: Ok. Propongo di approvare i 50k per il Q3.") == 1
    # battute di una sola parola non vengono scartate
    assert "Anna Rossi: Sì" in lines
    # cue senza voice tag mantenute come testo semplice
    assert "Approvato. Marco prepara il report entro venerdì." in lines
    # nessun residuo di timestamp o header
    assert "-->" not in result and "WEBVTT" not in result


def test_plain_text_passthrough():
    text = "Anna: ciao\nMarco: ciao a te"
    assert normalize_transcript(text, "note.txt") == text


FAKE_ANALYSIS = MeetingAnalysis(
    summary="Riunione sul budget Q3.",
    key_points=["Budget Q3"],
    decisions=["Approvati 50k per il Q3"],
    action_items=[{"task": "Preparare il report", "assignee": "Marco Bianchi", "due_hint": "venerdì"}],
    follow_ups=["Verificare il report la prossima settimana"],
    participants=["Anna Rossi", "Marco Bianchi"],
    risks=["Il fornitore attuale ha già causato ritardi in passato"],
    open_questions=["Chi copre le ferie di Marco durante il lancio?"],
    metrics=[{"label": "Budget Q3", "value": "50.000€", "context": "approvato per il Q3"}],
)


@pytest.fixture
def mock_llm(monkeypatch):
    async def fake_analyze(transcript: str):
        return FAKE_ANALYSIS, "test-model"

    monkeypatch.setattr("api.index.analyze_transcript", fake_analyze)


def test_analyze_endpoint(mock_llm):
    resp = client.post("/api/analyze", json={"transcript": SAMPLE_VTT, "filename": "call.vtt"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis"]["decisions"] == ["Approvati 50k per il Q3"]
    assert body["analysis"]["action_items"][0]["assignee"] == "Marco Bianchi"
    assert body["analysis"]["risks"] == ["Il fornitore attuale ha già causato ritardi in passato"]
    assert body["analysis"]["open_questions"] == ["Chi copre le ferie di Marco durante il lancio?"]
    assert body["analysis"]["metrics"][0]["label"] == "Budget Q3"
    assert body["analysis"]["metrics"][0]["value"] == "50.000€"
    assert body["model_used"] == "test-model"
    assert body["truncated"] is False


def test_analyze_rejects_short_input(mock_llm):
    resp = client.post("/api/analyze", json={"transcript": "ciao"})
    assert resp.status_code == 400


def test_analyze_returns_429_when_rate_limited(mock_llm, monkeypatch):
    from app.ratelimit import RateLimitExceeded

    async def fake_enforce(client_ip: str):
        raise RateLimitExceeded("ip", "limite raggiunto")

    monkeypatch.setattr("api.index.enforce_rate_limit", fake_enforce)
    resp = client.post("/api/analyze", json={"transcript": SAMPLE_VTT, "filename": "call.vtt"})
    assert resp.status_code == 429
    assert "limite raggiunto" in resp.json()["detail"]


def test_missing_api_key_returns_clear_error(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    long_text = "Anna: parliamo del progetto.\nMarco: ok, direi di iniziare dal backend.\n" * 5
    resp = client.post("/api/analyze", json={"transcript": long_text})
    assert resp.status_code == 500
    assert "OPENROUTER_API_KEY" in resp.json()["detail"]


def test_analyze_rejects_oversized_transcript(mock_llm):
    resp = client.post("/api/analyze", json={"transcript": "a" * 300_001})
    assert resp.status_code == 422


def test_security_headers_present(mock_llm):
    resp = client.post("/api/analyze", json={"transcript": SAMPLE_VTT, "filename": "call.vtt"})
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"


def test_client_ip_uses_last_forwarded_value():
    from api.index import _client_ip

    class FakeRequest:
        headers = {"x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3"}
        client = None

    # il primo valore è impostabile liberamente dal client: va usato l'ultimo,
    # aggiunto dal proxy fidato (Vercel)
    assert _client_ip(FakeRequest()) == "3.3.3.3"
