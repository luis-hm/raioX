"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CountUp } from "./CountUp";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import styles from "./processing.module.css";

gsap.registerPlugin(useGSAP);

export type ProcessingStatus = "recebida" | "extraindo" | "classificando" | "pronta" | "erro";
export type ProcessingPipelineProps = {
  id: string;
  status: ProcessingStatus;
  packetsRead?: number;
  flowsFound?: number;
  errorMessage?: string;
  demonstration?: boolean;
};

const steps = [
  { id: "recebida", label: "Captura recebida", detail: "Conferimos o formato e preparamos o arquivo para leitura." },
  { id: "extraindo", label: "Extraindo fluxos", detail: "Agrupamos metadados de tamanho, direção e tempo; a carga útil não é usada." },
  { id: "classificando", label: "Comparando modelos", detail: "B1, B2 e P produzem palpites para os fluxos principais." },
  { id: "pronta", label: "Análise pronta", detail: "O painel reúne previsões, estabilidade entre sementes e limites da leitura." },
] as const;

const progress: Record<ProcessingStatus, number> = { recebida: 0.08, extraindo: 0.36, classificando: 0.68, pronta: 1, erro: 0.42 };

export function ProcessingPipeline({ id, status, packetsRead, flowsFound, errorMessage, demonstration = false }: ProcessingPipelineProps) {
  const scope = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const currentIndex = steps.findIndex(step => step.id === status);
  const explanation = status === "erro" ? "A leitura parou antes da conclusão. Confira o arquivo ou tente outra captura." : steps[Math.max(0, currentIndex)].detail;

  useGSAP(() => {
    if (!fill.current) return;
    const media = gsap.matchMedia();
    media.add({ reduce: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" }, context => {
      const target = progress[status];
      if (context.conditions?.reduce) gsap.set(fill.current, { scaleX: target });
      else gsap.fromTo(fill.current, { scaleX: 0 }, { scaleX: target, duration: 0.7, ease: "power3.out" });
    }, scope);
    return () => media.revert();
  }, { scope, dependencies: [status], revertOnUpdate: true });

  if (status === "erro") return <div ref={scope} className={styles.page}>
    {demonstration && <p className={styles.demoNotice} role="note">Estado ilustrativo — não corresponde a uma análise real.</p>}
    <EmptyState title="Não foi possível concluir a leitura" description={errorMessage ?? explanation} icon={<span>!</span>} action={{ label: "Voltar e escolher outro arquivo", href: "/" }} />
    <p className={styles.help}>O arquivo original não é mantido depois da extração. Nenhum palpite foi produzido para uma análise que não terminou.</p>
  </div>;

  const panelHref = `/a/${encodeURIComponent(id)}`;
  return <div ref={scope} className={styles.page} aria-busy={status !== "pronta"}>
    {demonstration && <p className={styles.demoNotice} role="note">Demonstração visual — estado e contadores sintéticos. Nenhum processamento está acontecendo.</p>}
    <header className={styles.header}>
      <div><p className="label-small text-accent">Etapa de análise</p><h1 className="m-0 text-2xl font-semibold">{status === "pronta" ? "A leitura terminou" : "Preparando o raio-X"}</h1>
        <p className={styles.help}>{explanation}</p></div>
      <Link href="/" className="ui-button ui-button--secondary">Nova análise</Link>
    </header>
    <Card title="Do arquivo ao painel">
      <ol className={styles.steps} aria-label="Etapas de processamento">
        {steps.map((step, index) => {
          const active = index === currentIndex;
          const complete = status === "pronta" || (currentIndex >= 0 && index < currentIndex);
          return <li key={step.id} data-active={active} data-complete={complete} aria-current={active ? "step" : undefined}>
            <span className={styles.stepIcon} aria-hidden="true">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
            <span><strong>{step.label}</strong><small>{step.detail}</small></span>
          </li>;
        })}
      </ol>
      <div className={styles.progressTrack} role="progressbar" aria-label="Progresso das etapas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress[status] * 100)}>
        <span ref={fill} className={styles.progressFill} style={{ transform: `scaleX(${progress[status]})` }} />
      </div>
      <div className={styles.counters}>
        <div><span>Pacotes lidos</span><strong>{typeof packetsRead === "number" ? <CountUp value={packetsRead} /> : "—"}</strong></div>
        <div><span>Fluxos encontrados</span><strong>{typeof flowsFound === "number" ? <CountUp value={flowsFound} /> : "—"}</strong></div>
        <p>Os contadores aparecem quando o serviço os disponibiliza; não estimamos valores ausentes.</p>
      </div>
    </Card>
    {status === "pronta" && <Card title="Próxima etapa">
      <p className={styles.help}>Os três modelos produzem palpites, não certezas. A concordância entre eles não mede acurácia.</p>
      <Link className="ui-button ui-button--primary" href={panelHref}>Abrir painel da análise</Link>
    </Card>}
    <p className={styles.help}>A captura é lida pelos metadados dos pacotes. A animação explica as etapas; ela não substitui os contadores nem confirma que o processamento avançou.</p>
  </div>;
}
