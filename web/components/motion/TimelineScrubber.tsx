"use client";

import { useId, useRef } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/dist/Draggable";
import { useGSAP } from "@gsap/react";
import { number } from "./types";
import { scrubValue } from "./ribbon-data";
import styles from "./shared.module.css";

gsap.registerPlugin(useGSAP, Draggable);
export type TimelineScrubberProps = {
  value: number;
  min?: number;
  max: number;
  step?: number;
  markers?: readonly number[];
  onChange: (seconds: number) => void;
  label?: string;
};

/** Controlled cutoff; reduced motion removes easing, never disables filtering. */
export function TimelineScrubber({ value, min = 0, max, step = 0.1, markers = [], onChange,
  label = "Mostrar fluxos iniciados até" }: TimelineScrubberProps) {
  const scope = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const drag = useRef<Draggable | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const id = useId();
  const disabled = max <= min;
  const current = scrubValue(value, min, max, step);
  const fraction = (seconds: number) => disabled ? 0 : (seconds - min) / (max - min);

  useGSAP(() => {
    if (!track.current || !cursor.current) return;
    const media = gsap.matchMedia();
    media.add({ reduce: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" }, () => {
      const rail = track.current!;
      const thumb = cursor.current!;
      const position = () => {
        const width = rail.clientWidth;
        drag.current?.applyBounds({ minX: 0, maxX: width });
        gsap.set(thumb, { x: fraction(scrubValue(latest.current.value, min, max, step)) * width });
        drag.current?.update();
      };
      if (!disabled) {
        drag.current = Draggable.create(thumb, {
          type: "x", bounds: { minX: 0, maxX: rail.clientWidth }, inertia: false,
          onPress() { thumb.focus(); },
          onDrag() {
            if (rail.clientWidth > 0)
              latest.current.onChange(scrubValue(min + this.x / rail.clientWidth * (max - min), min, max, step));
          },
        })[0];
      }
      position();
      const resize = new ResizeObserver(position);
      resize.observe(rail);
      return () => { resize.disconnect(); drag.current?.kill(); drag.current = null; };
    }, scope);
    return () => media.revert();
  }, { scope, dependencies: [min, max, step], revertOnUpdate: true });

  useGSAP(() => {
    if (cursor.current && track.current && !drag.current?.isDragging) {
      gsap.set(cursor.current, { x: fraction(current) * track.current.clientWidth });
      drag.current?.update();
    }
  }, { scope, dependencies: [current, min, max] });

  return <div ref={scope} className={styles.scrubber}>
    <div className={styles.scrubberLabel}><span id={`${id}-label`}>{label}</span>
      <span className="font-mono">{number(current, 1)} s</span></div>
    <p id={`${id}-help`} className="text-xs text-text-muted">Arraste o cursor ou use as setas, Home e End. O filtro considera o início observado.</p>
    <div className={styles.railArea}>
      <div ref={track} className={styles.rail} onPointerDown={event => {
        if (disabled || cursor.current?.contains(event.target as Node)) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (bounds.width > 0) onChange(scrubValue(min + (event.clientX - bounds.left) / bounds.width * (max - min), min, max, step));
        cursor.current?.focus();
      }}>
        {markers.filter(time => time >= min && time <= max).slice(0, 100).map((time, i) =>
          <span key={i} className={styles.marker} style={{ left: `${fraction(time) * 100}%` }} aria-hidden="true" />)}
        <div ref={cursor} className={styles.cursor} role="slider" tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} aria-orientation="horizontal"
          aria-valuemin={min} aria-valuemax={max} aria-valuenow={current}
          aria-valuetext={`${number(current, 1)} segundos`} aria-disabled={disabled}
          onKeyDown={event => {
            if (disabled) return;
            const next = event.key === "Home" ? min : event.key === "End" ? max
              : ["ArrowRight", "ArrowUp"].includes(event.key) ? current + step
                : ["ArrowLeft", "ArrowDown"].includes(event.key) ? current - step
                  : event.key === "PageUp" ? current + (max - min) / 10
                    : event.key === "PageDown" ? current - (max - min) / 10 : null;
            if (next === null) return;
            event.preventDefault();
            onChange(scrubValue(next, min, max, step));
          }}><span /></div>
      </div>
    </div>
    <div className={styles.scrubberLabel} aria-hidden="true"><span>{number(min, 1)} s</span><span>{number(max, 1)} s</span></div>
  </div>;
}
