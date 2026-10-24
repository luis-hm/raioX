"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, consultarAnalise, consultarFluxo, explicarFluxo,
  type ExplicacaoFluxo, type FluxoDetalhe, type StatusAnalise } from "@/lib/api";
import { toFlowXRay } from "@/lib/flow-adapters";
import { FlowXRay } from "@/components/motion/FlowXRay";
import type { Seed } from "@/components/motion/types";
import { Card } from "./Card";
import { ErrorState } from "./ErrorState";

// Navigation resets both metadata and the per-seed explanation cache.
export function FlowDetails({ id, n }: { id: string; n: number }) {
  return <FlowDetailsContent key={`${id}:${n}`} id={id} n={n} />;
}

function FlowDetailsContent({ id, n }: { id: string; n: number }) {
  const [analysis, setAnalysis] = useState<StatusAnalise | null>(null);
  const [flow, setFlow] = useState<FluxoDetalhe | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setFlow(null);
    void consultarAnalise(id, controller.signal).then(status => {
      if (controller.signal.aborted) return;
      setAnalysis(status);
      if (status.estado !== "pronta") return null;
      return consultarFluxo(id, n, 0, controller.signal);
    }).then(detail => { if (!controller.signal.aborted && detail) setFlow(detail); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof ApiError ? failure : new ApiError(0, "Não foi possível carregar o fluxo.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, n, attempt]);
  const back = analysis?.origem === "exemplo" ? `/a/${encodeURIComponent(id)}` : `/a/${encodeURIComponent(id)}?aba=fluxos`;
  if (loading) return <Card title="Carregando fluxo"><p role="status">Consultando metadados e palpites…</p></Card>;
  if (error?.status === 404) return <ErrorState title="Fluxo não encontrado" description="O número ou a análise não existe, ou a análise expirou." action={{ label: "Voltar à análise", href: back }} />;
  if (error) return <section className="ui-card" role="alert"><h1>Não foi possível carregar o fluxo</h1><p>{error.message}</p>
    <button type="button" className="ui-button ui-button--primary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></section>;
  if (analysis?.estado !== "pronta") return <Card title="Fluxo ainda indisponível"><p>Esta análise está em {analysis?.estado || "consulta"}. O detalhe aparece após a classificação.</p><Link className="ui-button ui-button--secondary" href={`/a/${encodeURIComponent(id)}`}>Acompanhar análise</Link></Card>;
  if (!flow) return <Card title="Nenhum dado do fluxo"><p>O serviço não devolveu metadados para este fluxo.</p><Link href={back}>Voltar à tabela</Link></Card>;
  return <div className="min-w-0 space-y-4">
    <Link href={back} className="text-sm text-accent underline">← {analysis.origem === "exemplo" ? "Voltar ao exemplo" : "Voltar à tabela"}</Link>
    <header className="ui-card"><p className="label-small text-accent">Raio-X do fluxo · análise real</p><h1 className="text-2xl">Fluxo #{flow.n}</h1>
      <p>{flow.proto === 6 ? "TCP" : "UDP"} · {analysis.n_arquivos_zip == null ? "início" : "início relativo ao arquivo de origem"} {flow.ini_s.toLocaleString("pt-BR")} s · duração observada {flow.duracao_s == null ? "indisponível" : `${flow.duracao_s.toLocaleString("pt-BR")} s`}.</p>
      <p className="text-sm text-text-muted">A duração vai do primeiro ao último pacote com carga observado, inclusive além dos 100 pacotes guardados. Os bytes e a tabela de pacotes se limitam à amostra guardada.</p>
    </header>
    {!flow.principal || flow.pacotes.length < 3
      ? <Card title="Fluxo sem explicação"><p>Os modelos explicam fluxos principais com pelo menos três pacotes guardados.</p></Card>
      : <LiveXRay id={id} flow={flow} origin={analysis.origem} resumos={analysis.resumo_por_semente} />}
  </div>;
}

function LiveXRay({ id, flow, origin, resumos }: {
  id: string; flow: FluxoDetalhe; origin: StatusAnalise["origem"]; resumos: StatusAnalise["resumo_por_semente"];
}) {
  const [seed, setSeed] = useState<Seed>(0);
  const [explanation, setExplanation] = useState<ExplicacaoFluxo | null>(null);
  const [error, setError] = useState<{ seed: Seed; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<Seed, ExplicacaoFluxo>());
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    const cached = cache.current.get(seed);
    if (cached) { setExplanation(cached); return () => controller.abort(); }
    setExplanation(null);
    void explicarFluxo(id, flow.n, seed, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      // Validate before caching, so retry can recover from an incomplete response.
      toFlowXRay(flow, result, seed, origin);
      cache.current.set(seed, result);
      setExplanation(result);
    }).catch(failure => {
      if (!controller.signal.aborted) setError({ seed, message: failure instanceof Error ? failure.message : "Não foi possível carregar a explicação." });
    });
    return () => controller.abort();
  }, [id, flow, origin, seed, attempt]);
  const data = useMemo(() => explanation?.semente === seed ? toFlowXRay(flow, explanation, seed, origin) : null,
    [flow, explanation, seed, origin]);
  const currentError = error?.seed === seed ? error.message : null;
  return <>
    {currentError && <p role="alert" className="ui-card">{currentError}</p>}
    {resumos[String(seed)]?.exemplo_no_treino && <p role="note" className="ui-card text-sm">
      Na semente {seed}, este fluxo de exemplo fez parte do treino dos modelos. Os palpites nesta semente não indicam como eles se sairiam num fluxo novo; o estudo só mediu desempenho no conjunto de teste.</p>}
    <FlowXRay data={data} seed={seed} onSeedChange={setSeed}
      status={currentError ? "error" : data ? "ready" : "loading"}
      onRetry={() => { cache.current.delete(seed); setAttempt(value => value + 1); }} />
  </>;
}
