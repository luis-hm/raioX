/** Presentation contract only: no network identifiers or packet contents. */
export type Seed = 0 | 1 | 2 | 3 | 4;
export type Model = "b1" | "b2" | "p";
export type Category = "chat" | "email" | "transferencia" | "streaming" | "voip";
export type Probabilities = readonly [number, number, number, number, number];
export type MatrixRow = readonly [number, number, number, number];
export type Packet = Readonly<{ bytes: number; direction: 1 | -1; timeSeconds: number }>;
export type PrefixPrediction = Readonly<Record<Model, Probabilities>>;
export type SeedExplanation = Readonly<{
  /** Index zero contains the prediction after ONE packet, never an empty prefix. */
  prefixes: readonly PrefixPrediction[];
  /** p(original winning class) - p(the same class after zeroing the packet), in pp. */
  occlusion: Readonly<Record<"b2" | "p", readonly number[]>>;
  occlusionClasses?: Readonly<Record<"b2" | "p", Category>>;
}>;
export type FlowXRayData = Readonly<{
  flowNumber: number;
  protocol: "TCP" | "UDP";
  packets: readonly Packet[];
  /** Exactly 32 rows, before training-set standardization. Padding is all zeros. */
  matrix: readonly MatrixRow[];
  /** Only loaded seeds are present; real explanations are requested on selection. */
  seeds: Readonly<Partial<Record<Seed, SeedExplanation>>>;
  finalStability?: Readonly<Record<Model, number>>;
  notice?: string;
  source:
    | Readonly<{ kind: "illustrative" | "upload" }>
    | Readonly<{ kind: "example"; referenceLabel: Category }>;
}>;

export const CATEGORIES: readonly Category[] = ["chat", "email", "transferencia", "streaming", "voip"];
export const SEEDS: readonly Seed[] = [0, 1, 2, 3, 4];
export const MODELS: readonly Model[] = ["b1", "b2", "p"];
export const CATEGORY_LABEL: Record<Category, string> = {
  chat: "Chat", email: "E-mail", transferencia: "Transferência", streaming: "Streaming", voip: "VoIP",
};
export const CATEGORY_TOKEN: Record<Category, string> = {
  chat: "var(--cat-chat)", email: "var(--cat-email)", transferencia: "var(--cat-transf)",
  streaming: "var(--cat-stream)", voip: "var(--cat-voip)",
};
export const MODEL_LABEL: Record<Model, string> = { b1: "Random Forest", b2: "CNN", p: "CNN + pré-treino" };
export const STEP_SECONDS = 0.32;
export const number = (value: number, digits = 0) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function winningCategory(values: Probabilities): Category {
  return CATEGORIES[values.indexOf(Math.max(...values))];
}
