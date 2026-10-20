"use client";

import { useId, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "./shared.module.css";

gsap.registerPlugin(useGSAP);
export type SparklineProps = {
  values: readonly number[];
  label: string;
  tone?: "accent" | "b1" | "b2" | "p" | "ok" | "warn";
};

export function Sparkline({ values, label, tone = "accent" }: SparklineProps) {
  const scope = useRef<HTMLDivElement>(null);
  const id = useId();
  const valid = values.length > 0 && values.every(Number.isFinite);
  const low = valid ? Math.min(...values) : 0;
  const high = valid ? Math.max(...values) : 0;
  const points = valid ? values.map((v, i) =>
    `${values.length === 1 ? 100 : 4 + i / (values.length - 1) * 192},${high === low ? 24 : 44 - (v - low) / (high - low) * 40}`) : [];
  const path = points.map((point, i) => `${i === 0 ? "M" : "L"}${point}`).join(" ");
  const title = `${label}: ${values.join(", ")}`;

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const node = scope.current?.querySelector("[data-spark-path]");
      if (!node || points.length < 2 || !scope.current) return;
      // Drawing the SVG d is the sole exception to transform/opacity in DESIGN.md.
      const draw = gsap.fromTo(node, { attr: { d: points.map((_, i) => `${i ? "L" : "M"}${points[0]}`).join(" ") } },
        { attr: { d: path }, duration: 0.8, ease: "power2.inOut", paused: true });
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { draw.play(); observer.disconnect(); }
      });
      observer.observe(scope.current);
      return () => observer.disconnect();
    }, scope);
    // Reduced motion retains the server-rendered complete path.
    return () => media.revert();
  }, { scope, dependencies: [path], revertOnUpdate: true });

  return <div ref={scope} className={styles.sparkline}>
    {valid ? <svg viewBox="0 0 200 48" role="img" aria-labelledby={id} style={{ color: `var(--${tone})` }}>
      <title id={id}>{title}</title>
      {values.length === 1 ? <circle cx="100" cy="24" r="3" fill="currentColor" />
        : <path data-spark-path d={path} fill="none" stroke="currentColor" strokeWidth="2" />}
    </svg> : <span className="text-xs text-text-muted">Sem série disponível</span>}
  </div>;
}
