"""Testes de aceite da reprodução do experimento e dados de referência."""

import csv
import os
import re
from pathlib import Path
import struct
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
EXPERIMENTO = Path(os.environ.get("RAIOX_EXPERIMENTO", "/tmp/raiox-redes-review/trabalho de redes/projeto_trafego"))


class TestSpecRaioXAplicacao(unittest.TestCase):
    def test_p_002_secrets_are_environment_configured(self):
        """Segredos não ficam escritos no código @principle:P-002"""
        pattern = re.compile(r"(?i)(?:api[_-]?key|senha|password)\s*[:=]\s*['\"]([^'\"]{8,})['\"]")
        fontes = [ROOT / "core", ROOT / "treino", ROOT / "api", ROOT / "worker"]
        for pasta in fontes:
            if not pasta.exists():
                continue
            for arquivo in pasta.rglob("*.py"):
                with arquivo.open(encoding="utf-8") as source:
                    for numero, linha in enumerate(source, 1):
                        self.assertIsNone(pattern.search(linha), f"possível segredo em {arquivo}:{numero}")

    def test_ac_001(self):
        """Preparação respeita os dados e divisões originais @spec:AC-001"""
        import numpy as np
        from core.matriz import CLASSES, estatisticas, feats_rf, montar_matriz, normalizar
        from treino.reproduzir import carregar

        proc = EXPERIMENTO / "dados_processados"
        with np.load(proc / "dataset.npz", allow_pickle=False) as z:
            x, y = z["X"], z["y"]
        pk = np.load(proc / "pk_bruto.npy", allow_pickle=False)
        with (proc / "meta.csv").open(encoding="utf-8", newline="") as f:
            meta = list(csv.DictReader(f))
        self.assertEqual(x.shape, (len(meta), 32, 4))
        self.assertEqual(tuple(CLASSES), ("chat", "email", "transferencia", "streaming", "voip"))
        self.assertEqual(set(np.unique(y).tolist()), set(range(5)))
        self.assertTrue(all(CLASSES[int(label)] == row["categoria"] for label, row in zip(y, meta)))
        for i, row in enumerate(meta):
            n = int(row["n_pacotes"])
            rebuilt = montar_matriz(pk[i, :n, 0], pk[i, :n, 1], pk[i, :n, 2])
            np.testing.assert_allclose(rebuilt, x[i], rtol=0, atol=1e-6,
                                       err_msg=f"matriz do fluxo {i}")
            self.assertTrue(np.all(rebuilt[:, 3] == 0))

        with np.load(proc / "splits.npz", allow_pickle=False) as splits:
            for seed in range(5):
                d = carregar(EXPERIMENTO, seed)
                part = splits[f"N_s{seed}_part"]
                idx_tr = splits[f"N_s{seed}_f100"]
                principal = np.array([r["principal"] == "True" for r in meta])
                idx_va = np.flatnonzero((part == 1) & principal)
                idx_te = np.flatnonzero((part == 2) & principal)
                np.testing.assert_array_equal(d["idx_tr"], idx_tr)
                np.testing.assert_array_equal(d["idx_va"], idx_va)
                np.testing.assert_array_equal(d["idx_te"], idx_te)
                np.testing.assert_array_equal(d["idx_pre"], np.flatnonzero(part == 0))
                np.testing.assert_array_equal(d["Xte"], x[idx_te])
                mu, sd = estatisticas(x[part == 0])
                np.testing.assert_array_equal(d["mu"], mu)
                np.testing.assert_array_equal(d["sd"], sd)
                xn = normalizar(d["Xte"], mu, sd)
                self.assertTrue(np.all(xn[:, :, :2][x[idx_te, :, 2] == 0] == 0))

        exemplo = montar_matriz([150, 300, 100], [1, -1, 1], [0, .01, .03])[None]
        features = feats_rf(exemplo)[0]
        self.assertEqual(features.shape, (11,))
        self.assertAlmostEqual(float(features[0]), 3)
        self.assertAlmostEqual(float(features[1]), (150 + 300 + 100) / 3, places=3)
        self.assertAlmostEqual(float(features[3]), 100, places=3)
        self.assertAlmostEqual(float(features[4]), 300, places=3)
        self.assertAlmostEqual(float(features[5]), 15, places=3)
        self.assertAlmostEqual(float(features[7]), 10, places=3)
        self.assertAlmostEqual(float(features[8]), 20, places=3)
        self.assertAlmostEqual(float(features[9]), 550, places=3)
        self.assertAlmostEqual(float(features[10]), 30, places=3)

    def test_ac_001_extracao(self):
        """Fixture pcap sintética cobre o leitor da Etapa 5 @spec:AC-001"""
        import numpy as np
        from core.extracao import extrair_fluxos, TETO_PRINCIPAL
        from core.matriz import montar_matriz

        a, b = bytes([10, 0, 0, 1]), bytes([10, 0, 0, 2])
        v6a, v6b = bytes.fromhex("20010db8000000000000000000000001"), bytes.fromhex("20010db8000000000000000000000002")

        def quadro(src, dst, sport, dport, payload, *, proto=6, flags=0, ipv6=False):
            if proto == 6:
                l4 = struct.pack("!HHIIHHHH", sport, dport, 0, 0,
                                 (5 << 12) | flags, 0, 0, 0) + payload
            else:
                l4 = struct.pack("!HHHH", sport, dport, 8 + len(payload), 0) + payload
            if ipv6:
                ip = struct.pack("!IHBB16s16s", 6 << 28, len(l4), proto, 64, src, dst) + l4
                tipo = 0x86DD
            else:
                ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + len(l4), 0, 0,
                                 64, proto, 0, src, dst) + l4
                tipo = 0x0800
            return b"\x00" * 12 + struct.pack("!H", tipo) + ip

        eventos = [
            (1.0, quadro(a, b, 1200, 443, b"a" * 100)),
            (1.1, quadro(b, a, 443, 1200, b"b" * 200)),
            (1.2, quadro(a, b, 1200, 443, b"c" * 50)),
            (1.3, quadro(a, b, 1200, 443, b"", flags=1)),
            (2.0, quadro(a, b, 3333, 53, b"x" * 5, proto=17)),
            (3.0, quadro(a, b, 1200, 443, b"d" * 70)),
            (3.1, quadro(b, a, 443, 1200, b"e" * 80)),
            (3.2, quadro(a, b, 1200, 443, b"f" * 90)),
            (64.0, quadro(a, b, 1200, 443, b"g" * 11)),
            (64.1, quadro(b, a, 443, 1200, b"h" * 12)),
            (64.2, quadro(a, b, 1200, 443, b"i" * 13)),
            (65.0, quadro(a, b, 4000, 4001, b"j")),
            (66.0, quadro(v6a, v6b, 2000, 2001, b"k" * 21, proto=17, ipv6=True)),
            (66.1, quadro(v6b, v6a, 2001, 2000, b"l" * 22, proto=17, ipv6=True)),
            (66.2, quadro(v6a, v6b, 2000, 2001, b"m" * 23, proto=17, ipv6=True)),
        ]
        with tempfile.TemporaryDirectory(prefix="raiox-pcap-") as pasta:
            caminho = Path(pasta) / "sintetico.pcap"
            with caminho.open("wb") as f:
                f.write(struct.pack("<IHHIIII", 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1))
                for instante, pacote in eventos:
                    sec = int(instante)
                    micros = round((instante - sec) * 1_000_000)
                    f.write(struct.pack("<IIII", sec, micros, len(pacote), len(pacote)))
                    f.write(pacote)
            dados, info = extrair_fluxos(caminho)

        self.assertEqual(info, {"pacotes_lidos": len(eventos), "motivo": "fim_do_arquivo",
                                "duracao_observada_s": 65.2})
        self.assertEqual(TETO_PRINCIPAL, 500)
        np.testing.assert_array_equal(dados["n"], [3, 3, 3, 3])
        np.testing.assert_array_equal(dados["ordem"], [0, 1, 2, 3])
        np.testing.assert_array_equal(dados["proto"], [6, 6, 6, 17])
        np.testing.assert_array_equal(dados["pk"][0, :3, 0], [100, 200, 50])
        np.testing.assert_array_equal(dados["pk"][0, :3, 1], [1, -1, 1])
        np.testing.assert_array_equal(dados["pk"][1, :3, 0], [70, 80, 90])
        np.testing.assert_array_equal(dados["pk"][2, :3, 0], [11, 12, 13])
        np.testing.assert_array_equal(dados["pk"][3, :3, 0], [21, 22, 23])
        self.assertEqual(set(dados), {"pk", "n", "ordem", "ini", "duracao", "proto", "serie"})
        np.testing.assert_allclose(dados["duracao"], [0.2, 0.2, 0.2, 0.2], rtol=0, atol=1e-6)
        self.assertEqual(dados["serie"], [{0: 350}, {2: 240}, {63: 36}, {65: 66}])
        matriz = montar_matriz(dados["pk"][0, :3, 0], dados["pk"][0, :3, 1],
                              dados["pk"][0, :3, 2])
        self.assertEqual(matriz.shape, (32, 4))
        self.assertEqual(int(matriz[:, 2].sum()), 3)

    def test_ac_002(self):
        """Quinze classificadores reproduzem as previsões gravadas @spec:AC-002"""
        from treino.reproduzir import comparar_artefatos_referencia

        registros = comparar_artefatos_referencia(EXPERIMENTO, ROOT / "artefatos")
        self.assertEqual(len(registros), 15)
        self.assertEqual({(r["metodo"], r["semente"]) for r in registros},
                         {(m, s) for m in ("B1", "B2", "P") for s in range(5)})
        diferentes = [f"{r['metodo']} s{r['semente']}: {r['divergencias']}/{r['n_teste']}"
                      for r in registros if r["divergencias"]]
        self.assertEqual(diferentes, [], "; ".join(diferentes))

    def test_ac_003(self):
        """Artefatos exportados preservam a inferência @spec:AC-003"""
        import json
        from treino.reproduzir import exportar_modelos

        modelos_locais = Path(os.environ.get("RAIOX_MODELOS_LOCAIS", "/tmp/raiox-cnn-all-seeds"))
        if not modelos_locais.is_dir():
            self.fail("Execute T-002 B2/P ou configure RAIOX_MODELOS_LOCAIS antes de verificar AC-003")
        with tempfile.TemporaryDirectory(prefix="raiox-ac003-") as saida:
            registros = exportar_modelos(EXPERIMENTO, modelos_locais, saida)
            self.assertEqual(len(registros), 15)
            for seed in range(5):
                pasta = Path(saida) / f"n_s{seed}"
                manifest = json.loads((pasta / "manifest.json").read_text(encoding="utf-8"))
                norm = json.loads((pasta / "norm.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["cenario"], "N")
                self.assertEqual(manifest["semente"], seed)
                self.assertEqual(manifest["fracao_rotulos"], 1.0)
                self.assertEqual(norm["semente"], seed)
                self.assertEqual(set(manifest["modelos"]), {"b1.joblib", "b2.onnx", "p.onnx", "norm.json"})
                self.assertTrue(all((pasta / nome).is_file() for nome in manifest["modelos"]))
                self.assertEqual(set(manifest["comparacao_referencia"]), {"B1", "B2", "P"})
                self.assertTrue(all(not item["previsoes_iguais_referencia"]
                                    for item in manifest["comparacao_referencia"].values()))
            self.assertTrue(all(r["onnx_preserva_torch"] for r in registros if r["metodo"] in ("B2", "P")))

    def test_ac_004(self):
        """Resultados do estudo ficam separados dos palpites da aplicação @spec:AC-004"""
        import hashlib
        import json

        results_dir = ROOT / "resultados_referencia"
        manifest_path = results_dir / "manifesto.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema_version"], 1)
        self.assertTrue(manifest["origem"]["arquivo_zip"])
        self.assertEqual(manifest["origem"]["diretorio_fontes"], "resultados/")

        expected_files = {
            "resultados.csv": (250, {"macro_f1", "cenario", "metodo", "semente"}),
            "etapa9_medias_ic95.csv": (50, {"media", "dp", "ic_inf", "ic_sup"}),
            "etapa9_testes_pareados.csv": (28, {"p", "p_holm", "veredito"}),
            "etapa9_h3_quedas.csv": (8, {"queda_a", "queda_b", "p_holm", "veredito"}),
            "etapa9_skype_N.csv": (18, {"categoria", "apps", "acerto_%"}),
        }
        entries = {entry["arquivo"]: entry for entry in manifest["arquivos"]}
        self.assertEqual(set(entries), set(expected_files))
        self.assertEqual({p.name for p in results_dir.glob("*.csv")}, set(expected_files))

        for filename, (expected_count, required_columns) in expected_files.items():
            entry = entries[filename]
            self.assertEqual(entry["origem"], f"resultados/{filename}")
            self.assertTrue(entry["descricao"].strip())
            self.assertEqual(entry["linhas_dados"], expected_count)
            path = results_dir / filename
            actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(entry["sha256"], actual_hash, filename)
            with path.open(encoding="utf-8-sig", newline="") as source:
                reader = csv.DictReader(source)
                rows = list(reader)
            self.assertEqual(len(rows), expected_count, filename)
            self.assertTrue(required_columns.issubset(reader.fieldnames or []), filename)

        exclusions = {entry["origem"]: entry for entry in manifest["exclusoes"]}
        self.assertTrue({
            "resultados/resultados_piloto.csv",
            "resultados/resultados_antes_correcao_P.csv",
            "resultados/previsoes_antes_correcao_P/",
        }.issubset(exclusions))
        self.assertEqual(exclusions["resultados/resultados_piloto.csv"]["tambem"],
                         "resultados/resultados_piloto_v2.csv")
        self.assertTrue(all(item["motivo"].strip() for item in exclusions.values()))
        self.assertFalse(any("piloto" in filename or "antes_correcao" in filename
                             for filename in {p.name for p in results_dir.iterdir()}))


if __name__ == "__main__":
    unittest.main()
