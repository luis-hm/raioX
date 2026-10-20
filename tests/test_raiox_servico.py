"""Critério AC-014 aplicado à persistência e serialização da T-007."""

import os
import asyncio
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import json
from io import BytesIO
from time import monotonic
from zipfile import ZipFile
from datetime import datetime, timedelta, timezone
from threading import Lock, Thread
from time import sleep

import dpkt
import numpy as np

from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import inspect, select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import IntegrityError
import httpx

from api.database import create_database_engine, create_session_factory, get_database_url
from api.main import create_app
from api.models import Analise, Base, Fluxo
from api.schemas import FluxoDetalhe, FluxoResumo, StatusAnalise, serializar_fluxo
from worker.tasks import _resumos, processar_analise
from worker.queue import enfileirar, JOB_TIMEOUT_SECONDS
from api.limites import chave_cliente
from core.matriz import CLASSES, montar_matriz
from core.explicar import explicar
from worker.limpeza import executar_limpeza, IDADE_ORFAO


class FakeRateCounter:
    """Fake Redis atômico com TTL para exercitar janela fixa sem serviço externo."""
    def __init__(self):
        self.store = {}
        self.lock = Lock()
    def incrementar_janela(self, key, seconds):
        with self.lock:
            count, expiry = self.store.get(key, (0, monotonic() + seconds))
            count += 1
            self.store[key] = (count, expiry)
            return count, max(1, int(expiry - monotonic()))


class FakeDistributedLock:
    def __init__(self):
        self.guard = Lock()
    def lock(self, *args, **kwargs):
        guard = self.guard
        class Handle:
            held = False
            def acquire(self, blocking=True):
                self.held = guard.acquire(timeout=kwargs.get("blocking_timeout", 1))
                return self.held
            def release(self):
                if self.held:
                    self.held = False
                    guard.release()
        return Handle()


