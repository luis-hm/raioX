"""Etapas 6, 7 e 8: B1, B2, P, cenários C1–C5 e análises complementares.

Porte de `projeto_trafego/scripts/etapa6.py`, `etapa7.py` e `etapa8.py`. Mudanças:
o diretório de base é um parâmetro (`Experimento`) em vez do caminho fixo do Colab, e os
modelos de N/100% são guardados para a aplicação. Nenhuma regra de treino ou avaliação mudou.
"""

import datetime
import json
import os
import platform
import random
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

from core.matriz import CLASSES, estatisticas, feats_rf, montar_matriz, normalizar

DEV = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
COLUNAS = ['id_execucao', 'cenario', 'dobra', 'metodo', 'fracao_rotulos', 'n_fluxos_rotulados',
           'semente', 'taxa_perda', 'macro_f1', 'acuracia', 'precisao_macro', 'recall_macro',
           'f1_por_classe', 'tempo_inferencia_ms', 'tempo_treino_s', 'tempo_pretreino_s',
           'n_parametros', 'hiperparametros', 'caminho_previsoes', 'data', 'hardware']


def fixar_sementes(s):
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)
    torch.cuda.manual_seed_all(s)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def hardware():
    try:
        with open('/proc/cpuinfo') as f:
            cpu = next(l.split(':')[1].strip() for l in f if l.startswith('model name'))
    except Exception:
        cpu = platform.processor()
    gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'sem GPU'
    return f'{cpu} | {gpu} | {os.cpu_count()} CPUs | torch {torch.__version__}'


def para_tensor(Xn):
    """(N, 32, 4) -> (N, 4, 32): a convolução 1D espera canais primeiro."""
    return torch.from_numpy(np.ascontiguousarray(Xn.transpose(0, 2, 1))).float()


def metricas(y, pred):
    L = list(range(5))
    f1c = f1_score(y, pred, labels=L, average=None, zero_division=0)
    return dict(macro_f1=float(f1_score(y, pred, labels=L, average='macro', zero_division=0)),
                acuracia=float(accuracy_score(y, pred)),
                precisao_macro=float(precision_score(y, pred, labels=L, average='macro', zero_division=0)),
                recall_macro=float(recall_score(y, pred, labels=L, average='macro', zero_division=0)),
                f1_por_classe=json.dumps({CLASSES[i]: round(float(v), 4) for i, v in enumerate(f1c)}))


def medir_inferencia(fn, Xbruto, lote=256, rep=100, aquec=10):
    """Mediana (ms) do tempo para classificar um lote de 256 fluxos a partir das matrizes brutas."""
    xb = Xbruto[:lote]
    for _ in range(aquec):
        fn(xb)
    ts = []
    for _ in range(rep):
        t = time.perf_counter()
        fn(xb)
        ts.append(time.perf_counter() - t)
    return float(np.median(ts)) * 1000


# ---------- B2/P: CNN 1D (encoder e cabeça separados) ----------
class Encoder(nn.Module):
    def __init__(s):
        super().__init__()
        def bloco(i, o): return nn.Sequential(nn.Conv1d(i, o, 3, padding=1), nn.BatchNorm1d(o), nn.ReLU())
        s.convs = nn.Sequential(bloco(4, 64), bloco(64, 128), bloco(128, 128))

    def forward(s, x): return s.convs(x)                  # (B, 128, 32)


class CNN(nn.Module):
    def __init__(s):
        super().__init__()
        s.encoder = Encoder()
        s.cabeca = nn.Sequential(nn.Dropout(0.3), nn.Linear(128, 5))

    def forward(s, x): return s.cabeca(s.encoder(x).mean(2))   # média global sobre os 32 passos


class ModeloPre(nn.Module):
    """Mesmo encoder da CNN + cabeça de reconstrução (Conv1D 128->2, k=1). A cabeça é descartada depois."""
    def __init__(s):
        super().__init__()
        s.encoder = Encoder()
        s.recon = nn.Conv1d(128, 2, 1)

    def forward(s, x): return s.recon(s.encoder(x))          # (B, 2, 32)


def n_parametros(m): return sum(p.numel() for p in m.parameters())


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


