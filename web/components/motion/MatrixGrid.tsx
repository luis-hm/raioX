"use client";

import type { Ref } from "react";
import type { gsap } from "gsap";
import { number, STEP_SECONDS, type MatrixRow } from "./types";
import styles from "./xray.module.css";

export type MatrixGridProps = {
  rows: readonly MatrixRow[];
  activePacket: number;
  rootRef?: Ref<HTMLDivElement>;
};

/** Attach cell reveals to the same scoped timeline used by PacketLadder. */
export function animateMatrixGrid(timeline: gsap.core.Timeline, root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-matrix-present]").forEach((row, i) => {
    timeline.fromTo(row.querySelectorAll("[data-cell-value]"), { opacity: 0, y: 4 }, {
      opacity: 1, y: 0, duration: 0.12, stagger: 0.04, ease: "power1.inOut",
    }, i * STEP_SECONDS + 0.08);
  });
}

export function MatrixGrid({ rows, activePacket, rootRef }: MatrixGridProps) {
  return (
    <div ref={rootRef} className={styles.matrix}>
      <table className={styles.matrixTable}>
        <caption className="sr-only">Matriz 32 por 4 antes da padronização pelo treino</caption>
        <thead><tr><th scope="col">#</th>{["Tam. ±", "Δt", "Pres.", "Másc."].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 32).map((row, i) => (
            <tr key={i} data-matrix-present={row[2] > 0 ? "" : undefined} data-active={activePacket === i + 1} data-padding={row[2] === 0}>
              <th scope="row">{i + 1}</th>
              {row.map((value, channel) => (
                <td key={channel}>
                  <span data-cell-value>{number(value, channel < 2 ? 2 : 0)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.caption}>Linhas sem pacote ficam zeradas. A máscara permanece em 0 na classificação.</p>
    </div>
  );
}