class TestServicoPersistencia(unittest.TestCase):
    def test_t022_agrega_concordancia_par_a_par_por_semente_sem_rotulos(self):
        """Agrega concordância par a par sem consultar rótulos @spec:AC-023"""
        previsoes = []
        escolhas = [("chat", "chat", "voip"), ("chat", "voip", "voip"),
                    ("email", "email", "email")]
        for seed in range(5):
            previsoes.append([{
                model: {"classe_prevista": choices[i], "probabilidades": {}}
                for i, model in enumerate(("B1", "B2", "P"))
            } for choices in escolhas])
        resultado = _resumos(previsoes, [], 3)
        pares = resultado["0"]["concordancia_pares"]
        self.assertEqual(pares, {
            "B1_B2": {"iguais": 2, "diferentes": 1},
            "B1_P": {"iguais": 1, "diferentes": 2},
            "B2_P": {"iguais": 2, "diferentes": 1},
        })
        self.assertEqual(resultado["0"]["concordancia"], {"discordam": 2, "todos": 1})
        self.assertEqual(resultado["0"]["contagens"]["B1"], {"chat": 2, "email": 1})

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="raiox-servico-")
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "servico.sqlite3"
        self.url = f"sqlite:///{self.db_path}"
        self.engine = create_database_engine(self.url)
        self.addCleanup(self.engine.dispose)
        self.Session = create_session_factory(self.engine)

    def analise(self, **kwargs):
        return Analise(id="AbCd1234EfGh", origem="upload", **kwargs)

    def fluxo(self, **kwargs):
        dados = dict(
            n=0, proto=6, ini_s=0.5, principal=True,
            n_pacotes_guardados=1, bytes_amostra_cliente=42,
            bytes_amostra_servidor=0, pacotes=[[42, 1, 0.0]],
        )
        dados.update(kwargs)
        return Fluxo(**dados)

    def test_ac_014_migracao_cria_tabelas_e_cascata(self):
        """Migração cria análise e fluxos com remoção em cascata @spec:AC-014"""
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic" / "alembic.ini"))
        with patch.dict(os.environ, {"DATABASE_URL": self.url}):
            self.assertEqual(get_database_url(), self.url)
            command.upgrade(config, "head")
        self.assertEqual(set(inspect(self.engine).get_table_names()), {"alembic_version", "analise", "fluxo"})
        with self.Session() as session:
            analise = self.analise()
            analise.fluxos.append(self.fluxo())
            session.add(analise)
            session.commit()
            self.assertEqual(analise.criada_em.utcoffset().total_seconds(), 0)
            self.assertEqual(analise.expira_em.utcoffset().total_seconds(), 0)
            self.assertGreater(analise.expira_em, analise.criada_em)
        with self.Session() as session:
            analise = session.get(Analise, "AbCd1234EfGh")
            self.assertEqual(analise.criada_em.utcoffset().total_seconds(), 0)
            session.delete(analise)
            session.commit()
            self.assertEqual(session.scalars(select(Fluxo)).all(), [])

    def test_migracao_preserva_fluxo_antigo_sem_inventar_duracao(self):
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic" / "alembic.ini"))
        with patch.dict(os.environ, {"DATABASE_URL": self.url}):
            command.upgrade(config, "0001_analise_fluxo")
            with self.engine.begin() as conn:
                conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0001_analise_fluxo')"))
                conn.execute(text("""INSERT INTO analise
                    (id, estado, progresso, n_pacotes_lidos, n_fluxos_principais,
                     n_fluxos_extras, resumo_por_semente, origem, criada_em, expira_em)
                    VALUES ('AbCd1234EfGh', 'pronta', 0, 0, 1, 0, '{}', 'upload',
                            '2026-01-01', '2026-01-08')"""))
                conn.execute(text("""INSERT INTO fluxo
                    (analise_id, n, proto, ini_s, principal, n_pacotes_guardados,
                     bytes_amostra_cliente, bytes_amostra_servidor, pacotes)
                    VALUES ('AbCd1234EfGh', 0, 6, 0, 1, 3, 30, 0,
                            '[[10,1,0],[10,1,1],[10,1,2]]')"""))
            command.upgrade(config, "head")
            command.upgrade(config, "head")
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one(),
                             "0003_zip_capturas")
            self.assertIsNone(conn.execute(text("SELECT duracao_s FROM fluxo WHERE n=0")).scalar_one())
            self.assertIsNone(conn.execute(text("SELECT n_arquivos_zip FROM analise WHERE id='AbCd1234EfGh'")).scalar_one())

    def test_ac_014_json_constraints_e_sessao_sqlite(self):
        """JSON e limites do README persistem em SQLite @spec:AC-014"""
        json_type = Analise.__table__.c.resumo_por_semente.type
        self.assertIsInstance(json_type.dialect_impl(sqlite.dialect()), sqlite.JSON)
        self.assertIsInstance(json_type.dialect_impl(postgresql.dialect()), postgresql.JSONB)
        Base.metadata.create_all(self.engine)
        with self.Session() as session:
            analise = self.analise(resumo_por_semente={"0": {"contagens": {"B1": {"voip": 1}}}})
            analise.fluxos.extend([
                self.fluxo(previsoes_por_semente={"0": {"B1": {"classe_prevista": "voip"}}}),
                self.fluxo(n=1, principal=False, previsoes_por_semente=None),
            ])
            session.add(analise)
            session.commit()
        with self.Session() as session:
            loaded = session.get(Analise, "AbCd1234EfGh")
            self.assertEqual(loaded.resumo_por_semente["0"]["contagens"]["B1"]["voip"], 1)
            self.assertIsNone(session.get(Fluxo, ("AbCd1234EfGh", 1)).previsoes_por_semente)
        with self.Session() as session:
            session.add(self.analise(estado="invalida"))
            with self.assertRaises(IntegrityError):
                session.commit()
            session.rollback()
        with self.Session() as session:
            session.add(self.fluxo(analise_id="AbCd1234EfGh", n_pacotes_guardados=101))
            with self.assertRaises(IntegrityError):
                session.commit()
            session.rollback()
            session.add(self.fluxo(analise_id="AbCd1234EfGh", n=2, principal=False,
                                   previsoes_por_semente={"0": {"B1": "voip"}}))
            with self.assertRaises(IntegrityError):
                session.commit()

    def test_ac_014_schemas_expoem_somente_metadados_e_resumos(self):
        """Status e fluxo serializados têm campos públicos explícitos @spec:AC-014"""
        Base.metadata.create_all(self.engine)
        with self.Session() as session:
            analise = Analise(id="AbCd1234EfGh", origem="exemplo", estado="pronta", resumo_por_semente={
                "0": {"contagens": {"B1": {"voip": 1}}, "concordancia": {"todos": 1},
                      "serie_temporal": [{"segundo": 0, "bytes_observados": 42}]}
            })
            previsoes = {str(s): {m: {
                "classe_prevista": "voip", "probabilidades": {"voip": 0.8, "outro": 0.2}
            } for m in ("B1", "B2", "P")} for s in range(5)}
            fluxo = self.fluxo(previsoes_por_semente=previsoes, rotulo_referencia=2)
            analise.fluxos.append(fluxo)
            session.add(analise)
            session.commit()
            status = StatusAnalise.model_validate(analise).model_dump(mode="json")
            detalhe = serializar_fluxo(fluxo, analise.origem).model_dump(mode="json")
            resumo = FluxoResumo.model_validate(fluxo).model_dump(mode="json")
            self.assertEqual(status["resumo_por_semente"]["0"]["serie_temporal"][0]["bytes_observados"], 42)
            self.assertEqual(set(detalhe["previsoes_por_semente"]), {str(s) for s in range(5)})
            self.assertEqual(detalhe["rotulo_referencia"], 2)
            self.assertNotIn("pacotes", resumo)
            for resposta in (status, detalhe, resumo):
                self.assertFalse(set(resposta) & {"ip", "porta", "payload", "bytes_crus"})
            self.assertIsNone(serializar_fluxo(fluxo, "upload").rotulo_referencia)
            with self.assertRaises(ValidationError):
                FluxoDetalhe.model_validate({**detalhe, "ip": "203.0.113.4"})


