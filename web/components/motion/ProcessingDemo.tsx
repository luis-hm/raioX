"use client";

import { useState } from "react";
import { ProcessingPipeline, type ProcessingStatus } from "./ProcessingPipeline";
import styles from "./processing.module.css";

const statuses: readonly ProcessingStatus[] = ["recebida", "extraindo", "classificando", "pronta", "erro"];

export function ProcessingDemo() {
  const [status, setStatus] = useState<ProcessingStatus>("recebida");
  return <section className={styles.demoSection}>
    <h2 className="text-xl">Demonstração dos estados de processamento</h2>
    <p className={styles.help}>Altere o estado para inspecionar a apresentação. Os números abaixo são ilustrativos e não há análise ativa.</p>
    <label className={styles.statusSelect}>Estado da demonstração
      <select value={status} onChange={event => setStatus(event.target.value as ProcessingStatus)}>
        {statuses.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <ProcessingPipeline id="demonstracao" status={status} packetsRead={18340} flowsFound={127} demonstration />
  </section>;
}
