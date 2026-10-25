"""Refaz o experimento inteiro a partir dos pcaps brutos, na ordem do notebook `rede`.

Uso: python -m experimento.executar --pcaps /home/dev/dados/REDES --base /home/dev/dados/experimento
Retomável: etapas e execuções já gravadas são puladas.
"""

import argparse
import datetime
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from core.matriz import CLASSES
from experimento import etapa5, etapa9

RAIZ = Path(__file__).resolve().parents[1]
CKPT = [500, 1000, 1500, 2000, 3000, 4000]


def log(msg, arquivo=None):
    linha = f"[{datetime.datetime.now():%H:%M:%S}] {msg}"
    print(linha, flush=True)
    if arquivo:
        with open(arquivo, 'a', encoding='utf-8') as f:
            f.write(linha + '\n')


def preparar_dados(pcaps, base, registrar):
    proc = base / 'dados_processados'
    if (proc / 'splits.npz').exists():
        registrar('Etapa 5 já concluída; reaproveitando dados processados desta execução.')
        return json.loads((base / 'resultados' / 'etapa5.json').read_text(encoding='utf-8'))
    proc.mkdir(parents=True, exist_ok=True)
    (base / 'resultados').mkdir(parents=True, exist_ok=True)
    mapa = etapa5.listar_capturas(pcaps)
    tamanho = sum(c.stat().st_size for c in mapa.values())
    registrar(f'{len(mapa)} capturas, {tamanho / 1e9:.2f} GB')
    if len(mapa) != 109:
        raise SystemExit(f'esperadas 109 capturas NonVPN, encontradas {len(mapa)}')
    df = etapa5.mapeamento(mapa)
    df.to_csv(base / 'mapeamento.csv', index=False)
    if (df.incluido == 'revisar').any():
        raise SystemExit('capturas sem regra de mapeamento: ' + ', '.join(df[df.incluido == 'revisar'].arquivo))
    registrar('Comparando pares a/b (mesma sessão)...')
    pares = etapa5.comparar_pares_ab(mapa)
    pares.to_csv(base / 'resultados' / 'pares_ab.csv', index=False)
    df_inc = df[df.incluido == 'sim'].reset_index(drop=True)
    registrar(f'Extraindo {len(df_inc)} capturas incluídas ({(df.incluido == "nao").sum()} videochamadas excluídas)...')
    t0 = time.time()
    extr = etapa5.extrair_todas(df_inc, mapa, proc / 'fluxos', log=registrar)
    if len(extr) and (extr.erro != '').any():
        raise SystemExit('erros na extração: ' + extr[extr.erro != ''].to_string())
    extr.to_csv(base / 'logs_extracao.csv', index=False)
    X, y, pk, meta, contagem = etapa5.montar_dataset(df_inc, proc / 'fluxos')
    np.savez_compressed(proc / 'dataset.npz', X=X, y=y)
    np.save(proc / 'pk_bruto.npy', pk)
    meta.to_csv(proc / 'meta.csv', index=False)
    sp = etapa5.gerar_splits(meta, y)
    np.savez_compressed(proc / 'splits.npz', **sp)
    testes = etapa5.testes_vazamento(X, y, meta, sp, proc / 'fluxos')
    registrar(f'Testes de vazamento 1–4 OK; teste 5: {testes["teste5"]}')
    info = dict(capturas_total=len(mapa), tamanho_gb=round(tamanho / 1e9, 2),
                capturas_incluidas=len(df_inc), excluidas=df[df.incluido == 'nao'].arquivo.tolist(),
                fluxos=int(len(meta)), principais=int(meta.principal.sum()),
                extras=int((~meta.principal).sum()), segundos_extracao=round(time.time() - t0),
                acima_1500=contagem, testes=testes)
    (base / 'resultados' / 'etapa5.json').write_text(json.dumps(info, indent=2, ensure_ascii=False), encoding='utf-8')
    return info


def escolher_passos(exp, registrar):
    """Célula 44: curva de macro-F1 de validação em C1 (sementes 0–2)."""
    arq = exp.base / 'resultados' / 'escolha_passos_c1.csv'
    if not arq.exists():
        from experimento.metodos import treinar_cnn
        linhas = []
        for seed in [0, 1, 2]:
            d = exp.carregar('N', seed, 100)
            _, seg, hist = treinar_cnn(d, seed, passos=4000, checkpoints=CKPT)
            registrar(f'escolha de passos, semente {seed}: {seg:.0f}s')
            linhas += [(seed, p, f1) for p, _, f1 in hist]
        pd.DataFrame(linhas, columns=['semente', 'passos', 'macro_f1_val']).to_csv(arq, index=False)
    t = pd.read_csv(arq)
    resumo = t.groupby('passos')['macro_f1_val'].agg(['mean', 'std']).round(4)
    melhor = resumo['mean'].max()
    passos = int(resumo[resumo['mean'] >= melhor - 0.01].index.min())
    registrar(f'Passos escolhidos na validação: {passos}')
    return passos, resumo.reset_index().to_dict('records')