class TestServicoAPI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="raiox-api-")
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.uploads = root / "uploads"
        self.engine = create_database_engine(f"sqlite:///{root / 'api.sqlite3'}")
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.Session = create_session_factory(self.engine)
        self.jobs = []

        async def session_dependency():
            with self.Session() as session:
                yield session

        def enqueue(analise_id, origem, referencia):
            self.jobs.append((analise_id, origem, referencia))

        async def enqueue_dependency():
            return enqueue

        self.app = create_app(session_dependency=session_dependency,
                              enqueue_dependency=enqueue_dependency, upload_dir=self.uploads,
                              rate_counter=FakeRateCounter(), rate_secret="teste-segredo")
        class Client:
            def __init__(self, app):
                self.app = app

            def request(self, method, path, **kwargs):
                async def send():
                    async with httpx.AsyncClient(
                        transport=httpx.ASGITransport(app=self.app),
                        base_url="http://test",
                    ) as client:
                        return await asyncio.wait_for(client.request(method, path, **kwargs), timeout=5)
                return asyncio.run(send())

            def get(self, path):
                return self.request("GET", path)

            def post(self, path, **kwargs):
                return self.request("POST", path, **kwargs)

        self.client = Client(self.app)

    def _previsoes(self, selected="voip"):
        return {str(seed): {model: {
            "classe_prevista": selected if model != "B2" else "chat",
            "probabilidades": {selected if model != "B2" else "chat": 0.8},
        } for model in ("B1", "B2", "P")} for seed in range(5)}

    def _pronta(self, origem="upload"):
        with self.Session() as session:
            row = Analise(id="AbCd1234EfGh", origem=origem, estado="pronta",
                          resumo_por_semente={"0": {"contagens": {"P": {"voip": 1}}}},
                          motivo_parada="fim_do_arquivo", n_fluxos_principais=2)
            row.fluxos.extend([
                Fluxo(n=0, proto=6, ini_s=0, principal=True, n_pacotes_guardados=3,
                      duracao_s=.2,
                      bytes_amostra_cliente=30, bytes_amostra_servidor=0,
                      pacotes=[[10, 1, 0], [10, 1, 0.1], [10, 1, 0.2]],
                      previsoes_por_semente=self._previsoes(), rotulo_referencia=4),
                Fluxo(n=1, proto=17, ini_s=1, principal=True, n_pacotes_guardados=1,
                      bytes_amostra_cliente=10, bytes_amostra_servidor=0,
                      pacotes=[[10, 1, 1]],
                      previsoes_por_semente=self._previsoes("chat")),
                Fluxo(n=2, proto=6, ini_s=2, principal=False, n_pacotes_guardados=1,
                      bytes_amostra_cliente=10, bytes_amostra_servidor=0,
                      pacotes=[[10, 1, 2]], previsoes_por_semente=None),
            ])
            session.add(row)
            session.commit()

    def test_explicacao_prefixos_oclusao_uma_semente_e_erros(self):
        """Endpoint produz explicação real limitada ao fluxo/semente @spec:AC-019"""
        self._pronta()
        chamadas = []

        def inferir(matrizes, semente):
            chamadas.append((matrizes.copy(), semente))
            resultado = []
            for matriz in matrizes:
                presentes = int(matriz[:, 2].sum())
                saidas = {}
                for metodo, base, passo in (("B1", .55, .01), ("B2", .65, .01), ("P", .60, .02)):
                    p = base + presentes * passo
                    saidas[metodo] = {"classe_prevista": "chat", "probabilidades": {
                        classe: p if classe == "chat" else (1 - p if classe == "email" else 0.0)
                        for classe in CLASSES}}
                resultado.append(saidas)
            return resultado

        root = "/api/analises/AbCd1234EfGh/fluxos"
        with patch("core.explicar.classificar", side_effect=inferir):
            response = self.client.get(root + "/0/explicar?semente=3")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual((body["semente"], body["n_pacotes"]), (3, 3))
        self.assertEqual([p["n_pacotes"] for p in body["prefixos"]], [1, 2, 3])
        self.assertEqual(set(body["oclusao_pp"]), {"B2", "P"})
        self.assertEqual(body["classes_originais_oclusao"], {"B2": "chat", "P": "chat"})
        self.assertTrue(all(abs(v - 1) < 1e-9 for v in body["oclusao_pp"]["B2"]))
        self.assertTrue(all(abs(v - 2) < 1e-9 for v in body["oclusao_pp"]["P"]))
        self.assertEqual(len(chamadas), 1)
        matrizes, seed = chamadas[0]
        self.assertEqual((matrizes.shape, seed), ((6, 32, 4), 3))
        np.testing.assert_array_equal(matrizes[2], montar_matriz([10] * 3, [1] * 3, [0, .1, .2]))
        self.assertTrue(np.all(matrizes[3, 0] == 0))
        self.assertTrue(np.all(matrizes[3, 1:] == matrizes[2, 1:]))
        for forbidden in ("203.0.113", "porta", "payload", "arquivo_origem"):
            self.assertNotIn(forbidden, response.text)
        self.assertIn("não medem acerto", body["aviso"])

        self.assertEqual(self.client.get("/api/analises/NaoExiste12/fluxos/0/explicar").status_code, 404)
        self.assertEqual(self.client.get(root + "/99/explicar").status_code, 404)
        self.assertEqual(self.client.get(root + "/2/explicar").status_code, 422)
        self.assertEqual(self.client.get(root + "/1/explicar").status_code, 422)
        for seed in ("-1", "5", "abc"):
            self.assertEqual(self.client.get(root + f"/0/explicar?semente={seed}").status_code, 422)

    def test_explicacao_limita_prefixos_a_32_sem_usar_identificadores(self):
        """Prefixos param no limite da matriz sem revelar identificadores @spec:AC-019"""
        pacotes = [[64, 1, i * .01] for i in range(40)]
        lotes = []

        def inferir(matrizes, semente):
            lotes.append((matrizes.copy(), semente))
            return [{metodo: {"classe_prevista": "chat", "probabilidades": {
                classe: 1.0 if classe == "chat" else 0.0 for classe in CLASSES}}
                for metodo in ("B1", "B2", "P")} for _ in matrizes]

        resposta = explicar(pacotes, 4, inferir=inferir)
        self.assertEqual((resposta["n_pacotes"], len(resposta["prefixos"])), (32, 32))
        self.assertEqual(len(resposta["oclusao_pp"]["P"]), 32)
        self.assertEqual((len(lotes), lotes[0][0].shape, lotes[0][1]), (1, (64, 32, 4), 4))
        self.assertTrue(np.all(lotes[0][0][31, :, 2] == 1))

    def test_ac_008_upload_validacao_streaming_e_enqueue(self):
        """Upload validado cria id opaco e rejeições não deixam arquivo @spec:AC-008"""
        for extension, magic in (("pcap", "d4c3b2a1"), ("pcapng", "0a0d0d0a")):
            response = self.client.post("/api/analises", files={"arquivo":
                                        (f"cliente-segredo.{extension}", bytes.fromhex(magic) + b"12345678")})
            self.assertEqual(response.status_code, 202, response.text)
            analise_id = response.json()["id"]
            self.assertEqual(len(analise_id), 12)
            self.assertEqual(response.json(), {"id": analise_id})
            with self.Session() as session:
                row = session.get(Analise, analise_id)
                self.assertEqual((row.origem, row.estado, row.nome_exibicao), ("upload", "recebida", None))
            self.assertEqual(self.jobs[-1][:2], (analise_id, "upload"))
            self.assertEqual(Path(self.jobs[-1][2]).parent, self.uploads)
            self.assertNotIn("cliente-segredo", self.jobs[-1][2])
            self.assertNotIn(self.jobs[-1][2], response.text)
        before = set(self.uploads.iterdir())
        for filename, content, expected in (("bad.txt", b"xxxx", 400),
                                            ("bad.pcap", b"xxxx", 400),
                                            ("bad.pcapng", bytes.fromhex("d4c3b2a1"), 400)):
            response = self.client.post("/api/analises", files={"arquivo": (filename, content)})
            self.assertEqual(response.status_code, expected)
            self.assertEqual(set(self.uploads.iterdir()), before)
        with patch("api.main.MAX_UPLOAD_BYTES", 8):
            response = self.client.post("/api/analises", files={"arquivo":
                                        ("big.pcap", bytes.fromhex("d4c3b2a1") + b"12345")})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(set(self.uploads.iterdir()), before)

    def test_upload_zip_agrupa_capturas_e_rejeita_itens_inseguros(self):
        def enviar(itens):
            buffer = BytesIO()
            with ZipFile(buffer, "w") as archive:
                for nome, conteudo in itens:
                    archive.writestr(nome, conteudo)
            return self.client.post("/api/analises", files={"arquivo": ("lote.zip", buffer.getvalue())})

        before = set(self.uploads.iterdir()) if self.uploads.exists() else set()
        pcap = bytes.fromhex("d4c3b2a1") + b"captura"
        pcapng = bytes.fromhex("0a0d0d0a") + b"captura"
        for itens in ([('../segredo.pcap', pcap)], [('outro.txt', pcap)],
                      [('a.pcapng', pcap)], [('a.pcap', b"invalido")], []):
            response = enviar(itens)
            self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(set(self.uploads.iterdir()), before)
        response = enviar([('dia1/a.pcap', pcap), ('dia2/b.pcapng', pcapng)])
        self.assertEqual(response.status_code, 202, response.text)
        with self.Session() as session:
            row = session.get(Analise, response.json()["id"])
            self.assertEqual((row.n_arquivos_zip, row.origem, row.estado), (2, "upload", "recebida"))
        self.assertEqual(Path(self.jobs[-1][2]).suffix, ".zip")
        self.assertNotIn("dia1", response.text)

    def test_ac_008_enqueue_falha_remove_upload_e_registro(self):
        """Falha da fila desfaz registro e arquivo temporário @spec:AC-008"""
        def fail(*args):
            raise RuntimeError("segredo interno /tmp/caminho")

        async def fail_dependency():
            return fail

        self.app.dependency_overrides[__import__("api.deps", fromlist=["get_enqueue"]).get_enqueue] = fail_dependency
        response = self.client.post("/api/analises", files={"arquivo":
                                    ("capture.pcap", bytes.fromhex("d4c3b2a1") + b"12345678")})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("segredo", response.text)
        self.assertEqual(list(self.uploads.iterdir()), [])
        with self.Session() as session:
            self.assertEqual(session.scalars(select(Analise)).all(), [])

    def test_ac_009_exemplos_da_biblioteca(self):
        """Só categorias da biblioteca geram referência imutável @spec:AC-009"""
        for name in ("chat", "email", "transferencia", "streaming", "voip"):
            response = self.client.post(f"/api/analises/exemplo/{name}")
            self.assertEqual(response.status_code, 202, response.text)
            self.assertEqual(self.jobs[-1], (response.json()["id"], "exemplo", name))
            with self.Session() as session:
                self.assertEqual(session.get(Analise, response.json()["id"]).origem, "exemplo")
        self.assertEqual(self.client.post("/api/analises/exemplo/inexistente").status_code, 404)
        self.assertFalse(self.uploads.exists())

    def test_ac_012_limite_10_por_ip_compartilhado_upload_exemplo(self):
        """Upload e exemplo compartilham rate limit com resposta opaca @spec:AC-012"""
        for index in range(10):
            if index % 2:
                response = self.client.post("/api/analises/exemplo/chat")
            else:
                response = self.client.post("/api/analises", files={"arquivo":
                    (f"f{index}.pcap", bytes.fromhex("d4c3b2a1") + b"12345678")})
            self.assertEqual(response.status_code, 202, response.text)
        response = self.client.post("/api/analises/exemplo/voip")
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response.headers["retry-after"]), 0)
        self.assertEqual(response.json(), {"detail": "Limite de análises atingido. Tente novamente mais tarde."})
        self.assertEqual(len(self.jobs), 10)
        self.assertNotIn("127.0.0.1", repr(self.app.state.rate_counter.store))
        self.assertTrue(all(key.startswith("raiox:rate:v1:") for key in self.app.state.rate_counter.store))
        self.assertNotIn("127.0.0.1", chave_cliente("127.0.0.1", "teste-segredo"))

    def test_ac_012_redis_indisponivel_falha_fechada_sem_detalhes(self):
        """Falha do rate limit retorna 503 genérico e não agenda análise @spec:AC-012"""
        class Indisponivel:
            def incrementar_janela(self, *args):
                raise RuntimeError("redis /segredo/interno")

        self.app.state.rate_counter = Indisponivel()
        response = self.client.post("/api/analises/exemplo/chat")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "Serviço temporariamente indisponível"})
        self.assertNotIn("redis", response.text)
        self.assertEqual(len(self.jobs), 0)

    def test_ac_011_status_lista_detalhe_filtros_e_404(self):
        """Consultas limitam tabela e ocultam rótulos de upload @spec:AC-011"""
        self._pronta()
        root = "/api/analises/AbCd1234EfGh"
        status = self.client.get(root)
        self.assertEqual(status.status_code, 200, status.text)
        self.assertEqual(status.json()["resumo_por_semente"]["0"]["contagens"]["P"]["voip"], 1)
        self.assertEqual(status.json()["motivo_parada"], "fim_do_arquivo")
        listing = self.client.get(root + "/fluxos?semente=0&classe=voip&modelo=p&discordam=true")
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual((listing.json()["total"], len(listing.json()["itens"])), (1, 1))
        self.assertEqual(listing.json()["itens"][0]["previsoes"]["P"]["classe_prevista"], "voip")
        self.assertIsNone(listing.json()["itens"][0]["rotulo_referencia"])
        self.assertEqual(self.client.get(root + "/fluxos?tamanho=1&pagina=2").json()["itens"][0]["n"], 1)
        self.assertEqual(self.client.get(root + "/fluxos?tamanho=101").status_code, 422)
        self.assertEqual(self.client.get(root + "/fluxos?modelo=X").status_code, 422)
        detail = self.client.get(root + "/fluxos/0?semente=0")
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(len(detail.json()["matriz_32x4"]), 32)
        self.assertEqual(detail.json()["duracao_s"], .2)
        self.assertEqual(listing.json()["itens"][0]["duracao_s"], .2)
        self.assertEqual(detail.json()["estabilidade"]["P"], 5)
        self.assertIsNone(detail.json()["rotulo_referencia"])
        self.assertEqual(self.client.get(root + "/fluxos/77").status_code, 404)
        self.assertEqual(self.client.get("/api/analises/NaoExiste12").status_code, 404)
        self.assertEqual(self.client.get("/api/analises/NaoExiste12/fluxos").status_code, 404)
        for payload in (status.text, listing.text, detail.text):
            for forbidden in ("payload", "bytes_crus", "cliente-segredo", "/tmp/"):
                self.assertNotIn(forbidden, payload)


