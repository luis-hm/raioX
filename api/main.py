"""API de análises; os dados de captura só atravessam a área temporária."""

import json
import secrets
from pathlib import Path
from typing import Annotated
from zipfile import BadZipFile, ZipFile

from fastapi import Depends, FastAPI, File, HTTPException, Path as ApiPath, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import Enqueue, get_enqueue, get_session, get_upload_dir
from api.limites import validar_limite
from api.models import Analise, Fluxo
from api.schemas import ExplicacaoFluxo, FluxoTabela, PaginaFluxos, StatusAnalise, serializar_fluxo
from core.explicar import explicar
from core.zip_capturas import ASSINATURAS, listar_capturas

MAX_UPLOAD_BYTES = 200_000_000
CHUNK_BYTES = 1024 * 1024
SIGNATURES = ASSINATURAS
CLASSES = {"chat", "email", "transferencia", "streaming", "voip"}
MODELS = {"B1", "B2", "P"}


def _novo_id(session: Session) -> str:
    for _ in range(10):
        candidate = secrets.token_urlsafe(9)
        if session.get(Analise, candidate) is None:
            return candidate
    raise HTTPException(503, "Não foi possível iniciar a análise")


def _analise(session: Session, analise_id: str) -> Analise:
    result = session.get(Analise, analise_id)
    if result is None:
        raise HTTPException(404, "Análise não encontrada")
    return result


def _criar_e_enfileirar(session: Session, enqueue: Enqueue, origem: str, referencia: str,
                        n_arquivos_zip: int | None = None) -> str:
    analise_id = _novo_id(session)
    session.add(Analise(id=analise_id, origem=origem, estado="recebida",
                        n_arquivos_zip=n_arquivos_zip))
    try:
        session.commit()
        enqueue(analise_id, origem, referencia)
    except Exception:
        session.rollback()
        try:
            persisted = session.get(Analise, analise_id)
            if persisted is not None:
                session.delete(persisted)
                session.commit()
        except Exception:
            session.rollback()
        raise HTTPException(503, "Não foi possível agendar a análise") from None
    return analise_id


def _palpites(fluxo: Fluxo, seed: int) -> dict:
    return (fluxo.previsoes_por_semente or {}).get(str(seed), {})


def _estabilidade(fluxo: Fluxo) -> dict[str, int]:
    predictions = fluxo.previsoes_por_semente or {}
    result: dict[str, int] = {}
    for model in MODELS:
        values = [row[model]["classe_prevista"] for row in predictions.values() if model in row]
        result[model] = max((values.count(value) for value in set(values)), default=0)
    return result


