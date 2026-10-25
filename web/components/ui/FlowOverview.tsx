"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CLASSES, MODELOS, NOMES, consultarFluxo, type Classe, type FluxoTabela, type Modelo } from "@/lib/api";
import { loadFlows, MAP_FLOW_LIMIT } from "@/lib/flow-map";

type Props = { id: string; seed: number; model: Modelo; category: Classe | "all"; disagreementsOnly: boolean };

export const COR: Record<Classe, string> = { chat: "var(--cat-chat)", email: "var(--cat-email)", transferencia: "var(--cat-transf)", streaming: "var(--cat-stream)", voip: "var(--cat-voip)" };
export const MODELO_NOME: Record<Modelo, string> = { B1: "Random Forest", B2: "CNN", P: "CNN + pré-treino" };
const classe = (flow: FluxoTabela, m: Modelo) => flow.previsoes[m]?.classe_prevista as Classe | undefined;
const cor = (c?: Classe) => (c && COR[c]) || "var(--line-strong)";
const pct = (v?: number) => v == null ? "—" : `${(100 * v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/** Todos os fluxos do recorte numa grade, como na etapa de teste da análise do ISCX. */
export function FlowOverview(props: Props) {
  return <OverviewContent key={`${props.id}:${props.seed}:${props.model}:${props.category}:${props.disagreementsOnly}`} {...props} />;
}

function OverviewContent({ id, seed, model, category, disagreementsOnly }: Props) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadFlows>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<FluxoTabela | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const select = (flow: FluxoTabela) => {
    setSelected(flow);
    // Em telas estreitas o detalhe fica abaixo de uma grade longa.
    requestAnimationFrame(() => summary.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setResult(null);
    void loadFlows(id, { semente: seed, modelo: model, classe: category === "all" ? undefined : category, discordam: disagreementsOnly }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setResult(data); setSelected(data.flows[0] ?? null); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível carregar os fluxos."); });
    return () => controller.abort();
  }, [id, seed, model, category, disagreementsOnly, attempt]);
  if (error) return <div role="alert"><p>{error}</p><button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>;
  if (!result) return <p role="status">Carregando até {MAP_FLOW_LIMIT} fluxos…</p>;
  if (!result.flows.length) return <p role="status">Nenhum fluxo neste filtro. Use ‘Ver todos’ para explorar a captura.</p>;

  return <div className="space-y-5">
    <p className="text-sm text-text-muted">Cada quadrado é um fluxo, na coluna do palpite de <strong className="text-text">{model}</strong>. As três faixas do quadrado são, da esquerda para a direita, os palpites de B1, B2 e P: um quadrado de cor única quer dizer que os três concordam. Clique em um quadrado para ver o detalhe dele aqui embaixo.
      {result.notLoaded > 0 && ` Mostrando os ${result.flows.length} primeiros por início; ${result.notLoaded} ficaram de fora.`}</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{CLASSES.map(c => {
      const flows = result.flows.filter(f => classe(f, model) === c);
      return <div key={c} className="grid content-start gap-2 border-t border-line pt-3">
        <span className="flex items-center gap-2 text-xs font-semibold"><i className="h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ background: COR[c] }} />{NOMES[c]}<span className="font-mono font-normal text-text-muted">{flows.length}</span></span>
        <div className="flex flex-wrap gap-1">{flows.map(f => <button key={f.n} type="button" aria-pressed={selected?.n === f.n} onClick={() => select(f)}
          title={`#${f.n} · ${MODELOS.map(m => `${m}: ${NOMES[classe(f, m)!] ?? "—"}`).join(" · ")}`}
          aria-label={`Fluxo ${f.n}: ${MODELOS.map(m => `${m} ${NOMES[classe(f, m)!] ?? "sem palpite"}`).join(", ")}`}
          className="h-[18px] w-[18px] rounded-[3px] outline-offset-2 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-ink"
          style={{ background: `linear-gradient(90deg, ${cor(classe(f, "B1"))} 0 33.3%, ${cor(classe(f, "B2"))} 33.3% 66.6%, ${cor(classe(f, "P"))} 66.6%)` }} />)}</div>
      </div>;
    })}</div>
    <div ref={summary}>{selected && <FlowSummary key={selected.n} id={id} seed={seed} flow={selected} />}</div>
  </div>;
}

