"""Etapa 5 refeita a partir dos pcaps brutos: mapeamento, extração, dataset, divisões e testes.

Porte das células do Colab (`cod_colab/colab_5`, notebook `rede`), sem usar dados processados
nem resultados anteriores. A extração é `core.extracao.extrair_fluxos`, idêntica à da Etapa 5.
"""

import os
import re
import datetime
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from core.extracao import TETO_PRINCIPAL, abrir_leitor, extrair_fluxos
from core.matriz import CLASSES, montar_matriz

SEMENTES = range(5)
AB_E_MESMA_SESSAO = True
REMOVIDOS = {'A1': {'apps': {'Skype', 'YouTube'}, 'sessoes': {'email1'}},
             'A2': {'apps': {'Facebook', 'FTPS', 'Netflix'}, 'sessoes': {'email2'}}}
PARES_AB = [('aim_chat_3a.pcap', 'aim_chat_3b.pcap'), ('email1a.pcap', 'email1b.pcap'),
            ('email2a.pcap', 'email2b.pcap'), ('facebook_audio1a.pcap', 'facebook_audio1b.pcapng'),
            ('hangouts_audio1a.pcap', 'hangouts_audio1b.pcapng'),
            ('skype_audio1a.pcap', 'skype_audio1b.pcapng'), ('skype_chat1a.pcap', 'skype_chat1b.pcap'),
            ('voipbuster_4a.pcap', 'voipbuster_4b.pcap')]


def listar_capturas(raiz):
    caminhos = sorted((Path(r) / a for r, _, fs in os.walk(raiz, followlinks=True) for a in fs
                       if a.lower().endswith(('.pcap', '.pcapng'))), key=lambda c: c.name.lower())
    return {c.name: c for c in caminhos}


def classificar(nome):
    base = re.sub(r'\.(pcapng|pcap)$', '', nome.lower())
    if 'video' in base:
        return ('', '', 'nao', 'videochamada (rótulo ambíguo)')
    if base.startswith('aim'):
        return ('chat', 'AIM', 'sim', '')
    if base.startswith('icq'):
        return ('chat', 'ICQ', 'sim', '')
    if base.startswith('skype_chat'):
        return ('chat', 'Skype', 'sim', '')
    if base.startswith('hangout') and 'chat' in base:
        return ('chat', 'Hangouts', 'sim', '')
    if base.startswith('gmailchat'):
        return ('chat', 'Hangouts', 'sim', 'gmailchat: provável Hangouts; confirmar')
    if base.startswith('facebook') and 'chat' in base:
        return ('chat', 'Facebook', 'sim', '')
    if base.startswith('email'):
        return ('email', 'Thunderbird', 'sim', '')
    if base.startswith('ftps'):
        return ('transferencia', 'FTPS', 'sim', '')
    if base.startswith('sftp') or base.startswith('scp'):
        return ('transferencia', 'SFTP/SCP', 'sim', '')
    if base.startswith('skype_file'):
        return ('transferencia', 'Skype', 'sim', '')
    for pref, app in [('netflix', 'Netflix'), ('spotify', 'Spotify'),
                      ('vimeo', 'Vimeo'), ('youtube', 'YouTube')]:
        if base.startswith(pref):
            return ('streaming', app, 'sim', '')
    if base.startswith('facebook') and 'audio' in base:
        return ('voip', 'Facebook', 'sim', '')
    if base.startswith('hangout') and 'audio' in base:
        return ('voip', 'Hangouts', 'sim', '')
    if base.startswith('skype_audio'):
        return ('voip', 'Skype', 'sim', '')
    if base.startswith('voipbuster'):
        return ('voip', 'VoipBuster', 'sim', '')
    return ('', '', 'revisar', 'nome não reconhecido')


def sessao(nome):
    base = re.sub(r'\.(pcapng|pcap)$', '', nome.lower())
    base = re.sub(r'^hangouts?', 'hangouts', base)
    if AB_E_MESMA_SESSAO:
        base = re.sub(r'(?<=\d)[ab]$', '', base)
    return base


def mapeamento(mapa):
    linhas = []
    for nome in sorted(mapa, key=str.lower):
        cat, app, inc, obs = classificar(nome)
        linhas.append([nome, mapa[nome].parent.name, round(mapa[nome].stat().st_size / 1e6, 1),
                       cat, app, sessao(nome), inc, obs])
    return pd.DataFrame(linhas, columns=['arquivo', 'pasta', 'tamanho_MB', 'categoria',
                                         'aplicacao', 'sessao', 'incluido', 'observacao'])


def resumo_captura(caminho):
    ini = fim = None
    n = 0
    with open(caminho, 'rb') as f:
        for ts, _ in abrir_leitor(f):
            if ini is None:
                ini = ts
            fim = ts
            n += 1
    return ini, fim, n


