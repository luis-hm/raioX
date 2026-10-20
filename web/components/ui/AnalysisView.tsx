"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, type StatusAnalise } from "@/lib/api";
import { watchAnalysis } from "@/lib/analysis-poll";
import { Card } from "./Card";
import { ErrorState } from "./ErrorState";
import { LivePanel } from "./LivePanel";
import { ExamplePanel } from "./ExampleExperience";

const DESCRICAO: Record<StatusAnalise["estado"], string> = {
  recebida: "Captura recebida. A análise aguarda a leitura dos pacotes.",
  extraindo: "Os metadados de tamanho, direção e tempo estão sendo agrupados em fluxos.",
  classificando: "Os modelos B1, B2 e P estão produzindo palpites para os fluxos principais.",
  pronta: "A leitura terminou. Os palpites e resumos disponíveis estão no painel.",
  erro: "A análise não terminou. Confira a captura e tente novamente.",
};

export function AnalysisView({ id, tab }: { id: string; tab: "geral" | "fluxos" | "mapa" }) {
  const [analysis, setAnalysis] = useState<StatusAnalise | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setError(null); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    return watchAnalysis(id, result => { setAnalysis(result); setError(null); }, setError);
  }, [id, attempt]);

  if (error?.status === 404) return <ErrorState title="Análise não encontrada" description="O link pode estar incorreto ou a análise pode ter expirado após 7 dias." action={{ label: "Iniciar outra análise", href: "/" }} />;
  if (error) return <section className="ui-card space-y-4" role="alert"><h1 className="m-0 text-xl">Não foi possível carregar a análise</h1><p>{error.message}</p>
    <button className="ui-button ui-button--primary" type="button" onClick={retry}>Tentar novamente</button></section>;
  if (!analysis) return <Card title="Carregando análise"><p role="status" aria-live="polite">Consultando o estado da análise…</p></Card>;
  if (analysis.estado === "pronta") return analysis.origem === "exemplo"
    ? <ExamplePanel analysis={analysis} /> : <LivePanel analysis={analysis} tab={tab} />;
  if (analysis.estado === "erro") return <ErrorState title="A análise parou com erro" description={analysis.erro || DESCRICAO.erro} action={{ label: "Escolher outra captura", href: "/" }} />;

  const stages: StatusAnalise["estado"][] = ["recebida", "extraindo", "classificando", "pronta"];
  return <div className="mx-auto max-w-3xl space-y-5" aria-busy="true">
    <header className="ui-card"><p className="label-small text-accent">Processando captura</p><h1 className="text-2xl">{analysis.nome_exibicao || "Análise em andamento"}</h1>
      <p role="status" aria-live="polite">{DESCRICAO[analysis.estado]}</p></header>
    <Card title="Do arquivo ao painel">
      <ol className="grid gap-3" aria-label="Etapas de processamento">{stages.map((stage, index) => <li key={stage} className="flex gap-3" aria-current={analysis.estado === stage ? "step" : undefined}>
        <span className="font-mono text-accent">{String(index + 1).padStart(2, "0")}</span><span>{stage === "recebida" ? "Recebida" : stage === "extraindo" ? "Extraindo fluxos" : stage === "classificando" ? "Classificando" : "Pronta"}{analysis.estado === stage ? " · etapa atual" : ""}</span></li>)}</ol>
      <p className="mt-5 text-sm text-text-muted">A API não informa porcentagem nem total de pacotes esperado. A etapa e os pacotes lidos são as medidas disponíveis.</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>Pacotes lidos</dt><dd className="font-mono">{analysis.n_pacotes_lidos.toLocaleString("pt-BR")}</dd></div>
        <div><dt>Fluxos principais encontrados</dt><dd className="font-mono">{analysis.n_fluxos_principais.toLocaleString("pt-BR")}</dd></div></dl>
      <p className="text-sm text-text-muted">A página consulta o estado a cada 2 segundos. Os contadores vêm do serviço.</p>
    </Card>
    <Link href="/" className="ui-button ui-button--secondary">Iniciar outra análise</Link>
  </div>;
}
