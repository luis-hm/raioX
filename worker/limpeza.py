"""Rotina idempotente de retenção de análises e uploads órfãos."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.database import create_session_factory, get_engine
from api.models import Analise
from api.deps import get_upload_dir

IDADE_ORFAO = timedelta(hours=1)
NOME_UPLOAD = re.compile(r"[0-9a-f]{40}\.(?:pcap|pcapng|zip)\Z")


def _arquivos_seguros(diretorio: Path, agora: datetime, idade_minima: timedelta):
    """Yield only old regular files directly inside the configured directory."""
    try:
        base = diretorio.resolve(strict=True)
    except (FileNotFoundError, OSError, RuntimeError):
        return
    if diretorio.is_symlink() or not base.is_dir():
        return
    corte = agora.timestamp() - idade_minima.total_seconds()
    for candidato in base.iterdir():
        try:
            if (not NOME_UPLOAD.fullmatch(candidato.name) or candidato.is_symlink()
                    or not candidato.is_file()):
                continue
            resolvido = candidato.resolve(strict=True)
            if resolvido.parent != base or resolvido != candidato.absolute():
                continue
            if candidato.stat(follow_symlinks=False).st_mtime <= corte:
                yield candidato
        except (FileNotFoundError, OSError, RuntimeError):
            continue


def limpar_expiradas(session: Session, *, agora: datetime | None = None) -> int:
    instante = agora or datetime.now(timezone.utc)
    if instante.utcoffset() is None:
        raise ValueError("agora precisa conter fuso horário")
    instante = instante.astimezone(timezone.utc)
    ids = session.scalars(select(Analise.id).where(Analise.expira_em <= instante)).all()
    if not ids:
        return 0
    # ORM cascade assegura exclusão em SQLite e PostgreSQL.
    rows = session.scalars(select(Analise).where(Analise.id.in_(ids))).all()
    for row in rows:
        session.delete(row)
    session.commit()
    return len(rows)


def limpar_uploads_orfaos(diretorio: Path, *, agora: datetime | None = None,
                           idade_minima: timedelta = IDADE_ORFAO) -> int:
    instante = agora or datetime.now(timezone.utc)
    removidos = 0
    for candidato in _arquivos_seguros(Path(diretorio), instante, idade_minima):
        try:
            candidato.unlink()
            removidos += 1
        except FileNotFoundError:
            continue
    return removidos


def executar_limpeza(*, session_factory=None, upload_dir: Path, agora: datetime | None = None,
                     idade_minima: timedelta = IDADE_ORFAO) -> dict[str, int]:
    factory = session_factory or create_session_factory(get_engine())
    with factory() as session:
        analises = limpar_expiradas(session, agora=agora)
    arquivos = limpar_uploads_orfaos(upload_dir, agora=agora, idade_minima=idade_minima)
    return {"analises": analises, "uploads": arquivos}


def main() -> None:
    resultado = executar_limpeza(upload_dir=get_upload_dir())
    print(f"Limpeza concluída: {resultado['analises']} análises e "
          f"{resultado['uploads']} uploads órfãos removidos.")


if __name__ == "__main__":
    main()

