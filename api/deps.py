"""Dependências substituíveis da API."""

import os
from collections.abc import Callable
from pathlib import Path
from tempfile import gettempdir

from api.database import create_session_factory, get_engine


async def get_session():
    with create_session_factory(get_engine())() as session:
        yield session


Enqueue = Callable[[str, str, str], object]


def get_upload_dir() -> Path:
    return Path(os.environ.get("RAIOX_UPLOAD_DIR", str(Path(gettempdir()) / "raiox-uploads")))


async def get_enqueue() -> Enqueue:
    """Fila real criada somente em uma requisição; testes injetam um fake."""
    from redis import Redis
    from rq import Queue

    queue = Queue("raiox", connection=Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0")))

    def enqueue(analise_id: str, origem: str, referencia: str) -> object:
        return queue.enqueue(
            "worker.tasks.processar_analise", analise_id, origem, referencia,
            job_timeout=300,
        )

    return enqueue
