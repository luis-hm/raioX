"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { CountUp } from "./CountUp";
import { Sparkline } from "./Sparkline";
import { ModelToggle } from "./ModelToggle";
import { FlowRibbons } from "./FlowRibbons";
import { TimelineScrubber } from "./TimelineScrubber";
import { ProcessingDemo } from "./ProcessingDemo";
import { demoRibbons } from "./ribbon-demo";
import { ribbonExtent } from "./ribbon-data";
import { SEEDS, type Model, type Seed } from "./types";
import styles from "./shared.module.css";

export function SharedMotionDemo() {
  const [value, setValue] = useState(1402);
  const [seed, setSeed] = useState<Seed>(0);
  const [model, setModel] = useState<Model>("b1");
  const flows = useMemo(() => demoRibbons(seed), [seed]);
  const extent = ribbonExtent(flows);
  const [cutoff, setCutoff] = useState(extent);
  return <section id="compartilhados" className={styles.demoSection}>
    <h2 className="text-xl">Componentes compartilhados</h2>
    <p className={styles.notice}>Demonstração visual — todos os valores são sintéticos, sem resultado de captura ou do estudo.</p>
    <nav className="flex flex-wrap gap-4 text-sm text-accent" aria-label="Demos de componentes">
      <a href="#count-up">CountUp</a><a href="#sparkline">Sparkline</a><a href="#model-toggle">ModelToggle</a>
      <a href="#timeline-scrubber">TimelineScrubber</a><a href="#flow-ribbons">FlowRibbons</a><a href="#raio-x">Raio-X</a>
    </nav>
    <div className={`${styles.demoGrid} mt-4`}>
      <section id="count-up"><Card title="CountUp">
        <CountUp value={value} className="font-mono text-xl" />
        <button className="ui-button ui-button--secondary ml-4" onClick={() => setValue(current => current === 1402 ? 2608 : 1402)}>Alterar valor</button>
        <p className={styles.caption}>Props: value, digits, suffix, className. Leitores de tela recebem o valor final.</p>
      </Card></section>
      <section id="sparkline"><Card title="Sparkline">
        <Sparkline values={[4, 6, 5, 12, 8, 16, 14]} label="Série ilustrativa" tone="accent" />
        <p className={styles.caption}>Props: values, label, tone. Desenho ao entrar na tela; série completa com movimento reduzido.</p>
        <Sparkline values={[]} label="Série vazia" />
      </Card></section>
      <section id="model-toggle"><Card title="ModelToggle">
        <ModelToggle value={model} onChange={setModel} />
        <p className={styles.caption}>Props: value, onChange, label. Use Tab e as setas. O modelo escolhido também colore as fitas abaixo.</p>
        <label className="text-sm">Semente dos três modelos
          <select className="ml-2 rounded-field border border-border bg-surface-2 p-2" value={seed} onChange={event => setSeed(Number(event.target.value) as Seed)}>
            {SEEDS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </Card></section>
    </div>
    <section id="timeline-scrubber" className={styles.demoSection}><Card title="TimelineScrubber">
      <TimelineScrubber value={cutoff} max={extent} markers={flows.map(flow => flow.startSeconds)} onChange={setCutoff} />
      <p className={styles.caption}>Props: value, min, max, step, markers, onChange, label. Controle em segundos; filtra por início, inclusive com movimento reduzido.</p>
    </Card></section>
    <section id="flow-ribbons" className={styles.demoSection}><Card title="FlowRibbons">
      <FlowRibbons flows={flows} model={model} seed={seed} cutoffSeconds={cutoff} demonstration />
      <p className={styles.caption}>Props: flows (RibbonFlow[]), model, seed, cutoffSeconds, demonstration.
        Cada fluxo contém número anônimo, protocolo, início e duração observados, pacotes, bytes da amostra e os três palpites da semente ativa. Até oito fitas por página.</p>
      <details><summary>Estado vazio</summary><FlowRibbons flows={[]} model={model} seed={seed} demonstration /></details>
      <details><summary>Mais de uma página</summary><FlowRibbons flows={[...flows, ...flows.map(flow => ({ ...flow, n: flow.n + 8 }))]} model={model} seed={seed} demonstration /></details>
    </Card></section>
    <ProcessingDemo />
  </section>;
}
