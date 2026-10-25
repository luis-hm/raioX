"""Aceite do comando local de análise e do contrato de privacidade."""

from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

import dpkt
import numpy as np

from core.analisar import analisar, main
from core.matriz import CLASSES


def _quadro(payload, sport=41237):
    origem = bytes((203, 0, 113, 71))
    destino = bytes((198, 51, 100, 42))
    tcp = struct.pack("!HHIIHHHH", sport, 443, 0, 0, 5 << 12, 0, 0, 0) + payload
    ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + len(tcp), 0, 0,
                     64, 6, 0, origem, destino) + tcp
    return bytes.fromhex("aabbccddeeff001122334455") + struct.pack("!H", 0x0800) + ip


class TestRaioXPipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="raiox-pipeline-")
        self.addCleanup(self.tmp.cleanup)
        self.pacotes = [
            _quadro(b"SEGREDO_PAYLOAD_7788" + bytes((i,)) * 40)
            for i in range(3)
        ]

    def captura(self, extensao):
        caminho = Path(self.tmp.name) / ("203.0.113.71-41237" + extensao)
        with caminho.open("wb") as f:
            writer = dpkt.pcap.Writer(f) if extensao == ".pcap" else dpkt.pcapng.Writer(f)
            for i, pacote in enumerate(self.pacotes):
                writer.writepkt(pacote, ts=10 + i * .01)
        return caminho

    def test_ac_005_pcap_e_pcapng_classificam_cinco_sementes(self):
        """Fluxo válido recebe B1/B2/P reais nas cinco sementes @spec:AC-005"""
        for extensao in (".pcap", ".pcapng"):
            with self.subTest(extensao=extensao):
                resultado = analisar(self.captura(extensao), semente=3)
                self.assertEqual(resultado["pacotes_lidos"], 3)
                self.assertEqual(resultado["motivo_parada"], "fim_do_arquivo")
                self.assertEqual((resultado["fluxos_validos"], resultado["fluxos_principais"]), (1, 1))
                fluxo = resultado["fluxos"][0]
                self.assertTrue(fluxo["principal"])
                self.assertEqual(fluxo["protocolo"], "TCP")
                self.assertEqual(set(fluxo["palpites_por_semente"]), {str(s) for s in range(5)})
                for palpites in fluxo["palpites_por_semente"].values():
                    self.assertEqual(set(palpites), {"B1", "B2", "P"})
                    self.assertTrue(set(palpites.values()).issubset(CLASSES))
                self.assertEqual(fluxo["detalhe_semente"]["semente"], 3)
                for metodo, saida in fluxo["detalhe_semente"]["modelos"].items():
                    self.assertEqual(saida["classe_prevista"], fluxo["palpites_por_semente"]["3"][metodo])
                    self.assertEqual(set(saida["probabilidades"]), set(CLASSES))
                    self.assertAlmostEqual(sum(saida["probabilidades"].values()), 1.0, places=5)

    def test_ac_006_json_e_humano_nao_expõem_identificadores(self):
        """Serialização inclui só metadados anônimos e ressalva @spec:AC-006"""
        captura = self.captura(".pcap")
        for formato in ([], ["--json"]):
            with self.subTest(formato=formato):
                saida = io.StringIO()
                with redirect_stdout(saida):
                    self.assertEqual(main([str(captura), "--semente", "4", *formato]), 0)
                texto = saida.getvalue()
                for segredo in ("203.0.113.71", "198.51.100.42", "41237",
                                "aabbccddeeff", "SEGREDO_PAYLOAD_7788", str(captura)):
                    self.assertNotIn(segredo, texto)
                self.assertIn("reconstruções locais", texto)
                self.assertIn("divergentes", texto)
                self.assertIn("referência", texto)
                if formato:
                    resultado = json.loads(texto)
                    self.assertEqual(resultado["semente_detalhada"], 4)
                    self.assertEqual(resultado["tipo_resultado"], "palpite_de_modelos_locais")
                    self.assertFalse(resultado["probabilidades_calibradas"])
                    self.assertNotIn("rotulo_referencia", texto)
                    self.assertEqual(set(resultado["fluxos"][0]) - {
                        "numero", "principal", "protocolo", "inicio_segundos",
                        "duracao_amostra_segundos", "pacotes_amostrados", "bytes_amostrados",
                        "palpites_por_semente", "detalhe_semente",
                    }, set())

    def test_ac_005_limita_classificacao_a_500_principais(self):
        """Fluxos extras ficam contados, mas sem palpites @spec:AC-005"""
        total = 502
        dados = {
            "pk": np.zeros((total, 100, 3), dtype=np.float32),
            "n": np.full(total, 3, dtype=np.int16),
            "ini": np.zeros(total, dtype=np.float32),
            "proto": np.full(total, 6, dtype=np.int8),
        }
        dados["pk"][:, :3, 0] = 100
        dados["pk"][:, :3, 1] = 1
        dados["pk"][:, :3, 2] = [0, .01, .02]
        chamadas = []

        def classificar_falso(matrizes, seed, artefatos):
            chamadas.append((seed, len(matrizes)))
            return [{m: {"classe_prevista": "chat", "probabilidades": {"chat": 1.0}}
                     for m in ("B1", "B2", "P")} for _ in range(len(matrizes))]

        with patch("core.analisar.extrair_fluxos", return_value=(dados, {"pacotes_lidos": 1506, "motivo": "fim_do_arquivo"})), \
             patch("core.analisar.classificar", side_effect=classificar_falso):
            resultado = analisar("captura.pcap")
        self.assertEqual(chamadas, [(seed, 500) for seed in range(5)])
        self.assertEqual((resultado["fluxos_validos"], resultado["fluxos_principais"], resultado["fluxos_extras"]),
                         (502, 500, 2))
        self.assertNotIn("palpites_por_semente", resultado["fluxos"][500])
        self.assertNotIn("detalhe_semente", resultado["fluxos"][501])

    def test_ac_006_erro_de_captura_nao_revela_caminho(self):
        """Falha de leitura não ecoa nome sensível nem bytes @spec:AC-006"""
        caminho = Path(self.tmp.name) / "203.0.113.71-41237.pcap"
        caminho.write_bytes(b"SEGREDO_PAYLOAD_7788")
        erro = io.StringIO()
        with redirect_stderr(erro), self.assertRaises(SystemExit) as encerramento:
            main([str(caminho), "--json"])
        self.assertEqual(encerramento.exception.code, 2)
        self.assertNotIn(str(caminho), erro.getvalue())
        self.assertNotIn("SEGREDO_PAYLOAD_7788", erro.getvalue())

    def test_ac_007_biblioteca_tem_proveniencia_e_nao_expoe_dados_brutos(self):
        """Exemplos seguem a ordem das fontes e não expõem dados de rede @spec:AC-007"""
        import csv
        import os

        from core.matriz import CLASSES, montar_matriz
        from treino.preparar_exemplos import AVISO, preparar

        reexecucao = Path("/home/dev/dados/experimento")
        experimento = Path(os.environ.get(
            "RAIOX_EXPERIMENTO",
            reexecucao if (reexecucao / "dados_processados" / "splits.npz").exists()
            else "/tmp/raiox-redes-review/trabalho de redes/projeto_trafego",
        ))
        processados = experimento / "dados_processados"
        with np.load(processados / "dataset.npz", allow_pickle=False) as dataset:
            x, y = dataset["X"], dataset["y"]
        pacotes = np.load(processados / "pk_bruto.npy", allow_pickle=False)
        with (processados / "meta.csv").open(encoding="utf-8", newline="") as source:
            meta = list(csv.DictReader(source))

        biblioteca = preparar(experimento)
        publicada = json.loads((Path(__file__).resolve().parents[1] / "exemplos" / "biblioteca.json")
                               .read_text(encoding="utf-8"))
        self.assertEqual(publicada, biblioteca)
        exemplos = biblioteca["exemplos"]
        self.assertEqual(biblioteca["aviso"], AVISO)
        self.assertIn("sem seleção por previsões", biblioteca["regra_selecao"])
        self.assertEqual([e["categoria_captura"] for e in exemplos], list(CLASSES))
        self.assertEqual(len(exemplos), 5)

        with np.load(processados / "splits.npz", allow_pickle=False) as splits:
            no_treino = np.stack([splits[f"N_s{s}_part"] for s in range(5)], axis=1) == 0
        primeiros = {}
        for indice, (rotulo, linha) in enumerate(zip(y, meta)):
            classe = CLASSES[int(rotulo)]
            if linha["principal"].strip().lower() == "true":
                atual = primeiros.get(classe)
                if atual is None or no_treino[indice].sum() < no_treino[atual].sum():
                    primeiros[classe] = indice
        for exemplo in exemplos:
            classe = exemplo["categoria_captura"]
            indice = primeiros[classe]
            linha = meta[indice]
            self.assertEqual(exemplo["arquivo_origem"], linha["arquivo"])
            self.assertEqual(exemplo["sessao"], linha["sessao"])
            self.assertEqual(exemplo["aplicacao"], linha["aplicacao"])
            self.assertEqual(exemplo["proto"], int(linha["proto"]))
            self.assertEqual(exemplo["sementes_no_treino"],
                             [s for s in range(5) if no_treino[indice, s]])
            self.assertIn(exemplo["proto"], (6, 17))
            matriz = np.asarray(exemplo["matriz_32x4"], dtype=np.float32)
            self.assertEqual(matriz.shape, (32, 4))
            n = int(linha["n_pacotes"])
            reconstruida = montar_matriz(
                pacotes[indice, :n, 0], pacotes[indice, :n, 1], pacotes[indice, :n, 2]
            )
            np.testing.assert_allclose(matriz, reconstruida, rtol=0, atol=1e-6)
            np.testing.assert_allclose(matriz, x[indice], rtol=0, atol=1e-6)
            trios = exemplo["pacotes"]
            self.assertLessEqual(len(trios), 100)
            self.assertEqual(len(trios), min(n, 100))
            self.assertTrue(all(len(trio) == 3 for trio in trios))
            np.testing.assert_array_equal(
                np.asarray(trios, dtype=pacotes.dtype), pacotes[indice, :min(n, 100), :3]
            )

        chaves = set(biblioteca) | set().union(*(exemplo.keys() for exemplo in exemplos))
        for campo_sensivel in (
            "ip", "ip_origem", "ip_destino", "porta", "porta_origem",
            "porta_destino", "payload", "bytes_crus", "raw_bytes",
        ):
            self.assertNotIn(campo_sensivel, chaves)
        for exemplo in exemplos:
            self.assertEqual(set(exemplo), {
                "categoria_captura", "proto", "matriz_32x4", "pacotes", "arquivo_origem",
                "sessao", "aplicacao", "sementes_no_treino"
            })
        # Divisão por sessão: nenhum exemplo de chat, e-mail, transferência ou VoIP foi
        # treino em alguma semente; streaming não tem fluxo fora do treino em todas.
        self.assertEqual({e["categoria_captura"]: len(e["sementes_no_treino"]) for e in exemplos},
                         {"chat": 0, "email": 0, "transferencia": 0, "streaming": 1, "voip": 0})
        publicado = json.dumps(biblioteca, ensure_ascii=False).lower()
        for marcador in ("payload", "bytes_crus", "raw_bytes", "ip_origem", "ip_destino"):
            self.assertNotIn(marcador, publicado)

        with self.assertRaisesRegex(ValueError, "protocolo inválido"):
            meta_ruim = [dict(linha) for linha in meta]
            meta_ruim[primeiros[CLASSES[0]]]["proto"] = "1"
            with patch("treino.preparar_exemplos.csv.DictReader", return_value=meta_ruim):
                preparar(experimento)


if __name__ == "__main__":
    unittest.main()
