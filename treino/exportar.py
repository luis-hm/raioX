"""Exporta os classificadores reconstituídos para uso na aplicação.

Uso: python -m treino.exportar --experimento CAMINHO --modelos CAMINHO --saida artefatos
"""

import argparse
import os
from pathlib import Path

from treino.reproduzir import exportar_modelos


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experimento", type=Path, default=os.environ.get("RAIOX_EXPERIMENTO"),
                        required="RAIOX_EXPERIMENTO" not in os.environ)
    parser.add_argument("--modelos", type=Path, required=True,
                        help="Diretório com b2_N_s*.pt e p_N_s*.pt; aceita b1_N_s*.joblib opcional")
    parser.add_argument("--saida", type=Path, default=Path("artefatos"))
    parser.add_argument("--sementes", type=int, nargs="+", default=list(range(5)))
    args = parser.parse_args()
    registros = exportar_modelos(args.experimento, args.modelos, args.saida, args.sementes)
    total = sum(r["divergencias"] for r in registros)
    print(f"Exportados {len(registros)} modelos; divergências contra referência: {total}.")
    print(f"Relatório: {args.saida / 'comparacao.json'}")


if __name__ == "__main__":
    main()
