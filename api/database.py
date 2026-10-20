"""Conexão configurável e sessão para injeção na API e no worker."""

import os
from functools import lru_cache
from typing import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL não configurada")
    return url


def create_database_engine(url: str | None = None, **kwargs: object) -> Engine:
    engine = create_engine(url or get_database_url(), pool_pre_ping=True, **kwargs)
    if engine.dialect.name == "sqlite":
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection: object, record: object) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_database_engine()


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Dependência FastAPI; testes podem sobrescrevê-la com outra factory."""
    with create_session_factory(get_engine())() as session:
        yield session