@torch.no_grad()
def prever(model, Xn, lote=1024):
    model.eval()
    dv = next(model.parameters()).device
    return np.concatenate([model(para_tensor(Xn[i:i + lote]).to(dv)).argmax(1).cpu().numpy()
                           for i in range(0, len(Xn), lote)])


def treinar_cnn(d, seed, passos=4000, model=None, checkpoints=None):
    """Treina na GPU (se houver) e devolve o modelo na CPU."""
    fixar_sementes(seed)
    mu, sd = d['mu'], d['sd']
    Xtr = para_tensor(normalizar(d['Xtr'], mu, sd)).to(DEV)
    ytr = torch.from_numpy(d['ytr']).to(DEV)
    Xva_n = normalizar(d['Xva'], mu, sd)
    if model is None:
        model = CNN()
    model = model.to(DEV)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    perda = nn.CrossEntropyLoss(weight=pesos_classe(d['ytr']).to(DEV))
    n = len(ytr)
    bs = min(256, n)
    gen = lotes(n, bs, np.random.RandomState(seed))
    hist = []
    t0 = time.time()
    model.train()
    for passo in range(1, passos + 1):
        idx = torch.from_numpy(next(gen)).to(DEV)
        opt.zero_grad()
        loss = perda(model(Xtr[idx]), ytr[idx])
        loss.backward()
        opt.step()
        if checkpoints and passo in checkpoints:
            f1 = metricas(d['yva'], prever(model, Xva_n))['macro_f1']
            hist.append((passo, loss.item(), f1))
            model.train()
    if DEV.type == 'cuda':
        torch.cuda.synchronize()
    return model.cpu(), time.time() - t0, hist


def avaliar_cnn(model, d, t_tr):
    mu, sd = d['mu'], d['sd']
    model.eval()

    def f(X):
        with torch.no_grad():
            return model(para_tensor(normalizar(X, mu, sd)))
    return dict(pred_va=prever(model, normalizar(d['Xva'], mu, sd)),
                pred_te=prever(model, normalizar(d['Xte'], mu, sd)),
                tempo_treino_s=t_tr, n_parametros=n_parametros(model),
                tempo_inferencia_ms=medir_inferencia(f, d['Xte']))


# ---------- pré-treino por pacotes mascarados (Etapa 7) ----------
def mascarar(X, frac=0.15, gerador=None):
    """X: tensor (B,4,32) normalizado. Esconde ~15% dos pacotes PRESENTES (mínimo 1 por fluxo)."""
    B = X.shape[0]
    pres = X[:, 2, :] > 0
    k = pres.sum(1)
    n_m = torch.clamp(torch.round(frac * k.float()).long(), min=1)
    n_m = torch.minimum(n_m, k)
    r = torch.rand(B, 32, device=X.device, generator=gerador)
    r = torch.where(pres, r, torch.full_like(r, 2.0))        # posições vazias nunca são sorteadas
    rank = r.argsort(1).argsort(1)
    m = (rank < n_m[:, None]) & pres
    Xm = X.clone()
    Xm[:, 0, :] = Xm[:, 0, :] * (~m)                         # apaga tamanho/direção e intervalo
    Xm[:, 1, :] = Xm[:, 1, :] * (~m)
    Xm[:, 3, :] = m.float()                                  # canal 3 avisa onde está a máscara
    return Xm, X[:, :2, :].clone(), m


def perda_mascarada(pred, alvo, m):
    mm = m[:, None, :].float()
    return (((pred - alvo) ** 2) * mm).sum() / (mm.sum() * 2).clamp(min=1)


@torch.no_grad()
def mse_validacao(modelo, Xva_t, semente=123):
    modelo.eval()
    g = torch.Generator(device=Xva_t.device)
    g.manual_seed(semente)
    Xm, alvo, m = mascarar(Xva_t, gerador=g)
    return perda_mascarada(modelo(Xm), alvo, m).item()


