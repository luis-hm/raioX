import type { FlowXRayData, MatrixRow, Packet, Probabilities, Seed, SeedExplanation } from "./types";

// Synthetic, deterministic fixtures. These are NOT model inference or ISCX measurements.
const sizes = [152, 96, 1360, 1440, 80, 1420, 1480, 128, 1380, 1416, 96, 1460,
  1440, 72, 1352, 1480, 104, 1400, 1440, 88, 1472, 1360, 120, 1440];
const packets: Packet[] = sizes.map((bytes, i) => ({
  bytes, direction: i % 3 === 1 || i === 0 ? 1 : -1,
  timeSeconds: Number((i * 0.032 + Math.floor(i / 6) * 0.14).toFixed(3)),
}));
const matrix: MatrixRow[] = Array.from({ length: 32 }, (_, i) => {
  const packet = packets[i];
  if (!packet) return [0, 0, 0, 0];
  const dtMs = i === 0 ? 0 : (packet.timeSeconds - packets[i - 1].timeSeconds) * 1000;
  return [packet.direction * packet.bytes / 1500, Math.log1p(Math.max(0, dtMs)), 1, 0];
});
function probabilities(packet: number, seed: number, model: number): Probabilities {
  const weights = [2 + ((packet + seed) % 3), 1.2, 3 + model,
    3 + packet * (0.65 - model * 0.13) + seed * 0.8,
    2 + ((packet + seed + model) % 5)];
  if (model === 1 && seed === 3) weights[2] += packet * 0.6;
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(value => value / sum) as unknown as Probabilities;
}
function explanation(seed: Seed): SeedExplanation {
  return {
    prefixes: packets.map((_, i) => ({
      b1: probabilities(i + 1, seed, 0), b2: probabilities(i + 1, seed, 1), p: probabilities(i + 1, seed, 2),
    })),
    occlusion: {
      b2: packets.map((_, i) => ((i * 7 + seed * 3) % 17 - 4) / 2),
      p: packets.map((_, i) => ((i * 5 + seed * 2) % 15 - 3) / 2),
    },
  };
}
export const DEMO_FLOW: FlowXRayData = {
  flowNumber: 1, protocol: "TCP", packets, matrix,
  seeds: { 0: explanation(0), 1: explanation(1), 2: explanation(2), 3: explanation(3), 4: explanation(4) },
  source: { kind: "illustrative" },
};