class TestServicoWorker(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="raiox-worker-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.uploads = self.root / "uploads"
        self.uploads.mkdir()
        self.engine = create_database_engine(f"sqlite:///{self.root / 'worker.sqlite3'}")
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.Session = create_session_factory(self.engine)
        self.id = "AbCd1234EfGh"
        self._lock_patch = patch("worker.tasks._redis_connection", return_value=FakeDistributedLock())
        self._lock_patch.start()
        self.addCleanup(self._lock_patch.stop)

    def iniciar(self, origem):
        with self.Session() as session:
            session.add(Analise(id=self.id, origem=origem, estado="recebida"))
            session.commit()

    @staticmethod
    def classificar(matrizes, *, prazo=None):
        assert matrizes.shape[1:] == (32, 4)
        return {seed: [{model: {
            "classe_prevista": "chat", "probabilidades": {
                classe: 1.0 if classe == "chat" else 0.0
                for classe in ("chat", "email", "transferencia", "streaming", "voip")},
        } for model in ("B1", "B2", "P")} for _ in matrizes] for seed in range(5)}

    def captura(self, *, pacotes=3, fluxos=1):
        caminho = self.uploads / ("a" * 40 + ".pcap")
        with caminho.open("wb") as arquivo:
            writer = dpkt.pcap.Writer(arquivo)
            for fluxo in range(fluxos):
                for i in range(pacotes):
                    tcp = dpkt.tcp.TCP(sport=12345 + fluxo, dport=443, seq=i,
                                       data=b"segredo-ip-203.0.113.4")
                    tcp.off = 5
                    ip = dpkt.ip.IP(src=b"\x0a\x00\x00\x01", dst=b"\x0a\x00\x00\x02",
                                    p=6, data=tcp)
                    ip.len = len(ip)
                    eth = dpkt.ethernet.Ethernet(src=b"123456", dst=b"654321", type=0x0800, data=ip)
                    writer.writepkt(eth, ts=1000 + fluxo * 10 + i)
            writer.close()
        return caminho

    def test_ac_010_upload_progresso_resultados_anonimos_e_limpeza(self):
        """Worker atualiza contadores e apaga captura após classificação @spec:AC-010"""
        self.iniciar("upload")
        caminho = self.captura()
        estados = []

        def classificar(matrizes, *, prazo=None):
            with self.Session() as session:
                row = session.get(Analise, self.id)
                estados.append((row.estado, row.progresso, row.n_fluxos_principais))
            self.assertFalse(caminho.exists())
            return self.classificar(matrizes, prazo=prazo)

        self.assertTrue(processar_analise(self.id, "upload", str(caminho),
                        session_factory=self.Session, upload_dir=self.uploads,
                        classificar=classificar))
        self.assertEqual(estados, [("classificando", 3, 1)])
        with self.Session() as session:
            row = session.get(Analise, self.id)
            fluxo = session.get(Fluxo, (self.id, 0))
            self.assertEqual((row.estado, row.progresso, row.n_pacotes_lidos), ("pronta", 3, 3))
            self.assertEqual((row.n_fluxos_principais, row.n_fluxos_extras), (1, 0))
            self.assertEqual(len(fluxo.pacotes), 3)
            self.assertEqual(set(fluxo.previsoes_por_semente), set(map(str, range(5))))
            self.assertIsNone(fluxo.rotulo_referencia)
            self.assertEqual(row.resumo_por_semente["0"]["contagens"]["B1"]["chat"], 1)
            self.assertGreater(row.resumo_por_semente["0"]["serie_temporal"][0]["bytes_observados"], 0)
            serialized = json.dumps({"analise": StatusAnalise.model_validate(row).model_dump(mode="json"),
                                     "fluxo": serializar_fluxo(fluxo, "upload").model_dump(mode="json")})
            for secret in ("segredo-ip", "203.0.113.4", "12345", str(caminho)):
                self.assertNotIn(secret, serialized)
        self.assertFalse(caminho.exists())

    def test_lote_zip_combina_fluxos_sem_fabricar_tempo_e_limpa_arquivos(self):
        """ZIP processa cada captura, combina fluxos e descarta relógio incompatível."""
        captura = self.captura()
        conteudo = captura.read_bytes()
        convertido = BytesIO()
        escritor = dpkt.pcapng.Writer(convertido)
        for timestamp, pacote in dpkt.pcap.Reader(BytesIO(conteudo)):
            escritor.writepkt(pacote, ts=timestamp)
        conteudo_pcapng = convertido.getvalue()
        captura.unlink()
        lote = self.uploads / ("b" * 40 + ".zip")
        with ZipFile(lote, "w") as archive:
            archive.writestr("dia1.pcap", conteudo)
            archive.writestr("dia2.pcapng", conteudo_pcapng)
        with self.Session() as session:
            session.add(Analise(id=self.id, origem="upload", estado="recebida", n_arquivos_zip=2))
            session.commit()
        self.assertTrue(processar_analise(self.id, "upload", str(lote),
                        session_factory=self.Session, upload_dir=self.uploads,
                        classificar=self.classificar))
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual((row.estado, row.n_fluxos_principais, row.n_pacotes_lidos),
                             ("pronta", 2, 6))
            self.assertIsNone(row.duracao_observada_s)
            self.assertEqual(row.resumo_por_semente["0"]["serie_temporal"], [])
            self.assertEqual(len(session.scalars(select(Fluxo)).all()), 2)
        self.assertEqual(list(self.uploads.iterdir()), [])

    def test_duracao_exata_alem_da_amostra_e_api(self):
        """Duração do fluxo não é inferida da amostra de 100 pacotes @spec:AC-018"""
        self.iniciar("upload")
        caminho = self.captura(pacotes=105)
        self.assertTrue(processar_analise(self.id, "upload", str(caminho),
                        session_factory=self.Session, upload_dir=self.uploads,
                        classificar=self.classificar))
        with self.Session() as session:
            fluxo = session.get(Fluxo, (self.id, 0))
            self.assertEqual(len(fluxo.pacotes), 100)
            self.assertEqual(fluxo.pacotes[-1][2], 99)
            self.assertEqual(fluxo.duracao_s, 104)
            self.assertEqual(FluxoResumo.model_validate(fluxo).duracao_s, 104)

    def test_ac_010_progresso_incremental_e_teto_de_500(self):
        """Leitura publica marco intermediário e só 500 fluxos recebem palpites @spec:AC-010"""
        self.iniciar("upload")
        caminho = self.captura(fluxos=501, pacotes=10)
        marcos = []

        def classificar(matrizes, *, prazo=None):
            self.assertEqual(len(matrizes), 500)
            return self.classificar(matrizes, prazo=prazo)

        from core.extracao import extrair_fluxos

        def extrair(caminho, *, progresso, prazo):
            def registrar(lidos, validos):
                progresso(lidos, validos)
                with self.Session() as session:
                    row = session.get(Analise, self.id)
                    marcos.append((row.estado, row.progresso, row.n_fluxos_principais))
            return extrair_fluxos(caminho, progresso=registrar, prazo=prazo)

        self.assertTrue(processar_analise(self.id, "upload", str(caminho),
                        session_factory=self.Session, upload_dir=self.uploads,
                        extrair=extrair, classificar=classificar))
        self.assertEqual(marcos[0], ("extraindo", 5000, 500))
        self.assertEqual(marcos[-1], ("extraindo", 5010, 500))
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual((row.n_fluxos_principais, row.n_fluxos_extras), (500, 1))
            self.assertIsNone(session.get(Fluxo, (self.id, 500)).previsoes_por_semente)
            self.assertEqual(len(session.scalars(select(Fluxo)).all()), 501)
        self.assertFalse(caminho.exists())

    def test_ac_010_exemplo_usa_matriz_e_trios_sem_rótulo_inferido(self):
        """Exemplo usa dados da biblioteca e guarda categoria herdada @spec:AC-010"""
        self.iniciar("exemplo")
        biblioteca = Path(__file__).resolve().parents[1] / "exemplos" / "biblioteca.json"
        with biblioteca.open(encoding="utf-8") as arquivo:
            exemplo = next(x for x in json.load(arquivo)["exemplos"] if x["categoria_captura"] == "chat")

        def classificar(matrizes, *, prazo=None):
            self.assertEqual(matrizes[0].tolist(), __import__("numpy").asarray(
                exemplo["matriz_32x4"], dtype="float32").tolist())
            return self.classificar(matrizes, prazo=prazo)

        self.assertTrue(processar_analise(self.id, "exemplo", "chat",
                        session_factory=self.Session, biblioteca_path=biblioteca,
                        classificar=classificar))
        with self.Session() as session:
            row = session.get(Analise, self.id)
            fluxo = session.get(Fluxo, (self.id, 0))
            self.assertEqual((row.estado, row.n_fluxos_principais), ("pronta", 1))
            self.assertEqual(fluxo.pacotes, [[int(a), int(b), c] for a, b, c in exemplo["pacotes"]])
            self.assertEqual(fluxo.proto, exemplo["proto"])
            self.assertEqual(fluxo.rotulo_referencia, 0)
            self.assertIsNone(fluxo.duracao_s)
            self.assertNotIn("arquivo_origem", json.dumps(fluxo.previsoes_por_semente))
            resposta = serializar_fluxo(fluxo, "exemplo").model_dump(mode="json")
            self.assertEqual(resposta["proto"], exemplo["proto"])

    def test_exemplo_curto_tem_duracao_exata(self):
        """Exemplo integral com menos de 100 pacotes tem duração observada @spec:AC-018"""
        self.iniciar("exemplo")
        biblioteca = Path(__file__).resolve().parents[1] / "exemplos" / "biblioteca.json"
        self.assertTrue(processar_analise(self.id, "exemplo", "email",
                        session_factory=self.Session, biblioteca_path=biblioteca,
                        classificar=self.classificar))
        with self.Session() as session:
            fluxo = session.get(Fluxo, (self.id, 0))
            self.assertLess(len(fluxo.pacotes), 100)
            self.assertEqual(fluxo.duracao_s, fluxo.pacotes[-1][2])

    def test_ac_010_falha_apaga_upload_e_guarda_erro_seguro(self):
        """Falha da extração marca erro seguro e remove upload @spec:AC-010"""
        self.iniciar("upload")
        caminho = self.captura()

        def falhar(*args, **kwargs):
            kwargs["progresso"](5000, 1)
            raise RuntimeError(f"segredo-ip {caminho}")

        self.assertFalse(processar_analise(self.id, "upload", str(caminho),
                         session_factory=self.Session, upload_dir=self.uploads, extrair=falhar,
                         classificar=self.classificar))
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual((row.estado, row.progresso, row.n_fluxos_principais), ("erro", 5000, 1))
            self.assertNotIn("segredo", row.erro)
            self.assertNotIn(str(caminho), row.erro)
            self.assertEqual(session.scalars(select(Fluxo)).all(), [])
        self.assertFalse(caminho.exists())

    def test_ac_012_prazo_fila_e_caminho_externo(self):
        """Fila limita execução e worker rejeita path externo @spec:AC-012"""
        self.assertEqual(JOB_TIMEOUT_SECONDS, 300)
        class FakeQueue:
            def enqueue(self, *args, **kwargs):
                return args, kwargs
        args, kwargs = enfileirar(self.id, "exemplo", "chat", queue=FakeQueue())
        self.assertEqual(kwargs["job_timeout"], 300)
        self.assertEqual(args[0], "worker.tasks.processar_analise")
        self.iniciar("upload")
        externo = self.root / ("b" * 40 + ".pcap")
        externo.write_bytes(b"nao apagar")
        self.assertFalse(processar_analise(self.id, "upload", str(externo),
                         session_factory=self.Session, upload_dir=self.uploads))
        self.assertTrue(externo.exists())
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual(row.estado, "erro")
            self.assertNotIn(str(externo), row.erro)

    def test_ac_012_limite_de_pacotes_interrompe_e_informa_parcial(self):
        """Extração para no limite e registra captura parcial @spec:AC-012"""
        self.iniciar("upload")
        caminho = self.captura(pacotes=6)
        with patch("core.extracao.LIMITE_PACOTES", 4):
            self.assertTrue(processar_analise(self.id, "upload", str(caminho),
                            session_factory=self.Session, upload_dir=self.uploads,
                            classificar=self.classificar))
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual((row.estado, row.n_pacotes_lidos, row.motivo_parada),
                             ("pronta", 4, "limite_de_pacotes"))
        self.assertFalse(caminho.exists())

    def test_ac_012_prazo_expirado_marca_erro_e_apaga_upload(self):
        """Prazo excedido dá erro seguro e libera o arquivo @spec:AC-012"""
        self.iniciar("upload")
        caminho = self.captura()
        self.assertFalse(processar_analise(self.id, "upload", str(caminho),
                         session_factory=self.Session, upload_dir=self.uploads,
                         classificar=self.classificar, prazo=monotonic() - 1))
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual((row.estado, row.erro), ("erro", "Tempo de processamento excedido."))
        self.assertFalse(caminho.exists())

    def test_ac_012_lock_redis_serializa_execucoes(self):
        """Lock compartilhado impede execução simultânea entre workers @spec:AC-012"""
        guard = Lock()
        active = 0
        peak = 0
        counts_lock = Lock()
        class FakeLock:
            def __init__(self, **kwargs):
                self.held = False
            def acquire(self, blocking=True):
                self.held = guard.acquire(timeout=2)
                return self.held
            def release(self):
                if self.held:
                    self.held = False
                    guard.release()
        class FakeRedis:
            def lock(self, *args, **kwargs):
                return FakeLock(**kwargs)
        ids = ["AbCd1234EfGh", "ZyXw9876VuTs"]
        for analise_id in ids:
            with self.Session() as session:
                session.add(Analise(id=analise_id, origem="exemplo", estado="recebida"))
                session.commit()
        def classify(matrices, *, prazo=None):
            nonlocal active, peak
            with counts_lock:
                active += 1
                peak = max(peak, active)
            sleep(0.08)
            with counts_lock:
                active -= 1
            return self.classificar(matrices, prazo=prazo)
        outcomes = []
        def run(analise_id):
            outcomes.append(processar_analise(
                analise_id, "exemplo", "chat", session_factory=self.Session,
                lock_client=FakeRedis(), classificar=classify))
        threads = [Thread(target=run, args=(analise_id,)) for analise_id in ids]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=5)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(sorted(outcomes), [True, True])
        self.assertEqual(peak, 1)

    def test_ac_012_falha_redis_registra_erro_seguro_e_remove_upload_validado(self):
        """Falha ao adquirir lock termina análise e limpa apenas upload interno @spec:AC-012"""
        self.iniciar("upload")
        caminho = self.captura()
        class RedisIndisponivel:
            def lock(self, *args, **kwargs):
                class Handle:
                    def acquire(self, blocking=True):
                        raise RuntimeError("redis /segredo/interno")
                return Handle()
        self.assertFalse(processar_analise(
            self.id, "upload", str(caminho), session_factory=self.Session,
            upload_dir=self.uploads, lock_client=RedisIndisponivel()))
        self.assertFalse(caminho.exists())
        with self.Session() as session:
            row = session.get(Analise, self.id)
            self.assertEqual(row.estado, "erro")
            self.assertEqual(row.erro, "Não foi possível analisar o arquivo ou exemplo. Tente outro.")
            self.assertNotIn("redis", row.erro)

    def test_ac_013_expira_analises_cascata_e_limpa_apenas_orfaos_antigos(self):
        """Remove expiração inclusiva/cascata e órfãos antigos, preserva recentes @spec:AC-013"""
        now = datetime.now(timezone.utc)
        with self.Session() as session:
            created = now - timedelta(days=7)
            expirando = Analise(id="AbCd1234EfGh", origem="upload",
                               criada_em=created, expira_em=now)
            expirando.fluxos.append(Fluxo(n=0, proto=6, ini_s=0, principal=True,
                n_pacotes_guardados=0, bytes_amostra_cliente=0,
                bytes_amostra_servidor=0, pacotes=[]))
            preservada = Analise(id="ZyXw9876VuTs", origem="upload",
                criada_em=created, expira_em=now + timedelta(seconds=1))
            session.add_all([expirando, preservada])
            session.commit()
        stale = self.uploads / ("a" * 40 + ".pcap")
        recent = self.uploads / ("b" * 40 + ".pcap")
        outside = self.root / ("c" * 40 + ".pcap")
        stale.write_bytes(b"stale")
        recent.write_bytes(b"recent")
        outside.write_bytes(b"outside")
        unknown_name = self.uploads / "old-temp.pcap"
        unknown_name.write_bytes(b"leave")
        old_epoch = now.timestamp() - IDADE_ORFAO.total_seconds() - 5
        os.utime(stale, (old_epoch, old_epoch))
        os.utime(recent, (now.timestamp(), now.timestamp()))
        link = self.uploads / ("d" * 40 + ".pcap")
        link.symlink_to(outside)
        result = executar_limpeza(session_factory=self.Session, upload_dir=self.uploads, agora=now)
        self.assertEqual(result, {"analises": 1, "uploads": 1})
        self.assertFalse(stale.exists())
        self.assertTrue(recent.exists())
        self.assertTrue(link.is_symlink())
        self.assertTrue(outside.exists())
        self.assertTrue(unknown_name.exists())
        missing_dir = self.root / "missing-uploads"
        self.assertEqual(executar_limpeza(session_factory=self.Session,
                         upload_dir=missing_dir, agora=now), {"analises": 0, "uploads": 0})
        with self.Session() as session:
            self.assertIsNone(session.get(Analise, "AbCd1234EfGh"))
            self.assertIsNone(session.get(Fluxo, ("AbCd1234EfGh", 0)))
            self.assertIsNotNone(session.get(Analise, "ZyXw9876VuTs"))


if __name__ == "__main__":
    unittest.main()
