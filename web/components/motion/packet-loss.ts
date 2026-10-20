import type { Packet, Seed } from "./types";

export const LOSS_LEVELS = [0, 10, 20] as const;
export type LossLevel = typeof LOSS_LEVELS[number];
export type LossSettings = Readonly<{ enabled: boolean; level: LossLevel; seed: Seed }>;
export const DEFAULT_LOSS: LossSettings = { enabled: false, level: 10, seed: 0 };

/** Original indices are never compacted: matrix/prediction indices stay original. */
export type PacketLoss = Readonly<{
  lost: readonly boolean[];
  retainedIndices: readonly number[];
  lostIndices: readonly number[];
}>;

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  }
  return value >>> 0;
}

/**
 * Visual selection only, over ALL stored packets before any display cut.
 * Rank by FNV-1a(flow number + packet metadata + seed + original index), then
 * mark round(n * level / 100) indices. Ties use original order. Increasing the
 * level preserves previous losses. No mutation, entropy, I/O, features or models.
 */
export function selectPacketLoss(
  flowNumber: number, packets: readonly Packet[], seed: Seed, level: LossLevel,
): PacketLoss {
  if (!Number.isSafeInteger(flowNumber) || flowNumber < 0
    || !Number.isInteger(seed) || seed < 0 || seed > 4
    || !LOSS_LEVELS.includes(level) || packets.length > 100
    || packets.some((packet, i) => !Number.isFinite(packet.bytes) || packet.bytes <= 0
      || (packet.direction !== 1 && packet.direction !== -1)
      || !Number.isFinite(packet.timeSeconds) || packet.timeSeconds < 0
      || (i > 0 && packet.timeSeconds < packets[i - 1].timeSeconds))) {
    throw new Error("Parâmetros inválidos da simulação visual.");
  }
  const identity = JSON.stringify([flowNumber, packets.map(packet =>
    [packet.bytes, packet.direction, packet.timeSeconds]), seed]);
  const ranked = packets.map((_, index) => ({ index, rank: hash(`${identity}:${index}`) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const selected = new Set(ranked.slice(0, Math.round(packets.length * level / 100)).map(item => item.index));
  const lost = packets.map((_, index) => selected.has(index));
  return {
    lost,
    retainedIndices: packets.flatMap((_, index) => lost[index] ? [] : [index]),
    lostIndices: packets.flatMap((_, index) => lost[index] ? [index] : []),
  };
}
