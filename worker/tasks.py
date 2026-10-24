"""Processa uma análise enfileirada e persiste apenas resultados anônimos."""

import json
import re
import secrets
from collections import Counter, defaultdict
from pathlib import Path
from time import monotonic
from zipfile import ZipFile

import numpy as np
from redis import Redis

from api.database import create_session_factory, get_engine
from api.deps import get_upload_dir
from api.models import Analise, Fluxo
from core.analisar import classificar_sementes, montar_matrizes
from core.extracao import TETO, TETO_PRINCIPAL, extrair_fluxos
from core.matriz import CLASSES
from core.zip_capturas import listar_capturas

MODELOS = ("B1", "B2", "P")
SEMENTES = tuple(range(5))
VERSAO_MODELOS = "N/100%; sementes 0-4; reconstrução local"
NOME_UPLOAD = re.compile(r"[0-9a-f]{40}\.(?:pcap|pcapng|zip)\Z")
LOCK_KEY = "raiox:worker:lock:v1"
LOCK_SECONDS = 360
LOCK_WAIT_SECONDS = 240


def _redis_connection():
    import os
    return Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))


def _arquivo_interno(referencia, upload_dir):
    """Aceita somente um arquivo comum, gerado pela API, no diretório configurado."""
    base = Path(upload_dir).resolve()
    candidato = Path(referencia)
    if (not NOME_UPLOAD.fullmatch(candidato.name) or candidato.is_symlink()
            or candidato.resolve().parent != base or not candidato.is_file()):
        raise ValueError("upload inválido")
    return candidato


def _exemplo(nome, biblioteca_path):
    with Path(biblioteca_path).open(encoding="utf-8") as arquivo:
        biblioteca = json.load(arquivo)
    item = next((x for x in biblioteca["exemplos"] if x["categoria_captura"] == nome), None)
    if item is None or nome not in CLASSES:
        raise ValueError("exemplo inválido")
    matriz = np.asarray(item["matriz_32x4"], dtype=np.float32)
    pacotes = item["pacotes"]
    if matriz.shape != (32, 4) or not 3 <= len(pacotes) <= 100:
        raise ValueError("exemplo inválido")
    _trios(pacotes)
    if (not np.isfinite(matriz).all()
            or not set(item["sementes_no_treino"]) <= set(SEMENTES)):
        raise ValueError("exemplo inválido")
    return item, matriz.reshape(1, 32, 4)


def _trios(pacotes):
    result = []
    for trio in pacotes[:100]:
        if len(trio) != 3:
            raise ValueError("metadados inválidos")
        tamanho, direcao, tempo = map(float, trio)
        if (not all(np.isfinite((tamanho, direcao, tempo))) or tamanho < 0
                or direcao not in (-1, 1) or tempo < 0):
            raise ValueError("metadados inválidos")
        result.append([int(tamanho), int(direcao), tempo])
    return result


def _palpites(previsoes, indice):
    return {str(seed): {modelo: previsoes[seed][indice][modelo] for modelo in MODELOS}
            for seed in SEMENTES}


def _resumos(previsoes, series, principais):
    resultado = {}
    for seed in SEMENTES:
        contagens = {modelo: Counter() for modelo in MODELOS}
        concordancia = Counter()
        pares = {f"{a}_{b}": {"iguais": 0, "diferentes": 0}
                 for i, a in enumerate(MODELOS) for b in MODELOS[i + 1:]}
        serie = defaultdict(int)
        for indice in range(principais):
            escolhas = [previsoes[seed][indice][modelo]["classe_prevista"] for modelo in MODELOS]
            for modelo, classe in zip(MODELOS, escolhas):
                contagens[modelo][classe] += 1
            concordancia["todos" if len(set(escolhas)) == 1 else "discordam"] += 1
            for i, a in enumerate(MODELOS):
                for b in MODELOS[i + 1:]:
                    pares[f"{a}_{b}"]["iguais" if escolhas[i] == escolhas[MODELOS.index(b)]
                                      else "diferentes"] += 1
        for fluxo in series:
            for segundo, bytes_observados in fluxo.items():
                serie[int(segundo)] += int(bytes_observados)
        resultado[str(seed)] = {
            "contagens": {modelo: dict(contagens[modelo]) for modelo in MODELOS},
            "concordancia": dict(concordancia),
            "concordancia_pares": pares,
            "serie_temporal": [{"segundo": s, "bytes_observados": serie[s]}
                              for s in sorted(serie)],
        }
    return resultado


