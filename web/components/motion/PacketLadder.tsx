"use client";

import type { Ref } from "react";
import type { gsap } from "gsap";
import { number, STEP_SECONDS, type Packet } from "./types";
import styles from "./xray.module.css";

export type PacketLadderProps = {
  packets: readonly Packet[];
  activePacket: number;
  rootRef?: Ref<HTMLDivElement>;
  lost?: readonly boolean[];
};

/**
 * Add to the caller's ONE timeline, inside scoped useGSAP.
 * The caller owns cleanup and playback. Never creates an independent timeline.
 */
export function animatePacketLadder(timeline: gsap.core.Timeline, root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-packet-arrow]").forEach((arrow, i) => {
    timeline.fromTo(arrow, { scaleX: 0, opacity: 0 }, {
      scaleX: 1, opacity: 1, duration: 0.16, ease: "power1.inOut",
    }, i * STEP_SECONDS);
  });
}

export function PacketLadder({ packets, activePacket, rootRef, lost }: PacketLadderProps) {
  return (
    <div ref={rootRef} className={styles.ladder}>
      <div className={styles.ladderHeader} aria-hidden="true">
        <span>#</span><span>Saída →</span><span>← Retorno</span><span>Bytes</span>
      </div>
      <ol className={styles.packetList} aria-label="Escada dos primeiros 32 pacotes com carga">
        {packets.slice(0, 32).map((packet, i) => (
          <li key={i} className={styles.packetRow} data-active={activePacket === i + 1} data-loss={lost?.[i]}>
            <span className={styles.rowNumber}>{number(i + 1)}</span>
            <span className={styles.packetTrack}>
              <span
                data-packet-arrow
                className={styles.packetArrow}
                data-direction={packet.direction}
                data-loss={lost?.[i]}
                style={{ transformOrigin: packet.direction === 1 ? "left center" : "right center" }}
                aria-hidden="true"
              >
                <span className={styles.arrowLine} />
                <span className={styles.arrowHead}>{lost?.[i] ? "×" : packet.direction === 1 ? "›" : "‹"}</span>
              </span>
              <span className="sr-only">{packet.direction === 1 ? "Saída" : "Retorno"}, </span>
              {lost ? <span className={styles.packetLossLabel}>{lost[i] ? "Perdido" : "Retido"}<span className="sr-only"> na simulação local</span></span> : null}
            </span>
            <span className={styles.packetBytes}>{number(packet.bytes)}<span className="sr-only"> bytes</span></span>
          </li>
        ))}
      </ol>
      <p className={styles.caption}>Direções relativas ao primeiro pacote. Faixas abstratas, sem identificar os participantes.</p>
    </div>
  );
}
