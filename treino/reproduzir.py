"""Reproduz C1/N/100% a partir do diretório extraído do experimento.

Uso: python -m treino.reproduzir --experimento CAMINHO --saida CAMINHO
RAIOX_EXPERIMENTO também pode informar o diretório do experimento.
"""

import argparse
import csv
import json
import os
import random
import time
import warnings
from pathlib import Path

import numpy as np
import torch
import joblib
from torch import nn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

from core.matriz import CLASSES, estatisticas, feats_rf, normalizar


class Encoder(nn.Module):
    def __init__(self):
        super().__init__()
        def bloco(i, o):
            return nn.Sequential(nn.Conv1d(i, o, 3, padding=1), nn.BatchNorm1d(o), nn.ReLU())
        self.convs = nn.Sequential(bloco(4, 64), bloco(64, 128), bloco(128, 128))

    def forward(self, x):
        return self.convs(x)


class CNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = Encoder()
        self.cabeca = nn.Sequential(nn.Dropout(0.3), nn.Linear(128, 5))

    def forward(self, x):
        return self.cabeca(self.encoder(x).mean(2))


class InferenciaBruta(nn.Module):
    """Wrapper ONNX: recebe a matriz 32x4 original e inclui normalização."""
    def __init__(self, modelo, mu, sd):
        super().__init__()
        self.modelo = modelo.eval()
        self.register_buffer("mu", torch.as_tensor(mu[:2], dtype=torch.float32))
        self.register_buffer("sd", torch.as_tensor(sd[:2], dtype=torch.float32))

    def forward(self, x):
        presente = x[:, :, 2:3]
        norm = (x[:, :, :2] - self.mu) / self.sd * presente
        normalizado = torch.cat((norm, x[:, :, 2:]), dim=2)
        return self.modelo(normalizado.transpose(1, 2).contiguous())


