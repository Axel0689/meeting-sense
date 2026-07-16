import httpx
import pytest

from app import ratelimit


@pytest.fixture(autouse=True)
def clear_upstash_env(monkeypatch):
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)


async def test_enforce_is_noop_when_unconfigured():
    # nessuna eccezione attesa: senza Upstash il rate limit è disattivato
    await ratelimit.enforce("1.2.3.4")


async def test_enforce_raises_on_ip_limit(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://fake-upstash.example")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    monkeypatch.setattr(ratelimit, "IP_DAILY_LIMIT", 2)
    monkeypatch.setattr(ratelimit, "GLOBAL_DAILY_LIMIT", 1000)

    calls = {"count": 0}

    async def fake_incr(client, base_url, token, key):
        if "ip:" in key:
            calls["count"] += 1
            return calls["count"]
        return 1  # contatore globale sempre basso

    monkeypatch.setattr(ratelimit, "_incr_with_ttl", fake_incr)

    await ratelimit.enforce("9.9.9.9")  # 1a richiesta: ok
    await ratelimit.enforce("9.9.9.9")  # 2a richiesta: al limite, ok
    with pytest.raises(ratelimit.RateLimitExceeded) as exc_info:
        await ratelimit.enforce("9.9.9.9")  # 3a richiesta: supera il limite
    assert exc_info.value.scope == "ip"


async def test_enforce_raises_on_global_limit(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://fake-upstash.example")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    monkeypatch.setattr(ratelimit, "IP_DAILY_LIMIT", 1000)
    monkeypatch.setattr(ratelimit, "GLOBAL_DAILY_LIMIT", 1)

    async def fake_incr(client, base_url, token, key):
        return 2 if "global:" in key else 1

    monkeypatch.setattr(ratelimit, "_incr_with_ttl", fake_incr)

    with pytest.raises(ratelimit.RateLimitExceeded) as exc_info:
        await ratelimit.enforce("1.1.1.1")
    assert exc_info.value.scope == "global"


async def test_enforce_fails_open_on_upstash_error(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://fake-upstash.example")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "fake-token")

    async def failing_incr(client, base_url, token, key):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(ratelimit, "_incr_with_ttl", failing_incr)

    # Upstash irraggiungibile: non deve bloccare l'utente
    await ratelimit.enforce("1.1.1.1")


def test_hash_ip_is_deterministic_and_not_plaintext():
    h1 = ratelimit._hash_ip("192.168.1.1")
    h2 = ratelimit._hash_ip("192.168.1.1")
    assert h1 == h2
    assert "192.168.1.1" not in h1
