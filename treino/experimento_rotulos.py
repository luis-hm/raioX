"""Experimento isolado C1/N: 10% versus 100% dos rótulos de treino.

Uso: python -m treino.experimento_rotulos --experimento CAMINHO --saida NOVA_PASTA
Não executa treinamento na importação; a execução completa treina 30 modelos.
"""

import argparse
import json
import os
from pathlib import Path

import numpy as np

from core.matriz import feats_rf
from treino import reproduzir


SEMENTES = range(5)
FRACOES = (0.1, 1.0)
METODOS = ("B1", "B2", "P")
PASSOS = 4000


def selecionar_dez_por_cento(y, seed):
    """Seleciona ceil(10% da classe) sem reposição, na ordem do pool original."""
    y = np.asarray(y)
    if y.ndim != 1 or len(y) == 0 or not np.issubdtype(y.dtype, np.integer):
        raise ValueError("rótulos de treino inválidos")
    classes = np.unique(y)
    if not np.array_equal(classes, np.arange(5)):
        raise ValueError("o pool rotulado precisa conter as cinco classes")
    rng = np.random.RandomState(seed)
    selecionados = []
    for classe in classes:
        candidatos = np.flatnonzero(y == classe)
        tamanho = max(1, int(np.ceil(len(candidatos) * 0.1)))
        selecionados.extend(rng.choice(candidatos, size=tamanho, replace=False))
    return np.sort(np.asarray(selecionados, dtype=np.int64))


def _validar_caminhos(experimento, saida):
    experimento = Path(experimento).resolve()
    saida = Path(saida).resolve()
    if not experimento.is_dir():
        raise FileNotFoundError(f"diretório do experimento ausente: {experimento}")
    if saida.exists() or saida == experimento or saida.is_relative_to(experimento) or experimento.is_relative_to(saida):
        raise ValueError("a saída deve ser uma pasta nova e separada do experimento")
    raiz = Path(__file__).resolve().parents[1]
    for protegida in (raiz / "resultados_referencia", raiz / "artefatos"):
        protegida = protegida.resolve()
        if saida == protegida or saida.is_relative_to(protegida) or protegida.is_relative_to(saida):
            raise ValueError("a saída não pode conter artefatos ou resultados de referência")
    necessarios = [experimento / "dados_processados" / nome
                   for nome in ("dataset.npz", "splits.npz", "meta.csv")]
    necessarios.extend(experimento / "modelos" / f"pre_N_s{seed}.pt" for seed in SEMENTES)
    ausentes = [str(arquivo) for arquivo in necessarios if not arquivo.is_file()]
    if ausentes:
        raise FileNotFoundError("arquivos necessários ausentes: " + ", ".join(ausentes))
    return experimento, saida


def executar(experimento, saida):
    """Treina pares 10%/100% por método e semente e grava apenas dados locais."""
    experimento, saida = _validar_caminhos(experimento, saida)
    # Verificar todos os splits e seleções antes de criar saída ou ajustar modelo.
    preparados = []
    for seed in SEMENTES:
        dados = reproduzir.carregar(experimento, seed)
        selecao = selecionar_dez_por_cento(dados["ytr"], seed)
        if len(dados["idx_tr"]) != len(dados["ytr"]) or len(dados["Xtr"]) != len(dados["ytr"]):
            raise ValueError(f"pool rotulado inconsistente na semente {seed}")
        preparados.append((seed, dados, selecao))

    saida.mkdir(parents=True, exist_ok=False)
    relatorio = []
    for seed, completo, selecao in preparados:
        np.savez_compressed(saida / f"selecao_N_s{seed}.npz",
                            idx_pool_10=selecao, idx_dataset_10=completo["idx_tr"][selecao],
                            idx_dataset_100=completo["idx_tr"])
        for fracao in FRACOES:
            if fracao == 0.1:
                dados = dict(completo, Xtr=completo["Xtr"][selecao],
                             ytr=completo["ytr"][selecao], idx_tr=completo["idx_tr"][selecao])
            else:
                dados = completo
            for metodo in METODOS:
                if metodo == "B1":
                    modelo = reproduzir.treinar_b1(dados, seed)
                    pred_val = modelo.predict(feats_rf(dados["Xva"]))
                    pred_test = modelo.predict(feats_rf(dados["Xte"]))
                else:
                    pretreino = (experimento / "modelos" / f"pre_N_s{seed}.pt"
                                 if metodo == "P" else None)
                    modelo = reproduzir.treinar_cnn(dados, seed, PASSOS, pretreino)
                    pred_val = reproduzir.prever_cnn(modelo, dados["Xva"], dados["mu"], dados["sd"])
                    pred_test = reproduzir.prever_cnn(modelo, dados["Xte"], dados["mu"], dados["sd"])
                metricas_val = reproduzir.metricas(dados["yva"], pred_val)
                metricas_test = reproduzir.metricas(dados["yte"], pred_test)
                relatorio.append({
                    "cenario": "C1", "dobra": "N", "semente": seed,
                    "fracao_rotulos": fracao, "metodo": metodo,
                    "n_treino_rotulado": len(dados["ytr"]),
                    "n_validacao": len(dados["yva"]), "n_teste": len(dados["yte"]),
                    "passos_cnn": PASSOS if metodo != "B1" else None,
                    "macro_f1_val": metricas_val["macro_f1"],
                    "macro_f1_teste": metricas_test["macro_f1"],
                })
                (saida / "resultados.json").write_text(
                    json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")
    return relatorio


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experimento", type=Path, default=os.environ.get("RAIOX_EXPERIMENTO"))
    parser.add_argument("--saida", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.experimento is None:
        parser.error("informe --experimento ou RAIOX_EXPERIMENTO")
    executar(args.experimento, args.saida)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