def comparar_pares_ab(mapa):
    """Evidência da hipótese 'a' e 'b' = mesma sessão (Seção 4.2)."""
    linhas = []
    for a, b in PARES_AB:
        ia, fa, na = resumo_captura(mapa[a])
        ib, fb, nb = resumo_captura(mapa[b])
        linhas.append(dict(a=a, b=b, inicio_a=str(datetime.datetime.fromtimestamp(ia)),
                           inicio_b=str(datetime.datetime.fromtimestamp(ib)),
                           diferenca_inicio_s=round(abs(ia - ib), 1),
                           duracao_a_s=round(fa - ia), duracao_b_s=round(fb - ib),
                           pacotes_a=na, pacotes_b=nb))
    return pd.DataFrame(linhas)


def _extrair_um(args):
    nome, caminho, saida = args
    t0 = datetime.datetime.now()
    linha = dict(arquivo=nome, fluxos=0, pacotes_lidos=0, motivo='', segundos=0, erro='')
    try:
        d, info = extrair_fluxos(caminho)
        # Mesmos campos gravados no Colab: o port também devolve série e duração, aqui descartadas.
        np.savez_compressed(saida, **{k: d[k] for k in ('pk', 'n', 'ordem', 'ini', 'proto')})
        linha.update(fluxos=len(d['n']), pacotes_lidos=info['pacotes_lidos'], motivo=info['motivo'])
    except Exception as e:
        linha['erro'] = str(e)
    linha['segundos'] = round((datetime.datetime.now() - t0).total_seconds(), 1)
    return linha


def extrair_todas(df_inc, mapa, pasta_fluxos, processos=3, log=print):
    pasta_fluxos.mkdir(parents=True, exist_ok=True)
    tarefas = [(n, mapa[n], pasta_fluxos / f'{n}.npz') for n in df_inc.arquivo
               if not (pasta_fluxos / f'{n}.npz').exists()]
    linhas = []
    # Maiores primeiro, para o paralelismo não terminar esperando um arquivo grande.
    tarefas.sort(key=lambda t: -t[1].stat().st_size)
    with ProcessPoolExecutor(processos) as ex:
        for linha in ex.map(_extrair_um, tarefas):
            log(f"extraído {linha['arquivo']}: {linha['fluxos']} fluxos, {linha['motivo'] or linha['erro']}")
            linhas.append(linha)
    return pd.DataFrame(linhas)


def montar_dataset(df_inc, pasta_fluxos):
    Xs, ys, pks, metas = [], [], [], []
    excedeu = total_pk = 0
    for _, r in df_inc.iterrows():
        z = np.load(pasta_fluxos / f'{r.arquivo}.npz')
        for i in range(len(z['n'])):
            k = int(z['n'][i])
            p = z['pk'][i, :k]
            X = montar_matriz(p[:, 0], p[:, 1], p[:, 2])
            excedeu += int((p[:32, 0] > 1500).sum())
            total_pk += min(k, 32)
            Xs.append(X)
            pks.append(z['pk'][i])
            ys.append(CLASSES.index(r.categoria))
            metas.append((r.arquivo, r.sessao, r.categoria, r.aplicacao, int(z['ordem'][i]),
                          float(z['ini'][i]), k, int(z['proto'][i])))
    X = np.stack(Xs)
    y = np.array(ys, dtype=np.int64)
    meta = pd.DataFrame(metas, columns=['arquivo', 'sessao', 'categoria', 'aplicacao',
                                        'ordem', 'ini', 'n_pacotes', 'proto'])
    meta['principal'] = meta['ordem'] < TETO_PRINCIPAL
    return X, y, np.stack(pks), meta, dict(acima_1500=excedeu, pacotes_32=total_pk)


def blocos_temporais(meta, idx_grupo, part, cortes):
    """Divide, dentro de cada arquivo, os fluxos principais em blocos contíguos no tempo."""
    sub = meta.loc[idx_grupo]
    sub = sub[sub.principal]
    for _, g in sub.groupby('arquivo'):
        pos = g.sort_values('ini').index.values
        m = len(pos)
        c1 = int(round(cortes[0] * m))
        c2 = int(round(cortes[1] * m))
        part[pos[:c1]] = 0
        part[pos[c1:c2]] = 1
        part[pos[c2:]] = 2


def dividir_N(meta, seed):
    rng = np.random.RandomState(seed)
    part = np.full(len(meta), -1, dtype=np.int8)
    for _, g in meta.groupby(['categoria', 'aplicacao']):
        sess = sorted(g['sessao'].unique())
        if len(sess) >= 3:
            ordem = list(rng.permutation(sess))
            nt = max(1, int(round(0.15 * len(sess))))
            nv = max(1, int(round(0.15 * len(sess))))
            for s in ordem[:nt]:
                part[g.index[g.sessao == s]] = 2
            for s in ordem[nt:nt + nv]:
                part[g.index[g.sessao == s]] = 1
            for s in ordem[nt + nv:]:
                part[g.index[g.sessao == s]] = 0
        else:
            blocos_temporais(meta, g.index, part, (0.70, 0.85))
    part[(~meta.principal.values) & (part != 0)] = -1     # extras só no treino
    return part


