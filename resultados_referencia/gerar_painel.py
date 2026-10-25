"""Gera os dados da página /resultados a partir da simulação final do trabalho."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from statistics import mean, stdev

import numpy as np


BASE = Path(__file__).resolve().parent
SAIDA = BASE.parent / "web" / "data" / "resultados_estudo.json"
SAIDA_METODO = BASE.parent / "web" / "data" / "metodologia_estudo.json"
CLASSES = ("chat", "email", "transferencia", "streaming", "voip")
METODOS = ("B1", "B2", "P")


def linhas(nome: str) -> list[dict]:
    with (BASE / nome).open(newline="", encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo))


def numero(valor: str) -> float | None:
    return float(valor) if valor else None


def converter(registros: list[dict], campos: tuple[str, ...]) -> list[dict]:
    return [{chave: numero(valor) if chave in campos else valor for chave, valor in r.items()}
            for r in registros]


def holm(valores: list[float]) -> list[float]:
    ajustados = [0.0] * len(valores)
    maior = 0.0
    for posicao, indice in enumerate(sorted(range(len(valores)), key=valores.__getitem__)):
        maior = max(maior, (len(valores) - posicao) * valores[indice])
        ajustados[indice] = min(1.0, maior)
    return ajustados


def gerar_metodologia(execucoes: list[dict]) -> None:
    aplicacoes = converter(linhas("auxiliares/contagem_por_aplicacao.csv"),
        ("arquivos", "sessoes", "fluxos_total", "fluxos_principais", "completos_32"))
    particoes = converter(linhas("auxiliares/contagem_particoes.csv"), ("semente", "fluxos"))
    fracoes = converter(linhas("auxiliares/contagem_fracoes.csv"),
        ("total", "chat", "email", "transferencia", "streaming", "voip"))
    escolha = converter(linhas("auxiliares/escolha_passos_c1.csv"),
        ("semente", "passos", "macro_f1_val"))
    assert len(aplicacoes) == 17 and len(fracoes) == 12 and len(escolha) == 18

    por_aplicacao = [{"categoria": r["categoria"], "aplicacao": r["aplicacao"],
                     "arquivos": r["arquivos"], "sessoes": r["sessoes"], "fluxos": r["fluxos_total"]}
                    for r in aplicacoes]
    fluxos = sum(r["fluxos_total"] for r in aplicacoes)
    principais = sum(r["fluxos_principais"] for r in aplicacoes)
    capturas = sum(r["arquivos"] for r in aplicacoes)
    completos = sum(r["completos_32"] for r in aplicacoes)
    assert (capturas, fluxos, principais, completos) == (98, 5653, 5457, 883)

    c1_cnn = [r for r in execucoes if r["cenario"] == "C1" and r["metodo"] in ("B2", "P")]
    passos = {json.loads(r["hiperparametros"])["passos"] for r in c1_cnn}
    assert passos == {4000}
    curva = []
    for valor in sorted({r["passos"] for r in escolha}):
        notas = [r["macro_f1_val"] for r in escolha if r["passos"] == valor]
        assert len(notas) == 3
        curva.append({"passos": valor, "media": mean(notas)})

    particoes_s0 = []
    for cenario in ("N", "A1", "A2"):
        total = {particao: sum(r["fluxos"] for r in particoes
                                if r["cenario"] == cenario and r["semente"] == 0
                                and r["particao"] == particao)
                 for particao in ("treino", "validacao", "teste")}
        assert all(total.values())
        particoes_s0.append({"cenario": cenario, **total})

    metodologia = {
        "fonte": "Simulação final do trabalho de redes",
        "n_execucoes": len(execucoes),
        "periodo": [min(r["data"][:10] for r in execucoes), max(r["data"][:10] for r in execucoes)],
        "hardware": execucoes[0]["hardware"],
        "execucoes": {c: sum(r["cenario"] == c for r in execucoes)
                      for c in ("C1", "C2", "C3", "C4", "X1")},
        "dados": {
            "capturas_total": 109, "tamanho_gb": 25.13, "capturas_incluidas": capturas,
            "videochamadas_excluidas": 11, "fluxos": fluxos, "principais": principais,
            "extras": fluxos - principais, "completos_32": completos / fluxos,
            "por_aplicacao": por_aplicacao,
            "acima_1500": {"acima_1500": 4082, "pacotes_32": 70847},
            "blocos_temporais": ["chat/Skype", "email/Thunderbird", "transferencia/FTPS"],
            "teste5": {"N": {"duplicados": 0, "teste": 1050},
                       "A1": {"duplicados": 0, "teste": 2076},
                       "A2": {"duplicados": 0, "teste": 1415}},
        },
        "passos": {"escolhidos": passos.pop(), "curva": curva},
        "fracoes": fracoes,
        "particoes_s0": particoes_s0,
    }
    SAIDA_METODO.write_text(json.dumps(metodologia, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main() -> None:
    execucoes = converter(linhas("resultados.csv"),
        ("fracao_rotulos", "taxa_perda", "macro_f1", "tempo_inferencia_ms",
         "tempo_treino_s", "tempo_pretreino_s", "n_parametros"))
    assert len(execucoes) == 250
    medias = converter(linhas("etapa9_medias_ic95.csv"),
        ("fracao_rotulos", "taxa_perda", "media", "dp", "ic_inf", "ic_sup", "n"))
    testes = converter(linhas("etapa9_testes_pareados.csv"),
        ("fracao", "perda", "n", "dif", "dp", "ic_inf", "ic_sup", "t", "p", "p_holm"))
    h3 = converter(linhas("etapa9_h3_quedas.csv"),
        ("fracao", "perda", "queda_a", "queda_b", "n", "dif", "dp", "ic_inf", "ic_sup", "t", "p", "p_holm"))
    assert len(medias) == 50 and len(testes) == 28 and len(h3) == 8

    h1 = [dict(r) for r in testes if r["grupo"] == "N" and r["comp"] == "P - B2" and r["fracao"] <= 0.1]
    assert len(h1) == 3
    for r, p_ajustado in zip(h1, holm([r["p"] if r["p"] is not None else 1.0 for r in h1])):
        r["p_holm"] = p_ajustado

    custo = {}
    c1 = [r for r in execucoes if r["cenario"] == "C1" and r["fracao_rotulos"] == 1.0]
    for metodo in METODOS:
        grupo = [r for r in c1 if r["metodo"] == metodo]
        assert len(grupo) == 5
        tempos = [r["tempo_inferencia_ms"] for r in grupo]
        custo[metodo] = {
            "inferencia_ms": mean(tempos), "inferencia_dp": stdev(tempos),
            "treino_s": mean(r["tempo_treino_s"] for r in grupo),
            "pretreino_s": mean(r["tempo_pretreino_s"] for r in grupo) if metodo == "P" else None,
            "n_parametros": int(grupo[0]["n_parametros"]) if metodo != "B1" else None,
        }

    f1_por_classe = []
    for cenario, dobra, grupo in (("C1", "N", "N"), ("C3", "A1", "C3-A1"), ("C3", "A2", "C3-A2")):
        for metodo in METODOS:
            grupo_linhas = [r for r in execucoes if r["cenario"] == cenario and r["dobra"] == dobra
                            and r["metodo"] == metodo and r["fracao_rotulos"] == 1.0]
            assert len(grupo_linhas) == 5
            f1_por_classe.append({"grupo": grupo, "metodo": metodo, **{
                classe: mean(json.loads(r["f1_por_classe"])[classe] for r in grupo_linhas)
                for classe in CLASSES}})

    confusao = {}
    for metodo in METODOS:
        matriz = np.zeros((5, 5), dtype=int)
        for semente in range(5):
            with np.load(BASE / "previsoes" / f"C1_N_{metodo}_frac100_seed{semente}.npz") as arquivo:
                verdade, previsto = arquivo["y"], arquivo["pred"]
                assert len(verdade) == len(previsto)
                np.add.at(matriz, (verdade, previsto), 1)
                f1 = []
                for classe in range(5):
                    tp = int(((verdade == classe) & (previsto == classe)).sum())
                    fp = int(((verdade != classe) & (previsto == classe)).sum())
                    fn = int(((verdade == classe) & (previsto != classe)).sum())
                    f1.append(2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0)
                linha = next(r for r in c1 if r["metodo"] == metodo and int(r["semente"]) == semente)
                assert abs(mean(f1) - linha["macro_f1"]) < 1e-12, "previsão não confere com resultados.csv"
        confusao[f"N|{metodo}"] = matriz.tolist()

    exposicao = converter(linhas("auxiliares/exposicao_informacao.csv"),
        ("semente", "n_apps_teste", "f1_aplicacao", "acc_aplicacao",
         "f1_categoria_direto", "f1_categoria_via_app"))
    assert len(exposicao) == 5
    skype = converter(linhas("etapa9_skype_N.csv"),
        ("n", "acerto_%", "→Chat_%", "→E-mail_%", "→Transferência_%", "→Streaming_%", "→VoIP_%"))

    relevante = lambda r: r["p_holm"] < 0.05 and r["dif"] >= 0.02
    c3 = [r for r in testes if r["grupo"] in ("C3-A1", "C3-A2")]
    h3_p_b2 = [r for r in h3 if r["comp"] == "queda P - queda B2"]
    vereditos = {
        "H1": {"sustentada": all(map(relevante, h1)),
               "regra": "P − B2 ≥ 2 pp com p de Holm < 0,05 em 1%, 5% e 10%"},
        "H2": {"sustentada": len(c3) == 8 and all(map(relevante, c3)),
               "regra": "P supera B2 e B1 em ≥ 2 pp, com significância, em A1 e A2"},
        "H3": {"sustentada": len(h3_p_b2) == 4 and all(r["p_holm"] < 0.05 and r["dif"] < 0 for r in h3_p_b2),
               "regra": "queda de P menor que a de B2, com significância, nas 4 combinações"},
        "H4": {"sustentada": custo["B2"]["n_parametros"] == custo["P"]["n_parametros"]
               and abs(custo["P"]["inferencia_ms"] - custo["B2"]["inferencia_ms"]) <= 0.1 * custo["B2"]["inferencia_ms"],
               "regra": "mesmo número de parâmetros e inferência de P até 10% da de B2 (descritiva)"},
    }

    painel = {"n_execucoes": len(execucoes), "hardware": c1[0]["hardware"], "medias": medias,
              "testes": testes, "h1": h1, "h3": h3, "custo": custo,
              "f1_por_classe": f1_por_classe, "confusao": confusao, "exposicao": exposicao,
              "skype": skype, "vereditos": vereditos}
    SAIDA.write_text(json.dumps(painel, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    gerar_metodologia(execucoes)


if __name__ == "__main__":
    main()