def rodar_cenarios(exp, passos, registrar):
    t0 = time.time()
    for seed in range(5):                              # célula 69: C1 e C2
        for frac in (1, 5, 10, 100):
            nome_c = 'C1' if frac == 100 else 'C2'
            for metodo in ('B1', 'B2', 'P'):
                exp.executar(metodo, 'N', seed, frac, passos, nome_c)
        registrar(f'C1/C2 semente {seed} ok | {time.time() - t0:.0f}s')
    for dobra in ('A1', 'A2'):                         # célula 73: C3
        for seed in range(5):
            for frac in (10, 100):
                for metodo in ('B1', 'B2', 'P'):
                    exp.executar(metodo, dobra, seed, frac, passos, 'C3')
            registrar(f'C3 {dobra} semente {seed} ok | {time.time() - t0:.0f}s')
    for seed in range(5):                              # célula 75: X1
        for frac in (1, 5, 10, 100):
            for metodo in ('P_cong', 'B2_cong'):
                exp.executar_cong(metodo, 'N', seed, frac, passos)
        registrar(f'X1 semente {seed} ok | {time.time() - t0:.0f}s')
    for seed in range(5):                              # célula 78: C4
        for frac in (10, 100):
            for metodo in ('B1', 'B2', 'P'):
                exp.executar_c4(metodo, seed, frac, passos)
        registrar(f'C4 semente {seed} ok | {time.time() - t0:.0f}s')
    df = pd.read_csv(exp.resultados)
    contagem = df.cenario.value_counts().to_dict()
    if contagem != {'C4': 90, 'C3': 60, 'C2': 45, 'X1': 40, 'C1': 15} or not df.id_execucao.is_unique:
        raise SystemExit(f'contagem inesperada de execuções: {contagem}')
    c4 = df[(df.cenario == 'C4') & (df.taxa_perda == 0)].set_index(['metodo', 'fracao_rotulos', 'semente']).macro_f1
    ref = df[df.cenario.isin(['C1', 'C2']) & df.fracao_rotulos.isin([.1, 1.0])].set_index(
        ['metodo', 'fracao_rotulos', 'semente']).macro_f1
    dif = float((c4 - ref.reindex(c4.index)).abs().max())
    registrar(f'250 execuções; consistência C4(0%) × C1/C2: diferença máxima {dif:.4f}')
    return df, dif


def exportar_app(exp, saida, registrar):
    """Exporta B1/B2/P de N/100% no mesmo formato de `artefatos/` (ONNX com normalização)."""
    import joblib
    import onnxruntime as ort
    import torch
    from experimento.metodos import CNN
    from treino.reproduzir import InferenciaBruta

    for seed in range(5):
        d = exp.carregar('N', seed, 100)
        pasta = saida / f'n_s{seed}'
        pasta.mkdir(parents=True, exist_ok=True)
        (pasta / 'norm.json').write_text(json.dumps(dict(
            cenario='N', semente=seed, fracao_rotulos=1.0, mu=d['mu'].tolist(), sd=d['sd'].tolist(),
            n_treino_com_extras=len(d['idx_pre']), n_treino_rotulado=len(d['idx_tr']),
            normalizacao='canais 0 e 1; posições ausentes zeradas'), indent=2), encoding='utf-8')
        joblib.dump(joblib.load(exp.modelos / 'app' / f'b1_N_s{seed}.joblib'), pasta / 'b1.joblib', compress=3)
        xte = np.ascontiguousarray(d['Xte'], dtype=np.float32)
        for metodo in ('B2', 'P'):
            modelo = CNN().eval()
            modelo.load_state_dict(torch.load(exp.modelos / 'app' / f'{metodo.lower()}_N_s{seed}.pt',
                                              map_location='cpu', weights_only=True)['state_dict'])
            wrapper = InferenciaBruta(modelo, d['mu'], d['sd']).eval()
            onnx_path = pasta / f'{metodo.lower()}.onnx'
            torch.onnx.export(wrapper, (torch.from_numpy(xte[:2]),), str(onnx_path),
                              input_names=['matrizes'], output_names=['logits'],
                              dynamic_shapes={'x': {0: torch.export.Dim('lote', min=1)}},
                              opset_version=18, dynamo=True, external_data=False)
            sessao = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
            with torch.no_grad():
                esperado = wrapper(torch.from_numpy(xte)).numpy().argmax(1)
            obtido = sessao.run(['logits'], {'matrizes': xte})[0].argmax(1)
            if not np.array_equal(esperado, obtido):
                raise SystemExit(f'{metodo} s{seed}: ONNX alterou a classe prevista')
            ref = np.load(exp.base / 'resultados' / 'previsoes' / f'C1_N_{metodo}_frac100_seed{seed}.npz')['pred']
            if not np.array_equal(obtido, ref):
                raise SystemExit(f'{metodo} s{seed}: modelo exportado diverge das previsões registradas')
        arquivos = [pasta / n for n in ('b1.joblib', 'b2.onnx', 'p.onnx', 'norm.json')]
        (pasta / 'manifest.json').write_text(json.dumps(dict(
            cenario='N', semente=seed, fracao_rotulos=1.0, classes=list(CLASSES),
            modelos={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in arquivos},
            origem='experimento refeito a partir dos pcaps (experimento/executar.py)'), indent=2), encoding='utf-8')
    registrar(f'Modelos da aplicação exportados em {saida}')