def _fluxo(analise_id, indice, proto, ini, pacotes, principal, previsoes,
           rotulo=None, duracao=None):
    trios = _trios(pacotes)
    return Fluxo(
        analise_id=analise_id, n=indice, proto=int(proto), ini_s=max(0.0, float(ini)),
        duracao_s=None if duracao is None else max(0.0, float(duracao)),
        principal=principal, n_pacotes_guardados=len(trios),
        bytes_amostra_cliente=sum(p[0] for p in trios if p[1] == 1),
        bytes_amostra_servidor=sum(p[0] for p in trios if p[1] == -1),
        pacotes=trios, previsoes_por_semente=_palpites(previsoes, indice) if principal else None,
        rotulo_referencia=rotulo,
    )


def _extrair_lote_zip(destino, extrair, atualizar, limite, esperado):
    """Lê um membro de cada vez; nunca usa o nome do ZIP como caminho de saída."""
    partes = []
    pacotes_lidos = 0
    motivo = "fim_do_lote"
    with ZipFile(destino) as lote:
        membros = listar_capturas(lote)
        if len(membros) != esperado:
            raise ValueError("lote alterado")
        for info in membros:
            if monotonic() >= limite:
                raise TimeoutError("tempo de processamento excedido")
            temporario = destino.parent / f"{secrets.token_hex(20)}{Path(info.filename).suffix.lower()}"
            try:
                tamanho = 0
                with lote.open(info) as entrada, temporario.open("xb") as saida:
                    while bloco := entrada.read(1024 * 1024):
                        tamanho += len(bloco)
                        if tamanho > info.file_size or monotonic() >= limite:
                            raise ValueError("captura ZIP inválida ou tempo excedido")
                        saida.write(bloco)
                if tamanho != info.file_size:
                    raise ValueError("captura ZIP incompleta")
                def progresso(lidos, validos):
                    atualizar(pacotes_lidos + lidos,
                             min(TETO, sum(len(parte["n"]) for parte in partes) + validos))
                dados, leitura = extrair(temporario, progresso=progresso, prazo=limite)
                pacotes_lidos += int(leitura["pacotes_lidos"])
                dados["serie"] = []
                partes.append(dados)
                atualizar(pacotes_lidos, min(TETO, sum(len(parte["n"]) for parte in partes)))
                if leitura["motivo"] == "limite_de_pacotes":
                    motivo = "limite_de_pacotes"
                elif leitura["motivo"] == "teto_de_fluxos" and motivo == "fim_do_lote":
                    motivo = "teto_de_fluxos"
            finally:
                temporario.unlink(missing_ok=True)
    if not partes or not any(len(parte["n"]) for parte in partes):
        raise ValueError("nenhum fluxo válido")
    # Rodízio por arquivo: uma captura grande não ocupa sozinha as 500 previsões.
    indices = []
    for posicao in range(max(len(parte["n"]) for parte in partes)):
        for numero, parte in enumerate(partes):
            if posicao < len(parte["n"]):
                indices.append((numero, posicao))
                if len(indices) == TETO:
                    break
        if len(indices) == TETO:
            break
    chaves = ("pk", "n", "ini", "duracao", "proto")
    dados = {chave: np.stack([partes[numero][chave][posicao] for numero, posicao in indices])
             for chave in chaves}
    # Os segundos de arquivos diferentes não têm origem temporal comum.
    dados["serie"] = []
    if sum(len(parte["n"]) for parte in partes) > TETO:
        motivo = "teto_de_fluxos"
    return dados, {"pacotes_lidos": pacotes_lidos,
                   "motivo": motivo,
                   "duracao_observada_s": None}


