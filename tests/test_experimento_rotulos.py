"""Contrato do runner de rótulos com arrays sintéticos e treino simulado."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from treino.experimento_rotulos import executar, selecionar_dez_por_cento


class ModeloFalso:
    def predict(self, x):
        return np.asarray(x[:, 0], dtype=np.int64)


class TestExperimentoRotulos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="raiox-rotulos-teste-")
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.experimento = self.base / "origem"
        (self.experimento / "dados_processados").mkdir(parents=True)
        (self.experimento / "modelos").mkdir()
        for nome in ("dataset.npz", "splits.npz", "meta.csv"):
            (self.experimento / "dados_processados" / nome).touch()
        for seed in range(5):
            (self.experimento / "modelos" / f"pre_N_s{seed}.pt").touch()
        self.saida = self.base / "resultado-novo"

    @staticmethod
    def dados(seed):
        ytr = np.repeat(np.arange(5, dtype=np.int64), 20)
        xtr = np.zeros((100, 32, 4), dtype=np.float32)
        xtr[:, 0, 0] = ytr
        yva = np.arange(5, dtype=np.int64)
        yte = np.arange(5, dtype=np.int64)[::-1]
        xva = np.zeros((5, 32, 4), dtype=np.float32)
        xte = np.zeros((5, 32, 4), dtype=np.float32)
        xva[:, 0, 0], xte[:, 0, 0] = yva, yte
        return dict(Xtr=xtr, ytr=ytr, Xva=xva, yva=yva, Xte=xte, yte=yte,
                    idx_tr=np.arange(100) + seed * 1000,
                    idx_va=np.arange(5) + 10000 + seed * 1000,
                    idx_te=np.arange(5) + 20000 + seed * 1000,
                    mu=np.zeros(4), sd=np.ones(4))

    def test_ac_026_pares_e_splits_fixos(self):
        """Pares estratificados preservam validação/teste e métricas @spec:AC-026"""
        b1_chamadas, cnn_chamadas, previsoes = [], [], []

        def treinar_b1(dados, seed):
            b1_chamadas.append((seed, len(dados["ytr"]), dados["idx_tr"].copy()))
            return ModeloFalso()

        def treinar_cnn(dados, seed, passos, pretreino):
            cnn_chamadas.append((seed, len(dados["ytr"]), passos, pretreino,
                                 dados["idx_tr"].copy()))
            return object()

        def prever_cnn(modelo, x, mu, sd):
            previsoes.append((x, mu, sd))
            return x[:, 0, 0].astype(np.int64)

        with patch("treino.experimento_rotulos.reproduzir.carregar",
                   side_effect=lambda origem, seed: self.dados(seed)) as carregar, \
             patch("treino.experimento_rotulos.reproduzir.treinar_b1", side_effect=treinar_b1), \
             patch("treino.experimento_rotulos.reproduzir.treinar_cnn", side_effect=treinar_cnn), \
             patch("treino.experimento_rotulos.reproduzir.prever_cnn", side_effect=prever_cnn), \
             patch("treino.experimento_rotulos.feats_rf", side_effect=lambda x: x[:, 0, :1]):
            registros = executar(self.experimento, self.saida)

        self.assertEqual([call.args[1] for call in carregar.call_args_list], list(range(5)))
        self.assertEqual(len(registros), 30)
        self.assertEqual(len(b1_chamadas), 10)
        self.assertEqual(len(cnn_chamadas), 20)
        self.assertEqual(len(previsoes), 40)
        self.assertEqual({(r["semente"], r["fracao_rotulos"], r["metodo"])
                          for r in registros},
                         {(s, f, m) for s in range(5) for f in (0.1, 1.0)
                          for m in ("B1", "B2", "P")})
        for seed in range(5):
            dados = self.dados(seed)
            with np.load(self.saida / f"selecao_N_s{seed}.npz") as selecao:
                idx = selecao["idx_pool_10"]
                np.testing.assert_array_equal(idx, selecionar_dez_por_cento(dados["ytr"], seed))
                np.testing.assert_array_equal(selecao["idx_dataset_10"], dados["idx_tr"][idx])
                np.testing.assert_array_equal(selecao["idx_dataset_100"], dados["idx_tr"])
                self.assertEqual(np.bincount(dados["ytr"][idx], minlength=5).tolist(), [2] * 5)
            pares = [r for r in registros if r["semente"] == seed]
            self.assertEqual({r["n_treino_rotulado"] for r in pares}, {10, 100})
            self.assertTrue(all(r["n_validacao"] == r["n_teste"] == 5 for r in pares))
            self.assertTrue(all(r["macro_f1_val"] == r["macro_f1_teste"] == 1.0 for r in pares))
        self.assertTrue(all(passos == 4000 for _, _, passos, _, _ in cnn_chamadas))
        self.assertEqual(sum(pre is None for _, _, _, pre, _ in cnn_chamadas), 10)
        self.assertEqual(sum(pre is not None for _, _, _, pre, _ in cnn_chamadas), 10)
        for seed, _, _, pre, _ in cnn_chamadas:
            if pre is not None:
                self.assertEqual(pre, self.experimento / "modelos" / f"pre_N_s{seed}.pt")
        for x, mu, sd in previsoes:
            self.assertEqual(x.shape, (5, 32, 4))
            np.testing.assert_array_equal(mu, np.zeros(4))
            np.testing.assert_array_equal(sd, np.ones(4))
        self.assertEqual(json.loads((self.saida / "resultados.json").read_text(encoding="utf-8")),
                         registros)

    def test_selecao_eh_deterministica_e_arredonda_por_classe(self):
        y = np.concatenate([np.full(11, classe) for classe in range(5)])
        primeiro = selecionar_dez_por_cento(y, 3)
        np.testing.assert_array_equal(primeiro, selecionar_dez_por_cento(y, 3))
        self.assertEqual(np.bincount(y[primeiro], minlength=5).tolist(), [2] * 5)
        self.assertEqual(len(np.unique(primeiro)), len(primeiro))

    def test_arquivos_ausentes_falham_antes_de_treino_e_saida(self):
        (self.experimento / "modelos" / "pre_N_s4.pt").unlink()
        with patch("treino.experimento_rotulos.reproduzir.carregar") as carregar, \
             patch("treino.experimento_rotulos.reproduzir.treinar_b1") as treinar:
            with self.assertRaisesRegex(FileNotFoundError, "pre_N_s4.pt"):
                executar(self.experimento, self.saida)
        carregar.assert_not_called()
        treinar.assert_not_called()
        self.assertFalse(self.saida.exists())

    def test_saida_existente_ou_dentro_da_origem_eh_recusada(self):
        self.saida.mkdir()
        marcador = self.saida / "nao_alterar.txt"
        marcador.write_text("intacto", encoding="utf-8")
        with patch("treino.experimento_rotulos.reproduzir.carregar") as carregar:
            with self.assertRaises(ValueError):
                executar(self.experimento, self.saida)
            with self.assertRaises(ValueError):
                executar(self.experimento, self.experimento / "resultados" / "novo")
        carregar.assert_not_called()
        self.assertEqual(marcador.read_text(encoding="utf-8"), "intacto")


if __name__ == "__main__":
    unittest.main()
