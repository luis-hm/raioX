"use client";

import { useId, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MODELS, MODEL_LABEL, type Model } from "./types";
import styles from "./shared.module.css";

export type ModelToggleProps = {
  value: Model;
  onChange: (model: Model) => void;
  label?: string;
};

export function ModelToggle({ value, onChange, label = "Modelo selecionado" }: ModelToggleProps) {
  const id = useId();
  const reduced = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="radiogroup" aria-label={label} className={styles.toggle}>
    {MODELS.map((model, i) => <button key={model} type="button" role="radio"
      ref={element => { buttons.current[i] = element; }}
      aria-checked={value === model} tabIndex={value === model ? 0 : -1}
      aria-label={`${model.toUpperCase()} · ${MODEL_LABEL[model]}`}
      onClick={() => onChange(model)}
      onKeyDown={event => {
        let next = i;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (i + 1) % MODELS.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (i + MODELS.length - 1) % MODELS.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = MODELS.length - 1;
        else return;
        event.preventDefault();
        onChange(MODELS[next]);
        buttons.current[next]?.focus();
      }}>
      {value === model && (reduced
        ? <span className={styles.toggleHighlight} style={{ background: `var(--${model})` }} />
        : <motion.span className={styles.toggleHighlight} layoutId={`${id}-model`}
          style={{ background: `var(--${model})` }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }} />)}
      <span className={styles.toggleLabel}>{model.toUpperCase()}</span>
    </button>)}
  </div>;
}