def fixar_sementes(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def para_tensor(x):
    return torch.from_numpy(np.ascontiguousarray(x.transpose(0, 2, 1))).float()


def lotes(n, bs, rng):
    while True:
        perm = rng.permutation(n)
        for i in range(0, n - bs + 1, bs):
            yield perm[i:i + bs]


def pesos_classe(y):
    cont = np.bincount(y, minlength=5).astype(np.float32)
    w = cont.sum() / (5 * np.maximum(cont, 1))
    w[cont == 0] = 0
    return torch.tensor(w)


def carregar(experimento, seed):
    """Índices C1/N idênticos à Etapa 6; nenhum campo de rede entra no lote."""
    proc = Path(experimento) / "dados_processados"
    with np.load(proc / "dataset.npz", allow_pickle=False) as dataset:
        x, y = dataset["X"], dataset["y"]
    with np.load(proc / "splits.npz", allow_pickle=False) as splits:
        part = splits[f"N_s{seed}_part"]
        idx_tr = splits[f"N_s{seed}_f100"]
    with (proc / "meta.csv").open(encoding="utf-8", newline="") as f:
        principal = np.asarray([r["principal"].lower() == "true" for r in csv.DictReader(f)])
    if len(x) != len(y) or len(x) != len(part) or len(x) != len(principal):
        raise ValueError("dataset, split e metadados têm tamanhos diferentes")
    if x.shape[1:] != (32, 4) or set(np.unique(y)) != set(range(5)):
        raise ValueError("matriz ou ordem das cinco classes inesperada")
    idx_va = np.where((part == 1) & principal)[0]
    idx_te = np.where((part == 2) & principal)[0]
    idx_pre = np.where(part == 0)[0]
    if not np.all(part[idx_tr] == 0) or not np.all(principal[idx_tr]):
        raise ValueError("índices de treino rotulado fora dos fluxos principais do treino")
    if any(len(a) == 0 for a in (idx_tr, idx_va, idx_te, idx_pre)):
        raise ValueError("uma das divisões está vazia")
    mu, sd = estatisticas(x[idx_pre])
    return dict(Xtr=x[idx_tr], ytr=y[idx_tr], Xva=x[idx_va], yva=y[idx_va],
                Xte=x[idx_te], yte=y[idx_te], mu=mu, sd=sd,
                idx_tr=idx_tr, idx_va=idx_va, idx_te=idx_te, idx_pre=idx_pre)


def treinar_b1(d, seed):
    fixar_sementes(seed)
    model = RandomForestClassifier(n_estimators=300, max_features="sqrt",
                                   class_weight="balanced", random_state=seed, n_jobs=-1)
    model.fit(feats_rf(d["Xtr"]), d["ytr"])
    model.n_jobs = 1
    return model


def treinar_cnn(d, seed, passos=4000, pretreino=None):
    """Etapas 6/7: mesmo sorteio de minibatches, perda e otimizador; CPU."""
    fixar_sementes(seed)
    xtr = para_tensor(normalizar(d["Xtr"], d["mu"], d["sd"]))
    ytr = torch.from_numpy(d["ytr"])
    model = CNN()
    if pretreino is not None:
        info = torch.load(pretreino, map_location="cpu", weights_only=True)
        model.encoder.load_state_dict(info["encoder"])
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    perda = nn.CrossEntropyLoss(weight=pesos_classe(d["ytr"]))
    bs = min(256, len(ytr))
    gen = lotes(len(ytr), bs, np.random.RandomState(seed))
    model.train()
    for _ in range(passos):
        idx = torch.from_numpy(next(gen))
        opt.zero_grad()
        loss = perda(model(xtr[idx]), ytr[idx])
        loss.backward()
        opt.step()
    return model.cpu().eval()


@torch.no_grad()
def prever_cnn(model, x, mu, sd, lote=1024):
    model.eval()
    xn = normalizar(x, mu, sd)
    return np.concatenate([
        model(para_tensor(xn[i:i + lote])).argmax(1).cpu().numpy()
        for i in range(0, len(xn), lote)
    ])


def metricas(y, pred):
    labels = list(range(5))
    por_classe = f1_score(y, pred, labels=labels, average=None, zero_division=0)
    return dict(macro_f1=float(f1_score(y, pred, labels=labels, average="macro", zero_division=0)),
                acuracia=float(accuracy_score(y, pred)),
                precisao_macro=float(precision_score(y, pred, labels=labels, average="macro", zero_division=0)),
                recall_macro=float(recall_score(y, pred, labels=labels, average="macro", zero_division=0)),
                f1_por_classe={CLASSES[i]: round(float(v), 4) for i, v in enumerate(por_classe)})


def comparar(experimento, metodo, seed, y, pred):
    nome = f"C1_N_{metodo}_frac100_seed{seed}"
    origem = Path(experimento) / "resultados" / "previsoes" / f"{nome}.npz"
    with np.load(origem, allow_pickle=False) as ref:
        y_ref, pred_ref = ref["y"], ref["pred"]
    if len(y) != len(y_ref) or len(pred) != len(pred_ref):
        raise ValueError(f"{nome}: comprimento de teste divergente")
    if not np.array_equal(y, y_ref):
        raise ValueError(f"{nome}: ordem/rótulos do teste divergem")
    divergencias = int(np.count_nonzero(pred != pred_ref))
    return dict(referencia=str(origem), n_teste=len(y), divergencias=divergencias,
                previsoes_iguais=divergencias == 0)


def exportar_modelos(experimento, modelos_dir, saida, sementes=range(5)):
    """Exporta os 15 modelos locais e valida ONNX contra PyTorch no teste.

    A igualdade contra as referências do estudo é registrada separadamente:
    este export só garante que a serialização preserva a inferência local.
    """
    import hashlib
    import platform
    import sklearn
    import torch.onnx
    import onnx
    import onnxruntime as ort

    experimento, modelos_dir, saida = map(Path, (experimento, modelos_dir, saida))
    relatorio = []
    for seed in sementes:
        d = carregar(experimento, seed)
        pasta = saida / f"n_s{seed}"
        pasta.mkdir(parents=True, exist_ok=True)
        norm = {"cenario": "N", "semente": seed, "fracao_rotulos": 1.0,
                "mu": d["mu"].tolist(), "sd": d["sd"].tolist(),
                "n_treino_com_extras": len(d["idx_pre"]),
                "n_treino_rotulado": len(d["idx_tr"]),
                "normalizacao": "canais 0 e 1; posições ausentes zeradas"}
        (pasta / "norm.json").write_text(json.dumps(norm, indent=2), encoding="utf-8")

        b1_origem = modelos_dir / f"b1_N_s{seed}.joblib"
        b1 = joblib.load(b1_origem) if b1_origem.is_file() else treinar_b1(d, seed)
        b1_path = pasta / "b1.joblib"
        joblib.dump(b1, b1_path, compress=3)
        pred_b1 = b1.predict(feats_rf(d["Xte"]))
        referencia_b1 = comparar(experimento, "B1", seed, d["yte"], pred_b1)
        relatorio.append({"metodo": "B1", "semente": seed, **referencia_b1,
                          "artefato": str(b1_path)})

        for metodo in ("B2", "P"):
            fonte = modelos_dir / f"{metodo.lower()}_N_s{seed}.pt"
            checkpoint = torch.load(fonte, map_location="cpu", weights_only=True)
            modelo = CNN().eval()
            modelo.load_state_dict(checkpoint["state_dict"])
            wrapper = InferenciaBruta(modelo, d["mu"], d["sd"]).eval()
            onnx_path = pasta / f"{metodo.lower()}.onnx"
            exemplo = torch.from_numpy(np.ascontiguousarray(d["Xte"][:2])).float()
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore", message=r"`isinstance\(treespec, LeafSpec\)` is deprecated.*",
                    category=FutureWarning,
                )
                torch.onnx.export(
                    wrapper, (exemplo,), str(onnx_path),
                    input_names=["matrizes"], output_names=["logits"],
                    dynamic_shapes={"x": {0: torch.export.Dim("lote", min=1)}},
                    opset_version=18, dynamo=True, external_data=False,
                )
            onnx.checker.check_model(str(onnx_path))
            sessao = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
            xte = np.ascontiguousarray(d["Xte"], dtype=np.float32)
            with torch.no_grad():
                logits_torch = wrapper(torch.from_numpy(xte)).numpy()
            logits_onnx = sessao.run(["logits"], {"matrizes": xte})[0]
            np.testing.assert_allclose(logits_onnx, logits_torch, rtol=1e-4, atol=1e-5)
            iguais = np.array_equal(logits_onnx.argmax(1), logits_torch.argmax(1))
            if not iguais:
                raise AssertionError(f"{metodo} s{seed}: ONNX alterou a classe prevista")
            referencia = comparar(experimento, metodo, seed, d["yte"], logits_torch.argmax(1))
            relatorio.append({"metodo": metodo, "semente": seed, **referencia,
                              "onnx_preserva_torch": True,
                              "artefato": str(onnx_path)})

        arquivos = [pasta / "b1.joblib", pasta / "b2.onnx", pasta / "p.onnx", pasta / "norm.json"]
        comparacoes_seed = {r["metodo"]: {
            "divergencias": r["divergencias"], "n_teste": r["n_teste"],
            "previsoes_iguais_referencia": r["previsoes_iguais"],
        } for r in relatorio if r["semente"] == seed}
        manifest = {
            "cenario": "N", "semente": seed, "fracao_rotulos": 1.0,
            "classes": list(CLASSES), "versao_python": platform.python_version(),
            "versao_numpy": np.__version__, "versao_sklearn": sklearn.__version__,
            "versao_torch": torch.__version__, "versao_onnxruntime": ort.__version__,
            "modelos": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in arquivos},
            "comparacao_referencia": comparacoes_seed,
            "aviso": "reconstituicao local; nao afirmar equivalencia com os classificadores do estudo",
        }
        (pasta / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    saida.mkdir(parents=True, exist_ok=True)
    (saida / "comparacao.json").write_text(json.dumps(relatorio, indent=2), encoding="utf-8")
    return relatorio


def comparar_artefatos_referencia(experimento, artefatos, sementes=range(5)):
    """Avalia os artefatos publicados contra as previsões do estudo, sem treinar."""
    import onnxruntime as ort

    experimento, artefatos = Path(experimento), Path(artefatos)
    relatorio = []
    for seed in sementes:
        d = carregar(experimento, seed)
        pasta = artefatos / f"n_s{seed}"
        meta = json.loads((pasta / "manifest.json").read_text(encoding="utf-8"))
        if meta.get("cenario") != "N" or meta.get("semente") != seed or meta.get("fracao_rotulos") != 1.0:
            raise ValueError(f"manifesto inconsistente na semente {seed}")
        b1 = joblib.load(pasta / "b1.joblib")
        pred_b1 = b1.predict(feats_rf(d["Xte"]))
        relatorio.append({"metodo": "B1", "semente": seed,
                          **comparar(experimento, "B1", seed, d["yte"], pred_b1)})
        xte = np.ascontiguousarray(d["Xte"], dtype=np.float32)
        for metodo in ("B2", "P"):
            sessao = ort.InferenceSession(str(pasta / f"{metodo.lower()}.onnx"),
                                          providers=["CPUExecutionProvider"])
            pred = sessao.run(["logits"], {"matrizes": xte})[0].argmax(1)
            relatorio.append({"metodo": metodo, "semente": seed,
                              **comparar(experimento, metodo, seed, d["yte"], pred)})
    return relatorio


def executar(experimento, saida, sementes=range(5), metodos=("B1", "B2", "P"), passos=4000):
    experimento, saida = Path(experimento), Path(saida)
    if passos != 4000:
        raise ValueError("AC-002 exige os 4000 passos originais")
    saida.mkdir(parents=True, exist_ok=True)
    relatorio = []
    for seed in sementes:
        if seed not in range(5):
            raise ValueError("sementes válidas: 0–4")
        d = carregar(experimento, seed)
        (saida / f"norm_N_s{seed}.json").write_text(json.dumps({
            "cenario": "N", "semente": seed, "mu": d["mu"].tolist(),
            "sd": d["sd"].tolist(), "n_treino_com_extras": len(d["idx_pre"]),
            "n_treino_rotulado": len(d["idx_tr"])
        }, indent=2), encoding="utf-8")
        for metodo in metodos:
            if metodo not in ("B1", "B2", "P"):
                raise ValueError(f"método desconhecido: {metodo}")
            inicio = time.time()
            if metodo == "B1":
                model = treinar_b1(d, seed)
                pred_va = model.predict(feats_rf(d["Xva"]))
                pred = model.predict(feats_rf(d["Xte"]))
                modelo_saida = saida / f"b1_N_s{seed}.joblib"
                joblib.dump(model, modelo_saida)
            else:
                pre = experimento / "modelos" / f"pre_N_s{seed}.pt" if metodo == "P" else None
                model = treinar_cnn(d, seed, passos, pre)
                pred_va = prever_cnn(model, d["Xva"], d["mu"], d["sd"])
                pred = prever_cnn(model, d["Xte"], d["mu"], d["sd"])
                modelo_saida = saida / f"{metodo.lower()}_N_s{seed}.pt"
                torch.save({"state_dict": model.state_dict(), "cenario": "N", "semente": seed,
                            "metodo": metodo, "passos": passos}, modelo_saida)
            registro = dict(cenario="C1", dobra="N", fracao_rotulos=1.0,
                            metodo=metodo, semente=seed, passos=passos if metodo != "B1" else None,
                            artefato=str(modelo_saida), segundos_treino=time.time() - inicio,
                            macro_f1_val=metricas(d["yva"], pred_va)["macro_f1"],
                            **metricas(d["yte"], pred),
                            **comparar(experimento, metodo, seed, d["yte"], pred))
            relatorio.append(registro)
            (saida / "comparacao.json").write_text(json.dumps(relatorio, indent=2), encoding="utf-8")
            print(f"{metodo} s{seed}: {registro['divergencias']}/{registro['n_teste']} divergências", flush=True)
    return relatorio


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experimento", type=Path, default=os.environ.get("RAIOX_EXPERIMENTO"), required="RAIOX_EXPERIMENTO" not in os.environ)
    parser.add_argument("--saida", type=Path, required=True)
    parser.add_argument("--sementes", type=int, nargs="+", default=list(range(5)))
    parser.add_argument("--metodos", nargs="+", default=["B1", "B2", "P"])
    args = parser.parse_args()
    registros = executar(args.experimento, args.saida, args.sementes, args.metodos)
    if any(not r["previsoes_iguais"] for r in registros):
        raise SystemExit("Previsões divergentes: confira comparacao.json")
    if len(registros) != 15:
        print(f"Execução parcial ({len(registros)}/15); AC-002 exige todas as combinações.")


if __name__ == "__main__":
    main()
