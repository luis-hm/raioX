"""Inferência local dos três métodos, sem rótulos de referência.

Os ONNX B2/P incluem a normalização da respectiva semente no próprio grafo.
Somente artefatos confiáveis do projeto devem ser carregados via Joblib.
"""

from functools import lru_cache
from pathlib import Path

import numpy as np

from core.matriz import CLASSES, feats_rf


ARTEFATOS = Path(__file__).resolve().parents[1] / "artefatos"
SEMENTES = tuple(range(5))
METODOS = ("B1", "B2", "P")


@lru_cache(maxsize=5)
def _carregar(pasta: str, semente: int):
    import joblib
    import onnxruntime as ort

    base = Path(pasta) / f"n_s{semente}"
    b1 = joblib.load(base / "b1.joblib")
    sessoes = {
        metodo: ort.InferenceSession(
            str(base / f"{metodo.lower()}.onnx"),
            providers=["CPUExecutionProvider"],
        )
        for metodo in ("B2", "P")
    }
    return b1, sessoes


def classificar(matrizes, semente: int, artefatos=ARTEFATOS):
    """Retorna, para cada fluxo, classe prevista e probabilidades por método."""
    if semente not in SEMENTES:
        raise ValueError("semente deve estar entre 0 e 4")
    x = np.ascontiguousarray(matrizes, dtype=np.float32)
    if x.ndim != 3 or x.shape[1:] != (32, 4):
        raise ValueError("matrizes devem ter formato (fluxos, 32, 4)")
    if not len(x):
        return []

    b1, sessoes = _carregar(str(Path(artefatos).resolve()), semente)
    probabilidades_b1 = np.asarray(b1.predict_proba(feats_rf(x)), dtype=np.float64)
    alinhadas = np.zeros((len(x), len(CLASSES)), dtype=np.float64)
    for coluna, classe in enumerate(b1.classes_):
        alinhadas[:, int(classe)] = probabilidades_b1[:, coluna]

    probabilidades = {"B1": alinhadas}
    for metodo, sessao in sessoes.items():
        logits = np.asarray(sessao.run(["logits"], {"matrizes": x})[0], dtype=np.float64)
        if logits.shape != (len(x), len(CLASSES)):
            raise ValueError(f"saída {metodo} incompatível com as cinco classes")
        logits -= logits.max(axis=1, keepdims=True)
        exp = np.exp(logits)
        probabilidades[metodo] = exp / exp.sum(axis=1, keepdims=True)

    return [
        {
            metodo: {
                "classe_prevista": CLASSES[int(np.argmax(probabilidades[metodo][i]))],
                "probabilidades": {
                    classe: float(probabilidades[metodo][i, j])
                    for j, classe in enumerate(CLASSES)
                },
            }
            for metodo in METODOS
        }
        for i in range(len(x))
    ]
