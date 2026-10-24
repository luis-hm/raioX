"""Gera exemplos didáticos anônimos a partir dos dados processados do ISCX.

Uso: python -m treino.preparar_exemplos [--experimento DIRETORIO] [--saida ARQUIVO]
RAIOX_EXPERIMENTO também pode indicar o diretório extraído do experimento.
"""

import argparse
import csv
import json
import os
from pathlib import Path

import numpy as np

from core.matriz import CLASSES, montar_matriz


AVISO = (
    "A categoria é herdada da captura e de seus metadados; não é uma "
    "rotulagem nem verificação independente deste fluxo."
)


REGRA = (
    "Por classe, o primeiro fluxo principal na ordem original do dataset entre os que "
    "entraram no treino do menor número de sementes do cenário N (divisão por sessão "
    "do estudo); sem seleção por previsões ou acerto de modelos."
)


def preparar(experimento):
    """Por classe, o fluxo principal menos visto no treino N; empate pela ordem do dataset."""
    processados = Path(experimento) / "dados_processados"
    with np.load(processados / "dataset.npz", allow_pickle=False) as conjunto:
        x, y = conjunto["X"], conjunto["y"]
    with np.load(processados / "splits.npz", allow_pickle=False) as splits:
        no_treino = np.stack([splits[f"N_s{s}_part"] for s in range(5)], axis=1) == 0
    pacotes = np.load(processados / "pk_bruto.npy", allow_pickle=False)
    with (processados / "meta.csv").open(encoding="utf-8", newline="") as arquivo:
        meta = list(csv.DictReader(arquivo))

    if x.ndim != 3 or x.shape[1:] != (32, 4):
        raise ValueError("dataset deve conter matrizes 32x4")
    if (len(x) != len(y) or len(x) != len(meta) or len(x) != len(pacotes)
            or len(x) != len(no_treino)):
        raise ValueError("dataset, divisões, pacotes e metadados têm tamanhos diferentes")
    protocolos = []
    for indice, metadado in enumerate(meta):
        try:
            proto = int(metadado["proto"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"protocolo inválido nos metadados do fluxo {indice}") from exc
        if str(proto) != metadado["proto"].strip() or proto not in (6, 17):
            raise ValueError(f"protocolo inválido nos metadados do fluxo {indice}")
        protocolos.append(proto)
    if set(np.unique(y).tolist()) != set(range(len(CLASSES))):
        raise ValueError("dataset não contém exatamente as cinco classes esperadas")

    escolhidos = {}
    for indice, (rotulo, metadado) in enumerate(zip(y, meta)):
        categoria = CLASSES[int(rotulo)]
        if metadado["categoria"] != categoria:
            raise ValueError(f"categoria diverge do dataset no fluxo {indice}")
        vezes = int(no_treino[indice].sum())
        if (metadado["principal"].strip().lower() == "true"
                and (categoria not in escolhidos or vezes < escolhidos[categoria][1])):
            escolhidos[categoria] = (indice, vezes)

    faltantes = [classe for classe in CLASSES if classe not in escolhidos]
    if faltantes:
        raise ValueError("sem fluxo principal para: " + ", ".join(faltantes))
    selecionados = {}
    for categoria, (indice, _) in escolhidos.items():
        metadado = meta[indice]
        n = int(metadado["n_pacotes"])
        matriz = montar_matriz(
            pacotes[indice, :n, 0],
            pacotes[indice, :n, 1],
            pacotes[indice, :n, 2],
        )
        if not np.allclose(matriz, x[indice], rtol=0, atol=1e-6):
            raise ValueError(f"matriz não confere com as fontes no fluxo {indice}")
        selecionados[categoria] = {
            "categoria_captura": categoria,
            "proto": protocolos[indice],
            "matriz_32x4": matriz.tolist(),
            "pacotes": [
                [float(tamanho), float(direcao), float(tempo)]
                for tamanho, direcao, tempo in pacotes[indice, :min(n, 100), :3]
            ],
            "arquivo_origem": metadado["arquivo"],
            "sessao": metadado["sessao"],
            "aplicacao": metadado["aplicacao"],
            "sementes_no_treino": [s for s in range(5) if no_treino[indice, s]],
        }
    return {
        "aviso": AVISO,
        "regra_selecao": REGRA,
        "exemplos": [selecionados[classe] for classe in CLASSES],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--experimento", type=Path,
        default=os.environ.get("RAIOX_EXPERIMENTO"),
        required="RAIOX_EXPERIMENTO" not in os.environ,
    )
    parser.add_argument("--saida", type=Path, default=Path("exemplos/biblioteca.json"))
    args = parser.parse_args(argv)
    biblioteca = preparar(args.experimento)
    args.saida.parent.mkdir(parents=True, exist_ok=True)
    args.saida.write_text(
        json.dumps(biblioteca, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Biblioteca criada: {args.saida} ({len(biblioteca['exemplos'])} exemplos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
