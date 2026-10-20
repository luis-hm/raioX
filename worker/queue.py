"""Configuração da fila RQ compartilhada pelo processo do worker."""

import os

from redis import Redis
from rq import Queue, Worker

QUEUE_NAME = "raiox"
JOB_TIMEOUT_SECONDS = 300


def criar_fila(connection=None):
    connection = connection or Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
    return Queue(QUEUE_NAME, connection=connection, default_timeout=JOB_TIMEOUT_SECONDS)


def enfileirar(analise_id: str, origem: str, referencia: str, *, queue=None):
    fila = queue or criar_fila()
    return fila.enqueue("worker.tasks.processar_analise", analise_id, origem, referencia,
                        job_timeout=JOB_TIMEOUT_SECONDS)


def main():
    fila = criar_fila()
    Worker([fila], connection=fila.connection).work()


if __name__ == "__main__":
    main()
