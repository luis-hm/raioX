"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, type StatusAnalise } from "@/lib/api";
import { watchAnalysis } from "@/lib/analysis-poll";
import { XRayScanner, type FluxoScanner } from "@/components/raiox/XRayScanner";
import { ErrorState } from "./ErrorState";
import { LivePanel } from "./LivePanel";
import { ExamplePanel } from "./ExampleExperience";
import s from "@/components/raiox/aovivo.module.css";

const DESCRICAO: Record<StatusAnalise["estado"], string> = {
  recebida: "Arquivo recebido e validado. A leitura dos pacotes vai começar.",
  extraindo: "Agrupando os pacotes em fluxos e guardando só tamanho, direção e tempo.",
  classificando: "B1, B2 e P estão dando seus palpites para os fluxos principais, nas cinco sementes.",
  pronta: "A leitura terminou. Os palpites e resumos estão no painel.",
  erro: "A análise não terminou. Confira a captura e tente novamente.",
};
const ETAPAS: { id: StatusAnalise["estado"]; titulo: string }[] = [
  { id: "recebida", titulo: "Arquivo recebido" },
  { id: "extraindo", titulo: "Separando fluxos" },
  { id: "classificando", titulo: "Classificando" },
  { id: "pronta", titulo: "Pronta" },
];

export function AnalysisView({ id, tab, vitrine = [] }: { id: string; tab: "geral" | "fluxos" | "mapa"; vitrine?: FluxoScanner[] }) {
  const [analysis, setAnalysis] = useState<StatusAnalise | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setError(null); setAttempt(value => value + 1); }, []);

  useEffect(() => {
    return watchAnalysis(id, result => { setAnalysis(result); setError(null); }, setError);
  }, [id, attempt]);

  if (error?.status === 404) return <ErrorState title="Análise não encontrada" description="O link pode estar incorreto ou a análise pode ter expirado após 7 dias." action={{ label: "Iniciar outra análise", href: "/enviar" }} />;
  if (error) return <section className="ui-card space-y-4" role="alert"><h1 className="m-0 text-xl">Não foi possível carregar a análise</h1><p>{error.message}</p>
    <button className="ui-button ui-button--primary" type="button" onClick={retry}>Tentar novamente</button></section>;
  if (!analysis) return <div className="ui-state" role="status" aria-live="polite">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="marca-carregando" src="/brand/raio-x-symbol-light.svg" alt="" width={40} height={40} />
    <p className="ui-state__title">Carregando análise</p><p className="ui-state__description">Consultando o estado da análise…</p></div>;
  if (analysis.estado === "pronta") return analysis.origem === "exemplo"
    ? <ExamplePanel analysis={analysis} /> : <LivePanel analysis={analysis} tab={tab} />;
  if (analysis.estado === "erro") return <ErrorState title="A análise parou com erro" description={analysis.erro || DESCRICAO.erro} action={{ label: "Escolher outro arquivo", href: "/enviar" }} />;

  const atual = ETAPAS.findIndex(e => e.id === analysis.estado);
  return <div aria-busy="true">
    <header className={s.head}>
      <div>
        <p className="eyebrow">Análise · {analysis.nome_exibicao || "captura enviada"}{analysis.n_arquivos_zip ? ` · ${analysis.n_arquivos_zip} capturas` : ""}</p>
        <h1 className={`display ${s.title}`}>{ETAPAS[atual]?.titulo}…</h1>
      </div>
      <div className={s.status} role="status" aria-live="polite"><span className={s.dotLive} />Etapa {atual + 1} de {ETAPAS.length}</div>
    </header>
    <div className={s.grid}>
      <figure className={`${s.film} registro`} style={{ margin: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="film-mark" src="/brand/raio-x-symbol-dark.svg" alt="" width={18} height={18} />
        <div className={s.stage}>{vitrine.length > 0 && <XRayScanner fluxos={vitrine} velocidade={1.4} />}</div>
      </figure>
      <aside className={s.side}>
        <ol className={s.steps}>{ETAPAS.map((e, i) => <li key={e.id} data-state={i < atual ? "ok" : i === atual ? "on" : "wait"} aria-current={i === atual ? "step" : undefined}>
          <span className="font-mono">{i < atual ? "✓" : String(i + 1).padStart(2, "0")}</span>
          <div><strong>{e.titulo}</strong><p>{DESCRICAO[e.id]}</p></div>
        </li>)}</ol>
        <dl className={s.counters}>
          <div><dt>Pacotes lidos</dt><dd className="font-mono">{analysis.n_pacotes_lidos.toLocaleString("pt-BR")}</dd></div>
          <div><dt>Fluxos principais</dt><dd className="font-mono">{analysis.n_fluxos_principais.toLocaleString("pt-BR")}</dd></div>
        </dl>
        <p className="text-sm text-text-muted">Os contadores vêm do serviço e se atualizam a cada 2 segundos. O visor ilustra a leitura com fluxos do ISCX; os números ao lado são os do seu arquivo.</p>
        <Link href="/enviar" className="ui-button ui-button--secondary">Enviar outro arquivo</Link>
      </aside>
    </div>
  </div>;
}
