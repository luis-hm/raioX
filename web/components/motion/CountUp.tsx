"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { number } from "./types";

export type CountUpProps = {
  value: number;
  digits?: number;
  suffix?: string;
  className?: string;
};

/** Accessible text always contains the final value, including during animation. */
export function CountUp({ value, digits = 0, suffix = "", className }: CountUpProps) {
  const reduced = useReducedMotion();
  const current = useMotionValue(value);
  const display = useTransform(current, latest => `${number(latest, digits)}${suffix}`);
  useEffect(() => {
    if (reduced) { current.set(value); return; }
    const controls = animate(current, value, { duration: 0.8, ease: "easeOut" });
    return () => controls.stop();
  }, [value, reduced, current]);
  return <span className={className} data-numeric>
    <span className="sr-only">{number(value, digits)}{suffix}</span>
    <motion.span aria-hidden="true">{display}</motion.span>
  </span>;
}
