import { MODELS, type Model, type Category } from "./types";

export type RibbonFlow = Readonly<{
  n: number;
  protocol: "TCP" | "UDP";
  /** Relative to the capture's origin, in seconds. */
  startSeconds: number;
  /** Interval between first and last observed payload packet, including beyond the stored sample. */
  durationSeconds: number;
  packets: number;
  sampleBytes: number;
  predictions: Readonly<Record<Model, Readonly<{ category: Category; probability: number }>>>;
}>;

export const RIBBONS_PER_PAGE = 8;

export function ribbonExtent(flows: readonly RibbonFlow[]): number {
  return Math.max(0, ...flows.map(flow => flow.startSeconds + flow.durationSeconds));
}

/** A cutoff selects starts, not overlaps or simulated playback progress. */
export function ribbonPage(flows: readonly RibbonFlow[], cutoff: number, page: number, pageSize = RIBBONS_PER_PAGE) {
  const size = Math.max(1, Math.min(24, Math.floor(pageSize) || RIBBONS_PER_PAGE));
  const eligible = flows.filter(flow => flow.startSeconds <= cutoff)
    .sort((a, b) => a.startSeconds - b.startSeconds || a.n - b.n);
  const pages = Math.max(1, Math.ceil(eligible.length / size));
  const current = Math.min(pages - 1, Math.max(0, Math.floor(page) || 0));
  return { flows: eligible.slice(current * size, (current + 1) * size), page: current, pages, total: eligible.length };
}

export function ribbonDisagrees(flow: RibbonFlow): boolean {
  return new Set(MODELS.map(model => flow.predictions[model].category)).size > 1;
}

/** Coordinates share one scale across pages, filters, models and seeds. */
export function ribbonGeometry(flow: RibbonFlow, extent: number, maxBytes: number) {
  const scale = extent > 0 ? 960 / extent : 0;
  const start = 20 + flow.startSeconds * scale;
  const end = 20 + (flow.startSeconds + flow.durationSeconds) * scale;
  return { start, end, thickness: maxBytes > 0 ? 20 * flow.sampleBytes / maxBytes : 0,
    path: `M${start},22 L${end},22`, initialPath: `M${start},22 L${start},22` };
}

export function scrubValue(value: number, min: number, max: number, step: number): number {
  if (max <= min) return min;
  const safe = Number.isFinite(value) ? value : min;
  const increment = Number.isFinite(step) && step > 0 ? step : 0.1;
  if (safe >= max) return max;
  return Math.min(max, Math.max(min, Number((min + Math.round((safe - min) / increment) * increment).toFixed(6))));
}
