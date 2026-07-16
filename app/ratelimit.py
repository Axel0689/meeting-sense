"""Limiti giornalieri (globale + per IP) per proteggere la quota gratuita di
OpenRouter quando l'app è pubblica. Contatori su Upstash Redis (REST, adatto
a Vercel serverless): se non configurato, il rate limit è disattivato
(comodo in locale, senza dover creare un account Upstash per sviluppare)."""

import hashlib
import os
from datetime import datetime, timedelta, timezone

import httpx

GLOBAL_DAILY_LIMIT = int(os.environ.get("DAILY_GLOBAL_LIMIT", "200"))
IP_DAILY_LIMIT = int(os.environ.get("DAILY_IP_LIMIT", "6"))


class RateLimitExceeded(Exception):
    def __init__(self, scope: str, message: str):
        super().__init__(message)
        self.scope = scope  # "ip" | "global"


def _seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((tomorrow - now).total_seconds())


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


async def _incr_with_ttl(client: httpx.AsyncClient, base_url: str, token: str, key: str) -> int:
    response = await client.post(
        f"{base_url}/pipeline",
        headers={"Authorization": f"Bearer {token}"},
        json=[["INCR", key], ["EXPIRE", key, str(_seconds_until_utc_midnight()), "NX"]],
    )
    response.raise_for_status()
    return response.json()[0]["result"]


async def enforce(client_ip: str) -> None:
    """Incrementa i contatori giornalieri e solleva RateLimitExceeded se un
    limite è superato. Se Upstash non è configurato, non fa nulla (fail-open):
    utile in locale; se Upstash è irraggiungibile in produzione, fallisce
    comunque aperto per non rendere il rate limiter un punto di rottura."""
    base_url = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
    if not base_url or not token:
        return

    today = _today()
    global_key = f"ms:global:{today}"
    ip_key = f"ms:ip:{_hash_ip(client_ip)}:{today}"

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            global_count = await _incr_with_ttl(client, base_url, token, global_key)
            ip_count = await _incr_with_ttl(client, base_url, token, ip_key)
    except httpx.HTTPError:
        return

    if global_count > GLOBAL_DAILY_LIMIT:
        raise RateLimitExceeded(
            "global",
            "Il servizio ha raggiunto il limite di analisi gratuite per oggi. Riprova domani.",
        )
    if ip_count > IP_DAILY_LIMIT:
        raise RateLimitExceeded(
            "ip",
            f"Hai raggiunto il limite di {IP_DAILY_LIMIT} analisi giornaliere per questa demo. Riprova domani.",
        )
