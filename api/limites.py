"""Rate limit distribuído para criações de análise, sem persistir IPs."""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Protocol

from fastapi import HTTPException, Request

MAX_ANALISES_POR_HORA = 10
JANELA_SEGUNDOS = 3600
CHAVE_REDIS = "raiox:rate:v1:"


class Contador(Protocol):
    def eval(self, script: str, numkeys: int, *keys_and_args: object) -> int: ...
    def ttl(self, key: str) -> int: ...


def chave_cliente(ip: str, segredo: str) -> str:
    """Chave unidirecional; IP bruto nunca vira chave de armazenamento/log."""
    digest = hmac.new(segredo.encode(), ip.encode(), hashlib.sha256).hexdigest()
    return CHAVE_REDIS + digest


def redis_contador() -> Contador:
    from redis import Redis

    return Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))


def _permitir(contador: Contador, ip: str, segredo: str) -> None:
    key = chave_cliente(ip, segredo)
    # INCR é atômico. A criação da janela é atômica via SET NX; o pequeno
    # script evita que duas primeiras requisições reiniciem o prazo.
    if hasattr(contador, "eval"):
        value = contador.eval(
            "local n=redis.call('INCR',KEYS[1]); "
            "if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; "
            "return n",
            1, key, JANELA_SEGUNDOS,
        )
        ttl = contador.ttl(key)
    else:
        # Test fakes provide this atomic operation; production always uses Lua.
        value, ttl = contador.incrementar_janela(key, JANELA_SEGUNDOS)
    if int(value) > MAX_ANALISES_POR_HORA:
        raise HTTPException(
            status_code=429,
            detail="Limite de análises atingido. Tente novamente mais tarde.",
            headers={"Retry-After": str(max(1, int(ttl)))},
        )


async def validar_limite(request: Request) -> None:
    """FastAPI dependency; contador/segredo podem ser substituídos em testes."""
    segredo = getattr(request.app.state, "rate_secret", None) or os.environ.get("RAIOX_RATE_SECRET")
    if not segredo:
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível")
    client = request.client
    ip = client.host if client else "unknown"
    # Em produção a API só é alcançada pelo proxy do Next, que repassa o IP do visitante;
    # sem isso, todos os visitantes dividiriam o limite do IP do container web.
    if os.environ.get("RAIOX_CONFIAR_PROXY") == "1":
        ip = request.headers.get("x-raiox-client-ip", "").strip() or ip
    try:
        contador = getattr(request.app.state, "rate_counter", None) or redis_contador()
        _permitir(contador, ip, segredo)
    except HTTPException:
        raise
    except Exception:
        # Fail closed while keeping Redis details out of the public response.
        raise HTTPException(
            status_code=503,
            detail="Serviço temporariamente indisponível",
        ) from None