def create_app(*, session_dependency=None, enqueue_dependency=None,
               upload_dir: Path | None = None, biblioteca_path: Path | None = None,
               rate_counter=None, rate_secret: str | None = None) -> FastAPI:
    app = FastAPI()
    app.state.rate_counter = rate_counter
    app.state.rate_secret = rate_secret
    if session_dependency is not None:
        app.dependency_overrides[get_session] = session_dependency
    if enqueue_dependency is not None:
        app.dependency_overrides[get_enqueue] = enqueue_dependency
    target_dir = upload_dir or get_upload_dir()
    library = biblioteca_path or Path(__file__).resolve().parents[1] / "exemplos" / "biblioteca.json"

    @app.post("/api/analises", status_code=202)
    async def upload_analise(
        arquivo: Annotated[UploadFile, File()],
        _: Annotated[None, Depends(validar_limite)],
        session: Annotated[Session, Depends(get_session)],
        enqueue: Annotated[Enqueue, Depends(get_enqueue)],
    ) -> dict[str, str]:
        suffix = Path(arquivo.filename or "").suffix.lower()
        if suffix not in (*SIGNATURES, ".zip"):
            raise HTTPException(400, "Formato esperado: .pcap, .pcapng ou .zip")
        target = target_dir / f"{secrets.token_hex(20)}{suffix}"
        size = 0
        signature = b""
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as output:
                while chunk := await arquivo.read(CHUNK_BYTES):
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, "Arquivo excede 200 MB")
                    if len(signature) < 4:
                        signature += chunk[:4 - len(signature)]
                    output.write(chunk)
            n_arquivos_zip = None
            if suffix == ".zip":
                try:
                    with ZipFile(target) as lote:
                        n_arquivos_zip = len(listar_capturas(lote))
                except (BadZipFile, ValueError, OSError) as exc:
                    raise HTTPException(400, str(exc) if isinstance(exc, ValueError)
                                        else "ZIP inválido") from None
            elif signature not in SIGNATURES[suffix]:
                raise HTTPException(400, "Arquivo inválido para a extensão informada")
            return {"id": _criar_e_enfileirar(session, enqueue, "upload", str(target),
                                                n_arquivos_zip)}
        except Exception as exc:
            target.unlink(missing_ok=True)
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(503, "Não foi possível receber a análise") from None
        finally:
            await arquivo.close()

    @app.post("/api/analises/exemplo/{nome}", status_code=202)
    async def exemplo_analise(
        nome: str,
        _: Annotated[None, Depends(validar_limite)],
        session: Annotated[Session, Depends(get_session)],
        enqueue: Annotated[Enqueue, Depends(get_enqueue)],
    ) -> dict[str, str]:
        with library.open(encoding="utf-8") as source:
            names = {item["categoria_captura"] for item in json.load(source)["exemplos"]}
        if nome not in names:
            raise HTTPException(404, "Exemplo não encontrado")
        return {"id": _criar_e_enfileirar(session, enqueue, "exemplo", nome)}

    @app.get("/api/analises/{id}", response_model=StatusAnalise)
    async def status_analise(id: str, session: Annotated[Session, Depends(get_session)]):
        return _analise(session, id)

    @app.get("/api/analises/{id}/fluxos", response_model=PaginaFluxos)
    async def listar_fluxos(
        id: str,
        session: Annotated[Session, Depends(get_session)],
        pagina: Annotated[int, Query(ge=1)] = 1,
        tamanho: Annotated[int, Query(ge=1, le=100)] = 20,
        semente: Annotated[int, Query(ge=0, le=4)] = 0,
        classe: Annotated[str | None, Query()] = None,
        modelo: Annotated[str, Query()] = "p",
        discordam: bool = False,
        ordem: str = "-n_pacotes_guardados",
    ):
        analise = _analise(session, id)
        model = modelo.upper()
        if model not in MODELS or (classe is not None and classe not in CLASSES):
            raise HTTPException(422, "Filtro inválido")
        orders = {"n": Fluxo.n, "ini_s": Fluxo.ini_s,
                  "n_pacotes_guardados": Fluxo.n_pacotes_guardados}
        descending = ordem.startswith("-")
        order_column = orders.get(ordem.lstrip("-"))
        if order_column is None:
            raise HTTPException(422, "Ordenação inválida")
        query = select(Fluxo).where(Fluxo.analise_id == id, Fluxo.principal.is_(True))
        # JSONB/SQLite JSON têm operadores diferentes; o limite por análise é 500.
        rows = session.scalars(query).all()
        filtered = []
        for row in rows:
            picks = _palpites(row, semente)
            if classe is not None and picks.get(model, {}).get("classe_prevista") != classe:
                continue
            if discordam and len({p.get("classe_prevista") for p in picks.values() if isinstance(p, dict)}) < 2:
                continue
            filtered.append(row)
        key = order_column.key
        filtered.sort(key=lambda row: (getattr(row, key), row.n), reverse=descending)
        total = len(filtered)
        offset = (pagina - 1) * tamanho
        items = [FluxoTabela.model_validate({
            **{field: getattr(row, field) for field in FluxoTabela.model_fields if field not in
               {"previsoes", "estabilidade", "rotulo_referencia"}},
            "previsoes": _palpites(row, semente),
            "estabilidade": _estabilidade(row),
            "rotulo_referencia": row.rotulo_referencia if analise.origem == "exemplo" else None,
        }) for row in filtered[offset:offset + tamanho]]
        return PaginaFluxos(itens=items,
                            total=total, pagina=pagina, tamanho=tamanho)

    @app.get("/api/analises/{id}/fluxos/{n}")
    async def detalhe_fluxo(
        id: str,
        n: Annotated[int, ApiPath(ge=0)],
        session: Annotated[Session, Depends(get_session)],
        semente: Annotated[int, Query(ge=0, le=4)] = 0,
    ):
        analise = _analise(session, id)
        fluxo = session.get(Fluxo, (id, n))
        if fluxo is None:
            raise HTTPException(404, "Fluxo não encontrado")
        detalhe = serializar_fluxo(fluxo, analise.origem).model_dump(mode="json")
        detalhe["matriz_32x4"] = _matriz_publica(fluxo.pacotes)
        detalhe["previsoes"] = _palpites(fluxo, semente)
        detalhe["estabilidade"] = _estabilidade(fluxo)
        return detalhe

    @app.get("/api/analises/{id}/fluxos/{n}/explicar", response_model=ExplicacaoFluxo)
    async def explicar_fluxo(
        id: str,
        n: Annotated[int, ApiPath(ge=0)],
        session: Annotated[Session, Depends(get_session)],
        semente: Annotated[int, Query(ge=0, le=4)] = 0,
    ):
        _analise(session, id)
        fluxo = session.get(Fluxo, (id, n))
        if fluxo is None:
            raise HTTPException(404, "Fluxo não encontrado")
        if not fluxo.principal:
            raise HTTPException(422, "Fluxo extra não tem previsões para explicar")
        if fluxo.n_pacotes_guardados < 3 or len(fluxo.pacotes) < 3:
            raise HTTPException(422, "Fluxo precisa de pelo menos três pacotes guardados")
        try:
            return explicar(fluxo.pacotes, semente)
        except ValueError:
            raise HTTPException(422, "Não foi possível explicar os metadados do fluxo") from None

    return app


def _matriz_publica(pacotes: list[list[float]]) -> list[list[float]]:
    """A matriz do detalhe usa somente os trios anônimos já persistidos."""
    from core.matriz import montar_matriz

    return montar_matriz(
        [row[0] for row in pacotes],
        [row[1] for row in pacotes],
        [row[2] for row in pacotes],
    ).tolist()


app = create_app()