function FlowSummary({ id, seed, flow }: { id: string; seed: number; flow: FluxoTabela }) {
  const [pacotes, setPacotes] = useState<[number, number, number][] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void consultarFluxo(id, flow.n, seed, controller.signal).then(d => setPacotes(d.pacotes)).catch(() => { /* a faixa de pacotes é opcional */ });
    return () => controller.abort();
  }, [id, flow.n, seed]);
  const unanime = new Set(MODELOS.map(m => classe(flow, m))).size === 1;
  return <article className="grid gap-4 rounded-card border border-border-strong p-4" aria-live="polite">
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="m-0 text-base font-semibold">Fluxo <span className="font-mono">#{flow.n}</span> <span className={`ui-chip ${unanime ? "ui-chip--ok" : "ui-chip--warn"}`}>{unanime ? "os três concordam" : "modelos discordam"}</span></h3>
      <span className="font-mono text-xs text-text-muted">{flow.proto === 6 ? "TCP" : "UDP"} · {flow.n_pacotes_guardados} pacotes · {flow.duracao_s == null ? "duração indisponível" : `${flow.duracao_s.toLocaleString("pt-BR")} s`} · {(flow.bytes_amostra_cliente + flow.bytes_amostra_servidor).toLocaleString("pt-BR")} bytes na amostra</span>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">{MODELOS.map(m => {
      const p = flow.previsoes[m]; const c = classe(flow, m);
      return <div key={m} className="grid gap-1">
        <span className="flex items-center gap-2 text-xs text-text-muted"><span className={`ui-chip ui-chip--${m.toLowerCase()}`}>{m}</span>{MODELO_NOME[m]}</span>
        <strong className="text-sm" style={{ color: cor(c) }}>{c ? NOMES[c] : "—"} <span className="font-mono font-normal text-text">{pct(c && p?.probabilidades[c])}</span></strong>
        <div className="flex h-2 overflow-hidden rounded-[2px] bg-surface-2" aria-hidden="true">{CLASSES.map(k =>
          <i key={k} style={{ width: `${100 * (p?.probabilidades[k] ?? 0)}%`, background: COR[k] }} />)}</div>
        <span className="text-xs text-text-muted">{typeof flow.estabilidade[m] === "number" ? `mesmo palpite em ${flow.estabilidade[m]} de 5 sementes` : "estabilidade indisponível"}</span>
      </div>;
    })}</div>
    {pacotes && pacotes.length > 0 && <figure className="m-0 grid gap-1">
      <svg viewBox={`0 0 ${Math.max(100, pacotes.length) * 4} 40`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label={`${pacotes.length} pacotes: barras para cima são saída, para baixo, retorno; a altura é o tamanho`}>
        {pacotes.map(([bytes, dir], i) => { const h = 2 + 18 * Math.min(1, Math.log1p(bytes) / Math.log1p(1500));
          return <rect key={i} x={i * 4} width={3} y={dir > 0 ? 20 - h : 20} height={h} fill={dir > 0 ? "var(--up)" : "var(--down)"} />; })}
      </svg>
      <figcaption className="text-xs text-text-muted">Pacotes guardados em ordem: <span style={{ color: "var(--up)" }}>▲ saída</span>, <span style={{ color: "var(--down)" }}>▼ retorno</span>; a altura indica o tamanho.</figcaption>
    </figure>}
    <Link className="ui-table__action text-sm" href={`/a/${encodeURIComponent(id)}/fluxo/${flow.n}`}>Abrir Raio-X completo →</Link>
  </article>;
}