def amostra_fluxos(exp, por_classe=12):
    """Fluxos de teste (N, semente 0) com os palpites registrados em C1, para a demonstração."""
    i_te = np.where((exp.sp['N_s0_part'] == 2) & exp.princ)[0]
    pred = {m: np.load(exp.base / 'resultados' / 'previsoes' / f'C1_N_{m}_frac100_seed0.npz')['pred']
            for m in ('B1', 'B2', 'P')}
    escolhidos = []
    for c in range(5):
        escolhidos += [j for j in range(len(i_te)) if exp.Y[i_te[j]] == c][:por_classe]
    saida = []
    for j in sorted(escolhidos):
        i = i_te[j]
        k = int(exp.npk[i])
        saida.append(dict(rotulo=CLASSES[int(exp.Y[i])], aplicacao=exp.meta.aplicacao[i],
                          proto=int(exp.meta.proto[i]), n_pacotes=k,
                          pacotes=[[int(a), int(b), round(float(t), 6)] for a, b, t in exp.pk[i, :min(k, 32)]],
                          palpites={m: CLASSES[int(pred[m][j])] for m in pred}))
    return saida


def vereditos(t, custo):
    """Regras das hipóteses H1–H4 (Seção 6.1), aplicadas aos testes desta execução."""
    def sig_rel_pos(r):
        return r.p_holm < etapa9.ALFA and r.dif >= etapa9.LIM
    h1 = t['h1']
    c3 = t['testes'][t['testes'].grupo.isin(['C3-A1', 'C3-A2'])]
    h2_ok = [all(sig_rel_pos(r) for _, r in c3[c3.fracao == fr].iterrows()) for fr in (0.1, 1.0)]
    h3 = t['h3'][t['h3'].comp == 'queda P - queda B2']
    b2, p = custo['B2'], custo['P']
    return {
        'H1': dict(sustentada=bool(len(h1) == 3 and all(sig_rel_pos(r) for _, r in h1.iterrows())),
                   regra='P − B2 ≥ 2 pp com p de Holm < 0,05 em 1%, 5% e 10%'),
        'H2': dict(sustentada=bool(all(h2_ok)),
                   regra='P supera B2 e B1 em ≥ 2 pp, com significância, em A1 e A2'),
        'H3': dict(sustentada=bool(all(r.p_holm < etapa9.ALFA and r.dif < 0 for _, r in h3.iterrows())),
                   regra='queda de P menor que a de B2, com significância, nas 4 combinações'),
        'H4': dict(sustentada=bool(b2['n_parametros'] == p['n_parametros']
                                   and abs(p['inferencia_ms'] - b2['inferencia_ms']) <= 0.1 * b2['inferencia_ms']),
                   regra='mesmo número de parâmetros e inferência de P até 10% da de B2 (descritiva)'),
    }


