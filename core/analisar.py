"""Analisa um pcap/pcapng local: python -m core.analisar captura.pcap [--json]."""

import argparse
import json
from pathlib import Path

import numpy as np

from core.extracao import TETO_PRINCIPAL, extrair_fluxos
from core.matriz import montar_matriz
from core.modelos import ARTEFATOS, SEMENTES, classificar


AVISO = (
    "Palpites de reconstruções locais B1/B2/P, divergentes das previsões de "
    "referência do estudo. Não são rótulos de referência nem medem acerto "
    "nesta captura; os escores exibidos não são probabilidades calibradas "
    "nem representam certeza."
)


def analisar(caminho, *, semente=0, artefatos=ARTEFATOS):
    """Devolve somente um resumo anônimo; a captura fica no caminho original."""
    if semente not in SEMENTES:
        raise ValueError("semente deve estar entre 0 e 4")
    if Path(caminho).suffix.lower() not in (".pcap", ".pcapng"):
        raise ValueError("formato esperado: .pcap ou .pcapng")

    dados, leitura = extrair_fluxos(caminho)
    total = len(dados["n"])
    principais = min(total, TETO_PRINCIPAL)
    matrizes = montar_matrizes(dados, principais)

    previsoes = classificar_sementes(matrizes, artefatos=artefatos)
    fluxos = []
    for i in range(total):
        n = int(dados["n"][i])
        amostra = dados["pk"][i, :n]
        principal = i < principais
        fluxo = {
            "numero": i + 1,
            "principal": principal,
            "protocolo": "TCP" if int(dados["proto"][i]) == 6 else "UDP",
            "inicio_segundos": float(dados["ini"][i]),
            "duracao_amostra_segundos": float(amostra[-1, 2]) if n else 0.0,
            "pacotes_amostrados": n,
            "bytes_amostrados": int(amostra[:, 0].sum()),
        }
        if principal:
            fluxo["palpites_por_semente"] = {
                str(seed): {
                    metodo: previsoes[seed][i][metodo]["classe_prevista"]
                    for metodo in ("B1", "B2", "P")
                }
                for seed in SEMENTES
            }
            fluxo["detalhe_semente"] = {
                "semente": semente,
                "modelos": previsoes[semente][i],
            }
        fluxos.append(fluxo)

    return {
        "aviso": AVISO,
        "tipo_resultado": "palpite_de_modelos_locais",
        "probabilidades_calibradas": False,
        "cenario": "N",
        "fracao_rotulos_treino": 1.0,
        "semente_detalhada": semente,
        "pacotes_lidos": int(leitura["pacotes_lidos"]),
        "motivo_parada": leitura["motivo"],
        "fluxos_validos": total,
        "fluxos_principais": principais,
        "fluxos_extras": total - principais,
        "fluxos": fluxos,
    }


def montar_matrizes(dados, quantidade):
    """Monta as matrizes dos fluxos principais na ordem de extração."""
    return np.stack([
        montar_matriz(dados["pk"][i, :int(dados["n"][i]), 0],
                       dados["pk"][i, :int(dados["n"][i]), 1],
                       dados["pk"][i, :int(dados["n"][i]), 2])
        for i in range(quantidade)
    ]) if quantidade else np.empty((0, 32, 4), dtype=np.float32)


def classificar_sementes(matrizes, *, artefatos=ARTEFATOS, prazo=None):
    """Devolve os palpites completos dos três métodos nas cinco sementes."""
    from time import monotonic

    previsoes = {}
    for seed in SEMENTES:
        if prazo is not None and monotonic() >= prazo:
            raise TimeoutError("tempo de processamento excedido")
        previsoes[seed] = classificar(matrizes, seed, artefatos=artefatos)
    return previsoes


def formatar_humano(resultado):
    linhas = [resultado["aviso"],
              f"Pacotes lidos: {resultado['pacotes_lidos']} | parada: {resultado['motivo_parada']}",
              f"Fluxos válidos: {resultado['fluxos_validos']} | principais: {resultado['fluxos_principais']} | extras: {resultado['fluxos_extras']}",
              f"Semente detalhada: {resultado['semente_detalhada']}"]
    for fluxo in resultado["fluxos"]:
        linhas.append(
            f"Fluxo {fluxo['numero']} ({'principal' if fluxo['principal'] else 'extra'}): "
            f"{fluxo['protocolo']}, {fluxo['pacotes_amostrados']} pacotes, "
            f"{fluxo['bytes_amostrados']} bytes amostrados, "
            f"início {fluxo['inicio_segundos']:.3f}s, "
            f"duração observada {fluxo['duracao_amostra_segundos']:.3f}s"
        )
        if fluxo["principal"]:
            for seed, palpites in fluxo["palpites_por_semente"].items():
                linhas.append("  s" + seed + ": " + ", ".join(
                    f"{metodo}={palpites[metodo]}" for metodo in ("B1", "B2", "P")
                ))
            for metodo, saida in fluxo["detalhe_semente"]["modelos"].items():
                probs = ", ".join(f"{classe}={p:.3f}" for classe, p in saida["probabilidades"].items())
                linhas.append(f"    {metodo} s{resultado['semente_detalhada']}: {probs}")
    return "\n".join(linhas)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Classifica fluxos de uma captura local por metadados")
    parser.add_argument("captura", type=Path, help="arquivo .pcap ou .pcapng")
    parser.add_argument("--semente", type=int, choices=SEMENTES, default=0)
    parser.add_argument("--json", action="store_true", help="imprime JSON anônimo")
    args = parser.parse_args(argv)
    try:
        resultado = analisar(args.captura, semente=args.semente)
    except Exception as exc:
        # Exceções de bibliotecas podem conter nomes de arquivos ou bytes da captura.
        parser.exit(2, f"Não foi possível analisar a captura ({type(exc).__name__}).\n")
    print(json.dumps(resultado, ensure_ascii=False) if args.json else formatar_humano(resultado))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
