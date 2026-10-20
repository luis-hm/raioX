"""Exploração local de prefixos e sensibilidade à oclusão de um fluxo.

Usa apenas trios anônimos já guardados. Os escores não são calibrados e
as diferenças por oclusão não demonstram causalidade ou acerto do modelo.
"""

import numpy as np

from core.matriz import CLASSES, montar_matriz
from core.modelos import SEMENTES, classificar


def explicar(pacotes, semente=0, *, inferir=None):
    """Uma inferência em lote para os prefixos e as linhas ocultadas de B2/P.

    Oclusão zera todos os quatro canais da linha, inclusive a máscara de
    presença, na matriz completa dos primeiros 32 pacotes. A diferença em
    pontos percentuais usa a classe vencedora original de cada método.
    """
    if semente not in SEMENTES:
        raise ValueError("semente inválida")
    if inferir is None:
        inferir = classificar
    if not 3 <= len(pacotes) <= 100:
        raise ValueError("fluxo precisa de pelo menos três pacotes guardados")
    trios = np.asarray(pacotes, dtype=np.float64)
    if (trios.shape != (len(pacotes), 3) or not np.isfinite(trios).all()
            or (trios[:, 0] <= 0).any()
            or not np.isin(trios[:, 1], (-1, 1)).all()
            or (trios[:, 2] < 0).any()):
        raise ValueError("metadados de pacotes inválidos")

    quantidade = min(len(trios), 32)
    prefixos = [montar_matriz(trios[:n, 0], trios[:n, 1], trios[:n, 2])
                for n in range(1, quantidade + 1)]
    base = prefixos[-1]
    ocultadas = np.repeat(base[np.newaxis, :, :], quantidade, axis=0)
    ocultadas[np.arange(quantidade), np.arange(quantidade), :] = 0
    previsoes = inferir(np.concatenate((prefixos, ocultadas), axis=0), semente)
    if len(previsoes) != 2 * quantidade:
        raise ValueError("inferência incompleta")
    original = previsoes[quantidade - 1]
    classes = {metodo: original[metodo]["classe_prevista"] for metodo in ("B2", "P")}
    if any(classe not in CLASSES for classe in classes.values()):
        raise ValueError("classe inválida na inferência")
    return {
        "semente": semente,
        "n_pacotes": quantidade,
        "prefixos": [
            {"n_pacotes": i + 1, **previsoes[i]}
            for i in range(quantidade)
        ],
        "classes_originais_oclusao": classes,
        "oclusao_pp": {
            metodo: [
                100.0 * (original[metodo]["probabilidades"][classe]
                         - previsoes[quantidade + i][metodo]["probabilidades"][classe])
                for i in range(quantidade)
            ]
            for metodo, classe in classes.items()
        },
        "aviso": ("Prefixos e oclusão são explorações de sensibilidade dos modelos locais; "
                  "não medem acerto, confiança calibrada ou causalidade."),
    }
