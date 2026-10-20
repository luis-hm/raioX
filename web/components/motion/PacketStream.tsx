"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "./start.module.css";

gsap.registerPlugin(useGSAP);

const packets = [
  { bytes: 80, direction: 1, lane: 0.12, pace: 0.12 }, { bytes: 1420, direction: -1, lane: 0.2, pace: 0.09 },
  { bytes: 512, direction: 1, lane: 0.29, pace: 0.16 }, { bytes: 96, direction: -1, lane: 0.38, pace: 0.11 },
  { bytes: 1360, direction: 1, lane: 0.47, pace: 0.08 }, { bytes: 128, direction: -1, lane: 0.56, pace: 0.14 },
  { bytes: 880, direction: 1, lane: 0.65, pace: 0.1 }, { bytes: 72, direction: -1, lane: 0.74, pace: 0.17 },
  { bytes: 1440, direction: 1, lane: 0.83, pace: 0.07 }, { bytes: 104, direction: -1, lane: 0.92, pace: 0.13 },
] as const;

/** Decorative metadata-only motif; never draws packet payload or endpoints. */
export function PacketStream() {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || !scope.current) return;
    const root = getComputedStyle(document.documentElement);
    const up = root.getPropertyValue("--up").trim();
    const down = root.getPropertyValue("--down").trim();
    const rail = root.getPropertyValue("--border-strong").trim();
    let width = 0;
    let height = 0;

    const paint = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const left = width * 0.08;
      const right = width * 0.92;
      context.strokeStyle = rail;
      context.lineWidth = 1;
      context.setLineDash([3, 7]);
      for (const x of [left, right]) {
        context.beginPath(); context.moveTo(x, 10); context.lineTo(x, height - 10); context.stroke();
      }
      context.setLineDash([]);
      packets.forEach((packet, index) => {
        const phase = ((time * packet.pace + index * 0.173) % 1 + 1) % 1;
        const x = packet.direction === 1 ? left + phase * (right - left) : right - phase * (right - left);
        const y = Math.max(8, Math.min(height - 8, packet.lane * height));
        const packetWidth = 3 + Math.min(12, packet.bytes / 120);
        context.globalAlpha = 0.45 + Math.sin(phase * Math.PI) * 0.5;
        context.fillStyle = packet.direction === 1 ? up : down;
        context.fillRect(x - packetWidth / 2, y - 3, packetWidth, 6);
      });
      context.globalAlpha = 1;
    };

    const resize = () => {
      const bounds = element.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = bounds.width;
      height = bounds.height;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint(0);
    };

    const media = gsap.matchMedia();
    media.add({ reduce: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" }, (match) => {
      const reduced = Boolean(match.conditions?.reduce);
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !reduced) gsap.ticker.add(paint);
        else gsap.ticker.remove(paint);
      });
      observer.observe(scope.current!);
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(element);
      resize();
      if (reduced) paint(0);
      return () => {
        gsap.ticker.remove(paint);
        observer.disconnect();
        resizeObserver.disconnect();
      };
    }, scope);
    return () => media.revert();
  }, { scope });

  return <div ref={scope} className={styles.packetStream} aria-hidden="true">
    <canvas ref={canvas} />
    <span className={styles.client}>Cliente</span><span className={styles.server}>Servidor</span>
    <span className={styles.payload}>▒▒▒</span>
  </div>;
}
