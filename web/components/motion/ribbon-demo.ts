/** Synthetic temporal fixtures only; these numbers are NOT measured capture data. */
import { DEMO_FLOWS, type Seed } from "@/lib/panel-demo";
import type { Category } from "./types";
import type { RibbonFlow } from "./ribbon-data";

const categories = { chat: "chat", email: "email", transf: "transferencia", stream: "streaming", voip: "voip" } as const satisfies Record<string, Category>;
const observations = [
  [0, 8.4, 24800], [2.1, 15.2, 9920], [5.2, 24, 138000], [9.6, 3.2, 13200],
  [12.8, 19.5, 46800], [19.4, 28.8, 112800], [24.2, 8.1, 4960], [31.6, 6.4, 17100],
] as const;

/** Reuses panel predictions; only temporal observations/bytes are added as fiction. */
export function demoRibbons(seed: Seed): readonly RibbonFlow[] {
  return DEMO_FLOWS.map((flow, i) => {
    const predictions = flow.bySeed[seed];
    return {
      n: flow.n, protocol: flow.proto === 6 ? "TCP" : "UDP", packets: flow.packets,
      startSeconds: observations[i][0], durationSeconds: observations[i][1], sampleBytes: observations[i][2],
      predictions: {
        b1: { category: categories[predictions.b1.classe], probability: predictions.b1.probability },
        b2: { category: categories[predictions.b2.classe], probability: predictions.b2.probability },
        p: { category: categories[predictions.p.classe], probability: predictions.p.probability },
      },
    };
  });
}
