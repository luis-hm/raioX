"""Etapa 9: análise estatística dos 250 resultados (porte das células 87–90 do notebook `rede`)."""

import json

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import confusion_matrix

from core.matriz import CLASSES

LIM, ALFA = 0.02, 0.05


def grupo(r):
    if r.cenario in ('C1', 'C2'):
        return 'N'
    if r.cenario == 'C3':
        return f'C3-{r.dobra}'
    if r.cenario == 'C4':
        return 'C4-N'
    return r.cenario                      # X1


def preparar(df):
    df = df.copy()
    df['fracao_rotulos'] = df.fracao_rotulos.round(2)
    df['taxa_perda'] = df.taxa_perda.fillna(0.0).round(2)
    df['grupo'] = df.apply(grupo, axis=1)
    chave = ['grupo', 'fracao_rotulos', 'taxa_perda', 'semente']
    assert df.duplicated(chave + ['metodo']).sum() == 0, 'linhas duplicadas'
    return df, df.pivot_table(index=chave, columns='metodo', values='macro_f1')


def holm(p):
    p = np.asarray(p, float)
    m = len(p)
    o = np.argsort(p)
    adj = np.empty(m)
    run = 0
    for k, i in enumerate(o):
        run = max(run, (m - k) * p[i])
        adj[i] = min(1, run)
    return adj


def estat(x, y):
    d = (x - y).dropna()
    n = len(d)
    if n < 2:
        return dict(n=n, dif=np.nan, dp=np.nan, ic_inf=np.nan, ic_sup=np.nan, t=np.nan, p=np.nan)
    m, s = d.mean(), d.std(ddof=1)
    h = stats.t.ppf(0.975, n - 1) * s / np.sqrt(n)
    t, p = (np.nan, np.nan) if s == 0 else stats.ttest_rel(x.loc[d.index], y.loc[d.index])
    return dict(n=n, dif=m, dp=s, ic_inf=m - h, ic_sup=m + h, t=t, p=p)


def veredito(r):
    sig, rel = r.p_holm < ALFA, abs(r.dif) >= LIM
    if sig and rel:
        return 'significativa e relevante'
    if sig:
        return 'significativa, mas < 2 pp'
    if rel:
        return 'relevante (>= 2 pp), mas não significativa'
    return 'sem evidência'


def comparar(w, a, b, grupos):
    linhas = []
    for (g, fr, tp), d in w.groupby(level=[0, 1, 2]):
        if g not in grupos or a not in d.columns or b not in d.columns:
            continue
        if g == 'C4-N' and tp == 0:
            continue          # 0% de perda já está em N
        d = d.droplevel([0, 1, 2])
        linhas.append(dict(grupo=g, fracao=fr, perda=tp, comp=f'{a} - {b}', **estat(d[a], d[b])))
    t = pd.DataFrame(linhas)
    t['p_holm'] = np.nan
    for _, idx in t.groupby(['grupo', 'perda']).groups.items():   # família: frações dentro de cada grupo/perda
        t.loc[idx, 'p_holm'] = holm(t.loc[idx, 'p'].fillna(1).values)
    t['veredito'] = t.apply(veredito, axis=1)
    return t


def ic(x):
    x = x.dropna()
    n = len(x)
    h = stats.t.ppf(0.975, n - 1) * x.std(ddof=1) / np.sqrt(n)
    return pd.Series(dict(media=x.mean(), dp=x.std(ddof=1), ic_inf=x.mean() - h, ic_sup=x.mean() + h, n=n))


