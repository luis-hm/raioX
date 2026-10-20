"use client";

import { useId } from "react";
import { Card } from "@/components/ui/Card";
import { SEEDS, number, type Seed } from "./types";
import { LOSS_LEVELS, type LossLevel, type LossSettings, type PacketLoss } from "./packet-loss";
import styles from "./xray.module.css";

export function PacketLossControls({ settings, selection, onChange }: {
  settings: LossSettings;
  selection: PacketLoss;
  onChange: (settings: LossSettings) => void;
}) {
  const id = useId();
  const shown = selection.lost.slice(0, 32);
  return <Card title="Simulação local de perda de pacotes">
    <div className={styles.controls}>
      <label className={styles.seedLabel}>
        <input type="checkbox" checked={settings.enabled} aria-describedby={`${id}-scope`}
          onChange={event => onChange({ ...settings, enabled: event.target.checked })} />
        Ativar simulação visual
      </label>
      <label className={styles.seedLabel}>Perda desejada
        <select className={styles.select} value={settings.level}
          onChange={event => onChange({ ...settings, level: Number(event.target.value) as LossLevel })}>
          {LOSS_LEVELS.map(level => <option key={level} value={level}>{level}%</option>)}
        </select>
      </label>
      <label className={styles.seedLabel}>Semente da simulação
        <select className={styles.select} value={settings.seed}
          onChange={event => onChange({ ...settings, seed: Number(event.target.value) as Seed })}>
          {SEEDS.map(seed => <option key={seed} value={seed}>{seed}</option>)}
        </select>
      </label>
    </div>
    <p id={`${id}-scope`} className={styles.caption}>
      Apenas reprodução visual da perda nos até 100 pacotes guardados, em exemplos e uploads.
      A semente visual é independente dos modelos. A mesma entrada, semente e nível repetem a seleção.
      A quantidade perdida é arredondada ao inteiro mais próximo; amostras curtas podem ter 0 perdas.
      Nada é persistido ou enviado à API.
    </p>
    {settings.enabled ? <>
      <p className={styles.lossSummary} role="status" aria-live="polite" aria-atomic="true">
        Amostra: {number(selection.retainedIndices.length)} retidos · {number(selection.lostIndices.length)} perdidos
        {" "}de {number(selection.lost.length)}. Na escada dos primeiros {shown.length}:
        {" "}{shown.filter(lost => !lost).length} retidos · {shown.filter(Boolean).length} perdidos.
      </p>
      <aside className={styles.banner} role="note">
        <strong>Simulação local · somente visual.</strong> Os palpites e a matriz publicados na tela permanecem os da entrada original.
        Os fluxos não são reclassificados. Características, intervalos, prefixos e oclusões não são recalculados.
        Não há novo desempenho nem macro-F1 simulado. Os resultados publicados do C4 permanecem imutáveis e separados.
      </aside>
    </> : <p className={styles.caption}>Simulação desativada. Todos os pacotes são exibidos como recebidos.</p>}
  </Card>;
}
