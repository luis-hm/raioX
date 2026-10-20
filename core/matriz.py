"""Port das transformações das Etapas 6 e 8 do experimento original."""

import numpy as np

CLASSES = ("chat", "email", "transferencia", "streaming", "voip")


def montar_matriz(tam, dire, t):
    """Primeiros 32 pacotes com carga útil, na ordem, em quatro canais."""
    tam, dire, t = np.asarray(tam), np.asarray(dire), np.asarray(t)
    if not (len(tam) == len(dire) == len(t)):
        raise ValueError("tamanho, direção e tempo devem ter o mesmo comprimento")
    x = np.zeros((32, 4), dtype=np.float32)
    k = min(len(tam), 32)
    if k:
        x[:k, 0] = np.clip(dire[:k] * tam[:k] / 1500.0, -1, 1)
        dt = np.zeros(k)
        dt[1:] = np.diff(t[:k].astype(np.float64)) * 1000.0
        x[:k, 1] = np.log1p(np.maximum(dt, 0))
        x[:k, 2] = 1
    return x


def estatisticas(x):
    """Média/desvio de canais 0 e 1 apenas nas posições presentes do treino."""
    p = x[:, :, 2] > 0
    mu = np.zeros(4, np.float32)
    sd = np.ones(4, np.float32)
    for c in (0, 1):
        v = x[:, :, c][p]
        if not len(v):
            raise ValueError("treino sem pacotes presentes")
        mu[c] = v.mean()
        sd[c] = v.std() + 1e-6
    return mu, sd


def normalizar(x, mu, sd):
    xn = x.astype(np.float32).copy()
    for c in (0, 1):
        xn[:, :, c] = (x[:, :, c] - mu[c]) / sd[c] * x[:, :, 2]
    return xn


def feats_rf(x):
    """As 11 estatísticas B1 da Etapa 6, sem intervalo no primeiro pacote."""
    p = x[:, :, 2] > 0
    pi = p.copy()
    pi[:, 0] = False
    tam = np.abs(x[:, :, 0]) * 1500
    iv = np.expm1(x[:, :, 1])

    def est(v, m):
        k = np.maximum(m.sum(1), 1)
        media = (v * m).sum(1) / k
        desvio = np.sqrt((((v - media[:, None]) ** 2) * m).sum(1) / k)
        minimo = np.where(m, v, np.inf).min(1)
        maximo = np.where(m, v, -np.inf).max(1)
        return [media, desvio, np.where(np.isfinite(minimo), minimo, 0),
                np.where(np.isfinite(maximo), maximo, 0)]

    cols = [p.sum(1)] + est(tam, p) + est(iv, pi) + [
        (tam * p).sum(1), (iv * pi).sum(1)
    ]
    return np.stack(cols, 1).astype(np.float32)
