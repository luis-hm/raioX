"""Port da extração da Etapa 5 (`rede`, célula de `extrair_fluxos`).

Endereços e portas existem somente nas chaves dos fluxos abertos, em memória.
O resultado contém apenas tamanho, direção, tempo e metadados anônimos.
"""

import numpy as np
from time import monotonic

MAXP = 100
MINP = 3
TETO = 2000
TETO_PRINCIPAL = 500
TIMEOUT = 60.0
LIMITE_PACOTES = 3_000_000
PORTAS_AUX = {53, 5353, 5355, 137, 138, 139, 1900, 67, 68}


def abrir_leitor(f):
    import dpkt

    try:
        return dpkt.pcap.Reader(f)
    except ValueError:
        f.seek(0)
        return dpkt.pcapng.Reader(f)


def camada_ip(buf, dlt):
    import dpkt

    if dlt == 1:
        d = dpkt.ethernet.Ethernet(buf).data
    elif dlt == 113:
        d = dpkt.sll.SLL(buf).data
    elif dlt in (12, 101):
        d = dpkt.ip.IP(buf) if (buf[0] >> 4) == 4 else dpkt.ip6.IP6(buf)
    else:
        return None
    return d if isinstance(d, (dpkt.ip.IP, dpkt.ip6.IP6)) else None


def info_pacote(ip):
    import dpkt

    l4 = ip.data
    if isinstance(l4, dpkt.tcp.TCP):
        if isinstance(ip, dpkt.ip.IP):
            tam = (ip.len - ip.hl * 4 - l4.off * 4) if ip.len else len(l4.data)
        else:
            tam = ip.plen - l4.off * 4
        return 6, l4.sport, l4.dport, l4.flags, tam
    if isinstance(l4, dpkt.udp.UDP):
        return 17, l4.sport, l4.dport, 0, l4.ulen - 8
    return None


def extrair_fluxos(caminho, *, progresso=None, prazo=None):
    """Extrai até 2.000 fluxos válidos; ordem é a validação no terceiro pacote.

    A matriz 32×4 é produzida depois, por `core.matriz.montar_matriz`.
    """
    abertos, prontos = {}, []
    validos = lidos = 0
    t_cap = None
    ultimo_ts = None
    motivo = "fim_do_arquivo"

    def fechar(ch):
        fl = abertos.pop(ch)
        if fl["valido"]:
            prontos.append(fl)

    with open(caminho, "rb") as f:
        leitor = abrir_leitor(f)
        dlt = leitor.datalink()
        for ts, buf in leitor:
            if prazo is not None and monotonic() >= prazo:
                raise TimeoutError("tempo de processamento excedido")
            if lidos >= LIMITE_PACOTES:
                motivo = "limite_de_pacotes"
                break
            lidos += 1
            if t_cap is None:
                t_cap = ts
            ultimo_ts = ts
            if progresso is not None and lidos % 5000 == 0:
                progresso(lidos, validos)
            if (lidos % 5000 == 0 and validos >= TETO
                    and all(len(x["pk"]) >= MAXP for x in abertos.values())):
                motivo = "teto_de_fluxos"
                break
            try:
                ip = camada_ip(buf, dlt)
                if ip is None:
                    continue
                inf = info_pacote(ip)
            except Exception:
                continue
            if inf is None:
                continue
            proto, sp, dp, flags, tam = inf
            if sp in PORTAS_AUX or dp in PORTAS_AUX:
                continue

            fim = proto == 6 and (flags & 0x05) != 0
            a = (bytes(ip.src), sp)
            b = (bytes(ip.dst), dp)
            ch = (proto,) + tuple(sorted((a, b)))

            fl = abertos.get(ch)
            if fl is not None and ts - fl["last"] > TIMEOUT:
                fechar(ch)
                fl = None
            if tam <= 0:
                if fl is not None and fim:
                    fechar(ch)
                continue
            if fl is None:
                if validos >= TETO:
                    continue
                fl = {"cli": a, "proto": proto, "t0": ts, "ini": ts - t_cap,
                      "pk": [], "last": ts, "valido": False, "ordem": -1,
                      "serie": {}}
                abertos[ch] = fl
            fl["last"] = ts
            segundo = max(0, int(ts - t_cap))
            fl["serie"][segundo] = fl["serie"].get(segundo, 0) + int(tam)
            if len(fl["pk"]) < MAXP:
                fl["pk"].append((tam, 1 if a == fl["cli"] else -1, ts - fl["t0"]))
                if not fl["valido"] and len(fl["pk"]) >= MINP and validos < TETO:
                    fl["valido"] = True
                    fl["ordem"] = validos
                    validos += 1
                    if validos >= TETO:
                        for k in [k for k, v in abertos.items() if not v["valido"]]:
                            del abertos[k]
            if fim:
                fechar(ch)
    for ch in list(abertos):
        fechar(ch)
    if progresso is not None:
        progresso(lidos, validos)

    prontos.sort(key=lambda x: x["ordem"])
    pk = np.zeros((len(prontos), MAXP, 3), dtype=np.float32)
    n = np.zeros(len(prontos), dtype=np.int16)
    for i, fl in enumerate(prontos):
        arr = np.array(fl["pk"], dtype=np.float32)
        pk[i, :len(arr)] = arr
        n[i] = len(arr)
    dados = dict(pk=pk, n=n,
                 ordem=np.array([x["ordem"] for x in prontos], dtype=np.int32),
                 ini=np.array([x["ini"] for x in prontos], dtype=np.float32),
                 duracao=np.array([max(0.0, x["last"] - x["t0"]) for x in prontos], dtype=np.float64),
                 proto=np.array([x["proto"] for x in prontos], dtype=np.int8),
                 serie=[x["serie"] for x in prontos])
    return dados, dict(pacotes_lidos=lidos, motivo=motivo,
                       duracao_observada_s=max(0.0, ultimo_ts - t_cap) if t_cap is not None else 0.0)