class Experimento:
    """Dados processados de uma execução e os caminhos onde ela grava."""

    def __init__(self, base):
        self.base = Path(base)
        proc = self.base / 'dados_processados'
        z = np.load(proc / 'dataset.npz')
        self.X, self.Y = z['X'], z['y']
        self.meta = pd.read_csv(proc / 'meta.csv')
        self.sp = dict(np.load(proc / 'splits.npz'))
        self.princ = self.meta['principal'].values
        self.pk = np.load(proc / 'pk_bruto.npy')
        self.npk = self.meta['n_pacotes'].values
        self.resultados = self.base / 'resultados' / 'resultados.csv'
        self.modelos = self.base / 'modelos'
        for p in (self.base / 'resultados' / 'previsoes', self.modelos / 'app'):
            p.mkdir(parents=True, exist_ok=True)

    # ---------- dados ----------
    def carregar(self, cen, seed, frac):
        """cen em N/A1/A2; frac em 1/5/10/100. Devolve dados BRUTOS e as estatísticas do treino."""
        part = self.sp[f'{cen}_s{seed}_part']
        idx_tr = self.sp[f'{cen}_s{seed}_f{frac}']
        idx_va = np.where((part == 1) & self.princ)[0]
        idx_te = np.where((part == 2) & self.princ)[0]
        idx_pre = np.where(part == 0)[0]
        mu, sd = estatisticas(self.X[idx_pre])
        return dict(Xtr=self.X[idx_tr], ytr=self.Y[idx_tr], Xva=self.X[idx_va], yva=self.Y[idx_va],
                    Xte=self.X[idx_te], yte=self.Y[idx_te], mu=mu, sd=sd,
                    idx_tr=idx_tr, idx_va=idx_va, idx_te=idx_te, idx_pre=idx_pre)

    # ---------- registro ----------
    def ja_existe(self, nome):
        return (self.resultados.exists()
                and nome in pd.read_csv(self.resultados, usecols=['id_execucao'])['id_execucao'].values)

    def salvar_resultado(self, linha, y, pred, nome):
        prev = self.base / 'resultados' / 'previsoes' / f'{nome}.npz'
        np.savez_compressed(prev, y=y, pred=pred)
        linha = dict(linha, id_execucao=nome, caminho_previsoes=str(prev.relative_to(self.base)),
                     hardware=hardware(), data=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
        row = {c: linha.get(c, '') for c in COLUNAS}
        pd.DataFrame([row]).to_csv(self.resultados, mode='a', header=not self.resultados.exists(), index=False)

    # ---------- B1 ----------
    def rodar_b1(self, d, seed):
        fixar_sementes(seed)
        t0 = time.time()
        rf = RandomForestClassifier(n_estimators=300, max_features='sqrt', class_weight='balanced',
                                    random_state=seed, n_jobs=-1)
        rf.fit(feats_rf(d['Xtr']), d['ytr'])
        t_tr = time.time() - t0
        rf.n_jobs = 1                                         # inferência medida em um núcleo
        return dict(pred_va=rf.predict(feats_rf(d['Xva'])), pred_te=rf.predict(feats_rf(d['Xte'])),
                    tempo_treino_s=t_tr, n_parametros='', modelo=rf,
                    tempo_inferencia_ms=medir_inferencia(lambda X: rf.predict(feats_rf(X)), d['Xte']))

    def rodar_b2(self, d, seed, passos):
        model, t_tr, _ = treinar_cnn(d, seed, passos)
        return dict(avaliar_cnn(model, d, t_tr), modelo=model)

    # ---------- P ----------
    def caminho_pre(self, cen, seed):
        return self.modelos / f'pre_{cen}_s{seed}.pt'

    def pretreinar(self, d, seed, epocas=30, bs=512):
        """Pré-treina com o treino inteiro do cenário (inclui os fluxos extras). NÃO usa rótulos."""
        fixar_sementes(seed)
        Xpre = para_tensor(normalizar(self.X[d['idx_pre']], d['mu'], d['sd'])).to(DEV)
        Xva = para_tensor(normalizar(d['Xva'], d['mu'], d['sd'])).to(DEV)
        modelo = ModeloPre().to(DEV)
        opt = torch.optim.AdamW(modelo.parameters(), lr=1e-3, weight_decay=1e-4)
        g = torch.Generator(device=DEV)
        g.manual_seed(seed)
        rng = np.random.RandomState(seed)
        n = len(Xpre)
        hist = []
        t0 = time.time()
        for ep in range(1, epocas + 1):
            modelo.train()
            perm = rng.permutation(n)
            soma = 0.0
            nb = 0
            for i in range(0, n, bs):
                xb = Xpre[torch.from_numpy(perm[i:i + bs]).to(DEV)]
                Xm, alvo, m = mascarar(xb, gerador=g)
                opt.zero_grad()
                loss = perda_mascarada(modelo(Xm), alvo, m)
                loss.backward()
                opt.step()
                soma += loss.item()
                nb += 1
            hist.append((ep, soma / nb, mse_validacao(modelo, Xva)))
        return modelo.cpu(), time.time() - t0, hist

    def garantir_pretreino(self, cen, seed):
        """Pré-treina uma vez por (cenário, semente). Independe da fração de rótulos."""
        cam = self.caminho_pre(cen, seed)
        if cam.exists():
            return torch.load(cam, map_location='cpu')
        d = self.carregar(cen, seed, 100)
        modelo, t, hist = self.pretreinar(d, seed)
        info = dict(encoder=modelo.encoder.state_dict(), tempo_s=t, hist=hist, n_pre=len(d['idx_pre']))
        torch.save(info, cam)
        return info

    def rodar_p(self, d, seed, passos, info):
        fixar_sementes(seed)                    # a cabeça nova precisa da MESMA inicialização em toda execução
        model = CNN()
        model.encoder.load_state_dict(info['encoder'])
        model, t_tr, _ = treinar_cnn(d, seed, passos, model=model)
        return dict(avaliar_cnn(model, d, t_tr), modelo=model)

    # ---------- uma execução C1/C2/C3 ----------
    def guardar_para_app(self, metodo, cen, seed, frac, modelo):
        # Os classificadores de N/100% (C1) servem às análises do site; não mudam o registro.
        if cen == 'N' and frac == 100:
            if metodo == 'B1':
                joblib.dump(modelo, self.modelos / 'app' / f'b1_N_s{seed}.joblib')
            else:
                torch.save({'state_dict': modelo.state_dict(), 'cenario': 'N', 'semente': seed,
                            'metodo': metodo}, self.modelos / 'app' / f'{metodo.lower()}_N_s{seed}.pt')

    def executar(self, metodo, cen, seed, frac, passos, cenario_nome):
        nome = f'{cenario_nome}_{cen}_{metodo}_frac{frac}_seed{seed}'
        if self.ja_existe(nome):
            return None
        d = self.carregar(cen, seed, frac)
        hp = dict(passos=passos if metodo != 'B1' else None)
        t_pre = ''
        if metodo == 'B1':
            r = self.rodar_b1(d, seed)
        elif metodo == 'B2':
            r = self.rodar_b2(d, seed, passos)
        else:
            info = self.garantir_pretreino(cen, seed)
            r = self.rodar_p(d, seed, passos, info)
            t_pre = round(info['tempo_s'], 1)
            hp.update(pre_epocas=30, pre_mascara=0.15, pre_bs=512)
        self.guardar_para_app(metodo, cen, seed, frac, r['modelo'])
        m, mv = metricas(d['yte'], r['pred_te']), metricas(d['yva'], r['pred_va'])
        hp['macro_f1_val'] = round(mv['macro_f1'], 4)
        linha = dict(cenario=cenario_nome, dobra=cen, metodo=metodo, fracao_rotulos=frac / 100,
                     n_fluxos_rotulados=len(d['ytr']), semente=seed, taxa_perda=0, **m,
                     tempo_inferencia_ms=round(r['tempo_inferencia_ms'], 2),
                     tempo_treino_s=round(r['tempo_treino_s'], 1), tempo_pretreino_s=t_pre,
                     n_parametros=r['n_parametros'], hiperparametros=json.dumps(hp))
        self.salvar_resultado(linha, d['yte'], r['pred_te'], nome)
        return m

    # ---------- C4: perda de pacotes só no teste ----------
    def perder(self, idx, p, seed):
        """Remove cada pacote com probabilidade p ANTES do corte em 32 e recalcula os intervalos.
        O sorteio u é o mesmo para todo p (a perda de 20% contém a de 10%) e para todos os métodos."""
        rng = np.random.RandomState(10000 + seed)
        out = np.zeros((len(idx), 32, 4), np.float32)
        for j, i in enumerate(idx):
            k = int(self.npk[i])
            pk = self.pk[i, :k]
            u = rng.rand(k)
            if p > 0:
                pk = pk[u >= p]
            out[j] = montar_matriz(pk[:, 0], pk[:, 1], pk[:, 2])
        return out

    def treinar_metodo(self, metodo, cen, d, seed, passos):
        if metodo == 'B1':
            fixar_sementes(seed)
            t0 = time.time()
            rf = RandomForestClassifier(n_estimators=300, max_features='sqrt', class_weight='balanced',
                                        random_state=seed, n_jobs=-1)
            rf.fit(feats_rf(d['Xtr']), d['ytr'])
            t = time.time() - t0
            rf.n_jobs = 1
            return (lambda X: rf.predict(feats_rf(X))), t, ''
        fixar_sementes(seed)
        model = CNN()
        if metodo == 'P':
            model.encoder.load_state_dict(self.garantir_pretreino(cen, seed)['encoder'])
        model, t, _ = treinar_cnn(d, seed, passos, model=model)
        mu, sd = d['mu'], d['sd']
        return (lambda X: prever(model, normalizar(X, mu, sd))), t, n_parametros(model)

    def executar_c4(self, metodo, seed, frac, passos, perdas=(0.0, 0.1, 0.2), cen='N'):
        nomes = {p: f'C4_{cen}_{metodo}_frac{frac}_seed{seed}_perda{int(round(p * 100))}' for p in perdas}
        if all(self.ja_existe(n) for n in nomes.values()):
            return
        d = self.carregar(cen, seed, frac)
        f, t, npar = self.treinar_metodo(metodo, cen, d, seed, passos)
        for p in perdas:
            if self.ja_existe(nomes[p]):
                continue
            pred = f(self.perder(d['idx_te'], p, seed))
            m = metricas(d['yte'], pred)
            linha = dict(cenario='C4', dobra=cen, metodo=metodo, fracao_rotulos=frac / 100,
                         n_fluxos_rotulados=len(d['ytr']), semente=seed, taxa_perda=p, **m,
                         tempo_treino_s=round(t, 1), n_parametros=npar,
                         hiperparametros=json.dumps(dict(passos=passos if metodo != 'B1' else None,
                                                         semente_perda=10000 + seed)))
            self.salvar_resultado(linha, d['yte'], pred, nomes[p])

    # ---------- X1: codificador congelado ----------
    def treinar_congelado(self, d, seed, passos, info=None):
        fixar_sementes(seed)
        mu, sd = d['mu'], d['sd']
        Xtr = para_tensor(normalizar(d['Xtr'], mu, sd)).to(DEV)
        ytr = torch.from_numpy(d['ytr']).to(DEV)
        model = CNN()
        if info is not None:
            model.encoder.load_state_dict(info['encoder'])
        for q in model.encoder.parameters():
            q.requires_grad = False
        model = model.to(DEV)
        opt = torch.optim.AdamW(model.cabeca.parameters(), lr=1e-3, weight_decay=1e-4)
        perda = nn.CrossEntropyLoss(weight=pesos_classe(d['ytr']).to(DEV))
        n = len(ytr)
        bs = min(256, n)
        gen = lotes(n, bs, np.random.RandomState(seed))
        t0 = time.time()
        model.train()
        model.encoder.eval()     # encoder totalmente congelado (BatchNorm incluso)
        for _ in range(passos):
            idx = torch.from_numpy(next(gen)).to(DEV)
            opt.zero_grad()
            loss = perda(model(Xtr[idx]), ytr[idx])
            loss.backward()
            opt.step()
        if DEV.type == 'cuda':
            torch.cuda.synchronize()
        return model.cpu(), time.time() - t0

    def executar_cong(self, metodo, cen, seed, frac, passos):
        nome = f'X1_{cen}_{metodo}_frac{frac}_seed{seed}'
        if self.ja_existe(nome):
            return None
        d = self.carregar(cen, seed, frac)
        info = self.garantir_pretreino(cen, seed) if metodo == 'P_cong' else None
        model, t = self.treinar_congelado(d, seed, passos, info)
        r = avaliar_cnn(model, d, t)
        m, mv = metricas(d['yte'], r['pred_te']), metricas(d['yva'], r['pred_va'])
        linha = dict(cenario='X1', dobra=cen, metodo=metodo, fracao_rotulos=frac / 100,
                     n_fluxos_rotulados=len(d['ytr']), semente=seed, taxa_perda=0, **m,
                     tempo_inferencia_ms=round(r['tempo_inferencia_ms'], 2), tempo_treino_s=round(t, 1),
                     n_parametros=r['n_parametros'],
                     hiperparametros=json.dumps(dict(passos=passos, macro_f1_val=round(mv['macro_f1'], 4),
                                                     encoder='congelado')))
        self.salvar_resultado(linha, d['yte'], r['pred_te'], nome)
        return m

    # ---------- oclusão ----------
    @torch.no_grad()
    def oclusao(self, model, X, mu, sd, lote=512):
        """Zera um pacote por vez (canais 0, 1 e 2) e mede a queda na probabilidade da classe prevista."""
        model = model.to(DEV).eval()
        T = para_tensor(normalizar(X, mu, sd)).to(DEV)
        soma = np.zeros((5, 32))
        cont = np.zeros((5, 32))
        for i in range(0, len(T), lote):
            xb = T[i:i + lote]
            p0 = torch.softmax(model(xb), 1)
            cls = p0.argmax(1)
            base = p0.gather(1, cls[:, None])[:, 0]
            pres = xb[:, 2, :] > 0
            for j in range(32):
                xo = xb.clone()
                xo[:, 0:3, j] = 0
                pj = torch.softmax(model(xo), 1).gather(1, cls[:, None])[:, 0]
                queda = base - pj
                for c in range(5):
                    sel = pres[:, j] & (cls == c)
                    soma[c, j] += queda[sel].sum().item()
                    cont[c, j] += sel.sum().item()
        model.cpu()
        return soma / np.maximum(cont, 1), cont

    def analise_oclusao(self, passos, minimo=5):
        d = self.carregar('N', 0, 100)
        saida = {}
        for met in ('B2', 'P'):
            fixar_sementes(0)
            model = CNN()
            if met == 'P':
                model.encoder.load_state_dict(self.garantir_pretreino('N', 0)['encoder'])
            model, _, _ = treinar_cnn(d, 0, passos, model=model)
            mat, cont = self.oclusao(model, d['Xte'], d['mu'], d['sd'])
            m = np.where(cont >= minimo, mat, np.nan)
            saida[met] = dict(
                queda=[[None if np.isnan(v) else round(float(v), 4) for v in linha] for linha in m],
                contagem=cont.astype(int).tolist(),
                top3={c: [int(t) + 1 for t in np.argsort(-np.nan_to_num(m[i], nan=-1))[:3]]
                      for i, c in enumerate(CLASSES)})
        return saida

    # ---------- exposição de informação ----------
    def exposicao(self, seed, n_arvores=300):
        part = self.sp[f'N_s{seed}_part']
        idx_tr = self.sp[f'N_s{seed}_f100']
        idx_te = np.where((part == 2) & self.princ)[0]
        app = (self.meta.categoria + '|' + self.meta.aplicacao).values
        cat = self.meta.categoria.values
        Xf = self.X.reshape(len(self.X), -1)

        def rf(y):
            m = RandomForestClassifier(n_estimators=n_arvores, class_weight='balanced', random_state=seed, n_jobs=-1)
            m.fit(Xf[idx_tr], y[idx_tr])
            return m.predict(Xf[idx_te])
        pa, pc = rf(app), rf(cat)
        labs_a, labs_c = np.unique(app[idx_te]), np.unique(cat[idx_te])
        return dict(semente=seed, n_apps_teste=len(labs_a),
                    f1_aplicacao=f1_score(app[idx_te], pa, labels=labs_a, average='macro', zero_division=0),
                    acc_aplicacao=accuracy_score(app[idx_te], pa),
                    f1_categoria_direto=f1_score(cat[idx_te], pc, labels=labs_c, average='macro', zero_division=0),
                    f1_categoria_via_app=f1_score(cat[idx_te], np.array([x.split('|')[0] for x in pa]),
                                                  labels=labs_c, average='macro', zero_division=0))