def processar_analise(analise_id, origem, referencia, *, session_factory=None,
                     upload_dir=None, biblioteca_path=None, extrair=extrair_fluxos,
                     classificar=classificar_sementes, prazo=None, lock_client=None):
    """Entrada do RQ. Injeções opcionais permitem testar sem Redis ou Postgres."""
    factory = session_factory or create_session_factory(get_engine())
    biblioteca = biblioteca_path or Path(__file__).resolve().parents[1] / "exemplos" / "biblioteca.json"
    destino = None
    lock = None
    inicio = monotonic()
    limite = min(prazo, inicio + 295) if prazo is not None else inicio + 295
    try:
        if origem == "upload":
            # Validar antes de qualquer limpeza: caminho externo jamais é apagado.
            destino = _arquivo_interno(referencia, upload_dir or get_upload_dir())
        elif origem != "exemplo":
            raise ValueError("origem inválida")

        lock_client = lock_client or _redis_connection()
        lock = lock_client.lock(LOCK_KEY, timeout=LOCK_SECONDS,
                                blocking_timeout=LOCK_WAIT_SECONDS)
        if not lock.acquire(blocking=True):
            raise TimeoutError("worker global ocupado")

        with factory() as session:
            row = session.get(Analise, analise_id)
            if row is None or row.origem != origem or row.estado != "recebida":
                raise ValueError("análise indisponível")
            row.estado = "extraindo" if origem == "upload" else "classificando"
            session.commit()

            if origem == "upload":
                def atualizar(lidos, validos):
                    if monotonic() >= limite:
                        raise TimeoutError("tempo de processamento excedido")
                    row.progresso = row.n_pacotes_lidos = int(lidos)
                    row.n_fluxos_principais = min(int(validos), TETO_PRINCIPAL)
                    row.n_fluxos_extras = max(0, int(validos) - TETO_PRINCIPAL)
                    session.commit()

                if destino.suffix == ".zip":
                    if row.n_arquivos_zip is None:
                        raise ValueError("lote não registrado")
                    dados, leitura = _extrair_lote_zip(destino, extrair, atualizar,
                                                        limite, row.n_arquivos_zip)
                else:
                    dados, leitura = extrair(destino, progresso=atualizar, prazo=limite)
                total = len(dados["n"])
                if total == 0:
                    raise ValueError("nenhum fluxo válido")
                principais = min(total, TETO_PRINCIPAL)
                matrizes = montar_matrizes(dados, principais)
                row.estado = "classificando"
                row.progresso = row.n_pacotes_lidos = int(leitura["pacotes_lidos"])
                row.n_fluxos_principais = principais
                row.n_fluxos_extras = total - principais
                row.duracao_observada_s = (None if leitura["duracao_observada_s"] is None
                                           else float(leitura["duracao_observada_s"]))
                row.motivo_parada = leitura["motivo"]
                session.commit()
                # A captura deixa de ser necessária antes da inferência.
                destino.unlink(missing_ok=True)
                destino = None
                series = dados["serie"]
            else:
                item, matrizes = _exemplo(referencia, biblioteca)
                trios = _trios(item["pacotes"])
                row.progresso = row.n_pacotes_lidos = len(trios)
                row.n_fluxos_principais = 1
                row.motivo_parada = "exemplo_preparado"
                row.duracao_observada_s = trios[-1][2] if len(trios) < 100 else None
                session.commit()
                principais = 1
                serie_exemplo = defaultdict(int)
                for tamanho, _, tempo in trios:
                    serie_exemplo[int(tempo)] += tamanho
                series = [serie_exemplo]

            previsoes = classificar(matrizes, prazo=limite)
            if len(previsoes) != 5 or any(len(previsoes[seed]) != principais for seed in SEMENTES):
                raise ValueError("previsões incompletas")
            if monotonic() >= limite:
                raise TimeoutError("tempo de processamento excedido")
            if origem == "upload":
                for i in range(total):
                    n = int(dados["n"][i])
                    session.add(_fluxo(analise_id, i, dados["proto"][i], dados["ini"][i],
                                       dados["pk"][i, :n], i < principais, previsoes,
                                       duracao=dados["duracao"][i]))
            else:
                session.add(_fluxo(analise_id, 0, item["proto"], 0, trios, True, previsoes,
                                   CLASSES.index(referencia),
                                   duracao=trios[-1][2] if len(trios) < 100 else None))
            resumos = _resumos(previsoes, series, principais)
            if origem != "upload":
                # O estudo só mede desempenho no teste; aqui o exemplo foi treino.
                for seed in SEMENTES:
                    resumos[str(seed)]["exemplo_no_treino"] = seed in item["sementes_no_treino"]
            row.resumo_por_semente = resumos
            row.versao_modelos = VERSAO_MODELOS
            row.estado = "pronta"
            row.erro = None
            session.commit()
            return True
    except Exception as exc:
        mensagem = ("Tempo de processamento excedido." if isinstance(exc, TimeoutError)
                    else "Nenhum fluxo TCP ou UDP com carga foi encontrado neste arquivo."
                    if isinstance(exc, ValueError) and str(exc) == "nenhum fluxo válido"
                    else "Não foi possível analisar o arquivo ou exemplo. Tente outro.")
        with factory() as session:
            row = session.get(Analise, analise_id)
            if row is not None and row.estado != "pronta":
                row.estado = "erro"
                row.erro = mensagem
                session.commit()
        return False
    finally:
        if destino is not None:
            try:
                destino.unlink(missing_ok=True)
            except OSError:
                # A limpeza periódica da T-010 cobre interrupções e falhas do filesystem.
                pass
        if lock is not None:
            try:
                lock.release()
            except Exception:
                # TTL bounds a stale lock if Redis is unavailable during release.
                pass