def analisar(df):
    """Devolve as tabelas T1–T5 da Etapa 9."""
    df, w = preparar(df)
    res = pd.concat([comparar(w, 'P', 'B2', ['N', 'C3-A1', 'C3-A2', 'C4-N']),
                     comparar(w, 'P', 'B1', ['N', 'C3-A1', 'C3-A2', 'C4-N']),
                     comparar(w, 'P_cong', 'B2_cong', ['X1'])], ignore_index=True)
    h1 = res[(res.grupo == 'N') & (res.comp == 'P - B2') & (res.fracao <= 0.10)].copy()
    h1['p_holm'] = holm(h1.p.fillna(1).values)
    h1['veredito'] = h1.apply(veredito, axis=1)
    l = []
    for fr in [0.1, 1.0]:
        for alvo in [0.1, 0.2]:
            q = {}
            for m in ['B1', 'B2', 'P']:
                a = w.xs(('C4-N', fr), level=[0, 1])[m].unstack('taxa_perda')
                q[m] = a[0.0] - a[alvo]
            for a_, b_ in [('P', 'B2'), ('P', 'B1')]:
                l.append(dict(fracao=fr, perda=alvo, comp=f'queda {a_} - queda {b_}',
                              queda_a=q[a_].mean(), queda_b=q[b_].mean(), **estat(q[a_], q[b_])))
    h3 = pd.DataFrame(l)
    h3['p_holm'] = holm(h3.p.fillna(1).values)
    h3['veredito'] = h3.apply(veredito, axis=1)
    med = df.groupby(['grupo', 'fracao_rotulos', 'taxa_perda', 'metodo']).macro_f1.apply(ic).unstack().reset_index()
    mm = df.groupby(['grupo', 'fracao_rotulos', 'taxa_perda', 'metodo']).macro_f1.mean()
    q = []
    for fr in [0.1, 1.0]:
        for A in ['C3-A1', 'C3-A2']:
            for m in ['B1', 'B2', 'P']:
                n_, a_ = mm[('N', fr, 0.0, m)], mm[(A, fr, 0.0, m)]
                q.append(dict(fracao=fr, dobra=A, metodo=m, N=n_, A=a_, queda=n_ - a_))
    return dict(testes=res, h1=h1, h3=h3, medias=med, queda_NA=pd.DataFrame(q), df=df)


def f1_e_confusao(df, base):
    """F1 por classe e matrizes de confusão somadas das 5 sementes (100% dos rótulos)."""
    alvo = df[(df.fracao_rotulos == 1.0) & (df.taxa_perda == 0) & (df.grupo.isin(['N', 'C3-A1', 'C3-A2']))
              & (df.metodo.isin(['B1', 'B2', 'P']))]
    f1 = []
    confusao = {}
    for (g, m), sub in alvo.groupby(['grupo', 'metodo']):
        por_classe = pd.DataFrame([json.loads(s) for s in sub.f1_por_classe]).mean()
        f1.append(dict(grupo=g, metodo=m, **{c: round(float(por_classe[c]), 3) for c in CLASSES}))
        M = np.zeros((5, 5), int)
        for _, r in sub.iterrows():
            z = np.load(base / r.caminho_previsoes)
            M += confusion_matrix(z['y'], z['pred'], labels=range(5))
        confusao[f'{g}|{m}'] = M.tolist()
    return pd.DataFrame(f1), confusao


def skype(df, exp):
    """Acerto e destino dos erros do Skype contra as outras aplicações (cenário N, 100%)."""
    sk = (exp.meta.aplicacao.str.lower() == 'skype').values
    linhas = []
    for m in ['B1', 'B2', 'P']:
        cont = {(c, g): np.zeros(5, int) for c in (0, 2, 4) for g in ('Skype', 'Outras')}
        for s in range(5):
            r = df[(df.grupo == 'N') & (df.metodo == m) & (df.fracao_rotulos == 1.0) & (df.semente == s)]
            assert len(r) == 1
            z = np.load(exp.base / r.iloc[0].caminho_previsoes)
            i = np.where((exp.sp[f'N_s{s}_part'] == 2) & exp.princ)[0]
            assert np.array_equal(exp.Y[i], z['y']), 'teste da semente não confere'
            y, p, ski = z['y'], z['pred'], sk[i]
            for c in (0, 2, 4):
                for g, msk in (('Skype', ski), ('Outras', ~ski)):
                    cont[(c, g)] += np.bincount(p[msk & (y == c)], minlength=5)
        for (c, g), v in cont.items():
            n = int(v.sum())
            linhas.append(dict(metodo=m, categoria=CLASSES[c], apps=g, n=n,
                               acerto=round(100 * v[c] / max(n, 1), 1),
                               destino={CLASSES[k]: round(100 * v[k] / max(n, 1), 1) for k in range(5)}))
    return linhas