def registros(tabela):
    return json.loads(tabela.replace({np.nan: None}).to_json(orient='records', force_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pcaps', type=Path, required=True)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--resumo', type=Path, default=RAIZ / 'web' / 'data' / 'experimento.json')
    parser.add_argument('--artefatos', type=Path, default=RAIZ / 'artefatos')
    args = parser.parse_args()
    args.base.mkdir(parents=True, exist_ok=True)
    arquivo_log = args.base / 'execucao.log'

    def registrar(msg):
        log(msg, arquivo_log)

    from experimento.metodos import DEV, Experimento, hardware
    registrar(f'Início. Hardware: {hardware()} | treino em {DEV}')
    info5 = preparar_dados(args.pcaps, args.base, registrar)
    exp = Experimento(args.base)
    passos, curva = escolher_passos(exp, registrar)
    df, consistencia = rodar_cenarios(exp, passos, registrar)

    arq_ocl = args.base / 'resultados' / 'oclusao.json'
    if not arq_ocl.exists():
        arq_ocl.write_text(json.dumps(exp.analise_oclusao(passos)), encoding='utf-8')
        registrar('Oclusão concluída')
    arq_exp = args.base / 'resultados' / 'exposicao_informacao.csv'
    if not arq_exp.exists():
        pd.DataFrame([exp.exposicao(s) for s in range(5)]).to_csv(arq_exp, index=False)
        registrar('Exposição de informação concluída')

    t = etapa9.analisar(df)
    pasta_res = args.base / 'resultados'
    t['testes'].to_csv(pasta_res / 'etapa9_testes_pareados.csv', index=False)
    t['h3'].to_csv(pasta_res / 'etapa9_h3_quedas.csv', index=False)
    t['medias'].to_csv(pasta_res / 'etapa9_medias_ic95.csv', index=False)
    f1, confusao = etapa9.f1_e_confusao(t['df'], args.base)
    sk = etapa9.skype(t['df'], exp)
    c1 = df[df.cenario == 'C1']
    custo = {m: dict(inferencia_ms=float(g.tempo_inferencia_ms.mean()), inferencia_dp=float(g.tempo_inferencia_ms.std()),
                     treino_s=float(g.tempo_treino_s.mean()),
                     pretreino_s=float(pd.to_numeric(g.tempo_pretreino_s, errors='coerce').mean()) if m == 'P' else None,
                     n_parametros=None if m == 'B1' else int(g.n_parametros.iloc[0]))
             for m, g in c1.groupby('metodo')}
    custo = json.loads(json.dumps(custo).replace('NaN', 'null'))

    exportar_app(exp, args.artefatos, registrar)
    from treino.preparar_exemplos import preparar as preparar_exemplos
    (RAIZ / 'exemplos' / 'biblioteca.json').write_text(
        json.dumps(preparar_exemplos(args.base), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    meta = exp.meta
    extr = pd.read_csv(args.base / 'logs_extracao.csv') if (args.base / 'logs_extracao.csv').exists() else None
    mapa = pd.read_csv(args.base / 'mapeamento.csv')
    capturas = []
    for _, r in mapa[mapa.incluido == 'sim'].iterrows():
        e = extr[extr.arquivo == r.arquivo].iloc[0] if extr is not None and (extr.arquivo == r.arquivo).any() else None
        capturas.append(dict(arquivo=r.arquivo, categoria=r.categoria, aplicacao=r.aplicacao, tamanho_mb=r.tamanho_MB,
                             fluxos=int((meta.arquivo == r.arquivo).sum()),
                             pacotes_lidos=None if e is None else int(e.pacotes_lidos),
                             motivo=None if e is None else e.motivo))
    ocl = json.loads(arq_ocl.read_text(encoding='utf-8'))
    part0 = exp.sp['N_s0_part']
    particoes = {nome: {c: int(((part0 == k) & exp.princ & (exp.Y == i)).sum()) for i, c in enumerate(CLASSES)}
                 for k, nome in ((0, 'treino'), (1, 'validacao'), (2, 'teste'))}
    pre0 = exp.garantir_pretreino('N', 0)
    resumo = dict(
        particoes_N_s0=dict(particoes, sessoes=int(meta.sessao.nunique())),
        pretreino_N_s0=dict(n_pre=int(pre0['n_pre']), tempo_s=float(pre0['tempo_s']),
                            hist=[[int(e), float(tr), float(va)] for e, tr, va in pre0['hist']]),
        gerado_em=datetime.datetime.now().isoformat(timespec='minutes'), hardware=hardware(),
        dados=dict(info5, por_categoria=meta.groupby('categoria').agg(
            fluxos=('ordem', 'size'), mediana_pacotes=('n_pacotes', 'median')).reset_index().to_dict('records'),
            por_aplicacao=meta.groupby(['categoria', 'aplicacao']).agg(
                arquivos=('arquivo', 'nunique'), sessoes=('sessao', 'nunique'), fluxos=('ordem', 'size')
            ).reset_index().to_dict('records'),
            completos_32=round(float((meta.n_pacotes >= 32).mean()), 4), capturas=capturas),
        passos=dict(escolhidos=passos, curva=curva), consistencia_c4=consistencia,
        execucoes=registros(df.drop(columns=['caminho_previsoes', 'hardware', 'data'])),
        medias=registros(t['medias']), testes=registros(t['testes']), h1=registros(t['h1']),
        h3=registros(t['h3']), queda_NA=registros(t['queda_NA']), custo=custo,
        f1_por_classe=registros(f1), confusao=confusao, skype=sk, oclusao=ocl,
        exposicao=registros(pd.read_csv(arq_exp)), vereditos=vereditos(t, custo),
        amostra=amostra_fluxos(exp))
    args.resumo.parent.mkdir(parents=True, exist_ok=True)
    args.resumo.write_text(json.dumps(resumo, ensure_ascii=False, default=float), encoding='utf-8')
    registrar(f'Resumo para o site: {args.resumo}')


if __name__ == '__main__':
    main()