def dividir_A(meta, dobra, seed):
    rng = np.random.RandomState(seed)
    rem = REMOVIDOS[dobra]
    ehrem = (meta.aplicacao.isin(rem['apps']) | meta.sessao.isin(rem['sessoes'])).values
    part = np.full(len(meta), -1, dtype=np.int8)
    part[ehrem & meta.principal.values] = 2                # serviços retirados: só teste
    resto = meta[~ehrem]
    for _, g in resto.groupby(['categoria', 'aplicacao']):
        sess = sorted(g['sessao'].unique())
        if len(sess) >= 2:
            ordem = list(rng.permutation(sess))
            nv = max(1, int(round(0.15 * len(sess))))
            for s in ordem[:nv]:
                part[g.index[g.sessao == s]] = 1
            for s in ordem[nv:]:
                part[g.index[g.sessao == s]] = 0
        else:
            blocos_temporais(meta, g.index, part, (0.85, 1.0))
    part[(~meta.principal.values) & (part != 0)] = -1
    return part


def fracoes(part, y, princ, seed, frs=(0.01, 0.05, 0.10, 1.0)):
    rng = np.random.RandomState(1000 + seed)
    pool = np.where((part == 0) & princ)[0]
    out = {f: [] for f in frs}
    for c in range(5):
        perm = rng.permutation(pool[y[pool] == c])         # uma permutação por classe
        for f in frs:
            k = min(len(perm), max(5, int(np.ceil(f * len(perm)))))
            out[f].append(perm[:k])                        # prefixo => aninhado
    return {f: np.sort(np.concatenate(v)) for f, v in out.items()}


def gerar_splits(meta, y):
    princ = meta['principal'].values
    saida = {}
    for seed in SEMENTES:
        for cen in ['N', 'A1', 'A2']:
            part = dividir_N(meta, seed) if cen == 'N' else dividir_A(meta, cen, seed)
            saida[f'{cen}_s{seed}_part'] = part
            for f, idx in fracoes(part, y, princ, seed).items():
                saida[f'{cen}_s{seed}_f{int(round(f * 100))}'] = idx
    return saida


def testes_vazamento(X, y, meta, sp, pasta_fluxos):
    """Testes 1 a 5 da Seção 4.6; os quatro primeiros param a execução se falharem."""
    princ = meta['principal'].values
    assert X.shape[1:] == (32, 4)
    assert X[:, :, 3].max() == 0, 'canal de máscara deve ser 0 fora do pré-treino'
    vazias = X[:, :, 2] == 0
    assert np.abs(X[vazias]).max() == 0, 'posição vazia deve ter os 4 canais em zero'
    for arq in sorted(os.listdir(pasta_fluxos))[:5]:
        assert set(np.load(pasta_fluxos / arq).files) == {'pk', 'n', 'ordem', 'ini', 'proto'}
    assert set(meta.columns) == {'arquivo', 'sessao', 'categoria', 'aplicacao', 'ordem',
                                 'ini', 'n_pacotes', 'proto', 'principal'}
    nsess = meta.groupby(['categoria', 'aplicacao'])['sessao'].nunique()
    temporais = {k for k, v in nsess.items() if v < 3}
    for seed in SEMENTES:
        part = sp[f'N_s{seed}_part']
        for s, g in meta[princ].groupby('sessao'):
            partes = set(part[g.index]) - {-1}
            chave = (g.categoria.iloc[0], g.aplicacao.iloc[0])
            assert len(partes) == 1 or chave in temporais, f'sessão {s} em várias partições (seed {seed})'
    for seed in SEMENTES:
        for cen in ['N', 'A1', 'A2']:
            part = sp[f'{cen}_s{seed}_part']
            sess_vt = set(meta.sessao[princ & np.isin(part, [1, 2])])
            extras_treino = (part == 0) & ~princ
            assert not meta.sessao[extras_treino].isin(sess_vt).any(), 'extra de sessão de val/teste no pré-treino'
            if cen != 'N':
                rem = REMOVIDOS[cen]
                ehrem = (meta.aplicacao.isin(rem['apps']) | meta.sessao.isin(rem['sessoes'])).values
                assert not (ehrem & (part == 0)).any(), f'{cen}: serviço retirado aparece no treino/pré-treino'
                assert not (~ehrem & (part == 2)).any(), f'{cen}: teste contém serviço não retirado'
    for seed in SEMENTES:
        for cen in ['N', 'A1', 'A2']:
            part = sp[f'{cen}_s{seed}_part']
            conj = [set(sp[f'{cen}_s{seed}_f{f}']) for f in [1, 5, 10, 100]]
            assert conj[0] <= conj[1] <= conj[2] <= conj[3], 'frações não aninhadas'
            assert all(((part[i] == 0) and princ[i]) for i in conj[3]), 'rótulo fora do treino principal'
            assert set(fracoes(part, y, princ, seed)[0.05]) == conj[1], 'fração não reproduzível'
    duplicatas = {}
    for cen in ['N', 'A1', 'A2']:
        part = sp[f'{cen}_s0_part']
        tr = {X[i].tobytes() for i in np.where((part == 0) & princ)[0]}
        te = np.where((part == 2) & princ)[0]
        duplicatas[cen] = dict(duplicados=int(sum(X[i].tobytes() in tr for i in te)), teste=int(len(te)))
    return dict(blocos_temporais=sorted('/'.join(k) for k in temporais), teste5=duplicatas)
