"use client";

import { useEffect } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { CATEGORIES, CATEGORY_LABEL, MODEL_LABEL, number, winningCategory, type Model, type Probabilities } from "./types";
import styles from "./xray.module.css";

export type ProbBarsProps = {
  model: Model;
  /** Null means no prefix has been observed: do not invent a prior prediction. */
  probabilities: Probabilities | null;
  /** Pause/scrub settle immediately so springs cannot keep moving behind a paused timeline. */
  animate?: boolean;
};

function SpringBar({ value, animate }: { value: number; animate: boolean }) {
  const reducedMotion = useReducedMotion();
  const scale = useSpring(value, { stiffness: 400, damping: 32 });
  useEffect(() => {
    if (reducedMotion || !animate) scale.jump(value);
    else scale.set(value);
  }, [value, animate, reducedMotion, scale]);
  return <motion.span className={styles.probFill} style={{ scaleX: scale, transformOrigin: "left center" }} />;
}

export function ProbBars({ model, probabilities, animate = true }: ProbBarsProps) {
  const winner = probabilities ? winningCategory(probabilities) : null;
  return (
    <section className={styles.probModel} style={{ color: `var(--${model})` }} aria-label={`Probabilidades de ${model.toUpperCase()}`}>
      <header className={styles.modelHeader}>
        <strong>{model.toUpperCase()}</strong><span>{MODEL_LABEL[model]}</span>
      </header>
      <p className={styles.winner}>{winner ? CATEGORY_LABEL[winner] : "Aguardando pacote"}</p>
      <ul className={styles.probList}>
        {CATEGORIES.map((category, i) => (
          <li key={category}>
            <div className={styles.probLabel}><span>{CATEGORY_LABEL[category]}</span><span className="font-mono">{probabilities ? `${number(probabilities[i] * 100, 1)}%` : "—"}</span></div>
            <div className={styles.probTrack} aria-hidden="true"><SpringBar value={probabilities?.[i] ?? 0} animate={animate} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
