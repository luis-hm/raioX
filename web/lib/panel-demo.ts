/** Dados sintéticos de interface. Não representam captura ou resultado do estudo. */
export const SEEDS = [0, 1, 2, 3, 4] as const;
export type Seed = (typeof SEEDS)[number];
export const MODELS = ["b1", "b2", "p"] as const;
export type Model = (typeof MODELS)[number];
export const CLASSES = ["chat", "email", "transf", "stream", "voip"] as const;
export type FlowClass = (typeof CLASSES)[number];

export const MODEL_NAMES: Record<Model, string> = { b1: "B1 · Random Forest", b2: "B2 · CNN", p: "P · CNN pré-treinada" };
export const CLASS_NAMES: Record<FlowClass, string> = { chat: "Chat", email: "E-mail", transf: "Transferência", stream: "Streaming", voip: "VoIP" };

type Prediction = { classe: FlowClass; probability: number };
export type DemoFlow = {
  n: number;
  proto: 6 | 17;
  packets: number;
  bySeed: Record<Seed, Record<Model, Prediction>>;
};

const base: readonly { proto: 6 | 17; packets: number; classes: readonly [FlowClass, FlowClass, FlowClass] }[] = [
  { proto: 6, packets: 80, classes: ["chat", "chat", "chat"] },
  { proto: 17, packets: 62, classes: ["voip", "voip", "voip"] },
  { proto: 6, packets: 100, classes: ["transf", "transf", "stream"] },
  { proto: 6, packets: 44, classes: ["email", "email", "email"] },
  { proto: 17, packets: 39, classes: ["stream", "stream", "stream"] },
  { proto: 6, packets: 94, classes: ["transf", "chat", "transf"] },
  { proto: 17, packets: 31, classes: ["voip", "voip", "stream"] },
  { proto: 6, packets: 57, classes: ["email", "email", "chat"] },
];

export const DEMO_FLOWS: readonly DemoFlow[] = base.map((flow, index) => {
  const bySeed = {} as DemoFlow["bySeed"];
  for (const seed of SEEDS) {
    const predictions = {} as Record<Model, Prediction>;
    MODELS.forEach((model, modelIndex) => {
      const shift = (index + seed + modelIndex) % 7 === 0 ? 1 : 0;
      const initial = CLASSES.indexOf(flow.classes[modelIndex]);
      predictions[model] = {
        classe: CLASSES[(initial + shift) % CLASSES.length],
        probability: (55 + ((index * 7 + seed * 9 + modelIndex * 11) % 38)) / 100,
      };
    });
    bySeed[seed] = predictions;
  }
  return { n: index + 1, proto: flow.proto, packets: flow.packets, bySeed };
});

export function modelsAgree(flow: DemoFlow, seed: Seed): boolean {
  const { b1, b2, p } = flow.bySeed[seed];
  return b1.classe === b2.classe && b2.classe === p.classe;
}

export function agreementPercent(flows: readonly DemoFlow[], seed: Seed): number {
  if (flows.length === 0) return 0;
  return Math.round((flows.filter((flow) => modelsAgree(flow, seed)).length / flows.length) * 100);
}

/** Quantas das cinco sementes repetem o palpite da semente selecionada. */
export function seedStability(flow: DemoFlow, model: Model, seed: Seed): number {
  const chosen = flow.bySeed[seed][model].classe;
  return SEEDS.filter((candidate) => flow.bySeed[candidate][model].classe === chosen).length;
}

export function categoryCounts(flows: readonly DemoFlow[], model: Model, seed: Seed): Record<FlowClass, number> {
  const counts = Object.fromEntries(CLASSES.map((name) => [name, 0])) as Record<FlowClass, number>;
  for (const flow of flows) counts[flow.bySeed[seed][model].classe] += 1;
  return counts;
}

export function filterFlows(flows: readonly DemoFlow[], seed: Seed, model: Model, category: FlowClass | "all", disagreementsOnly: boolean): DemoFlow[] {
  return flows.filter((flow) =>
    (category === "all" || flow.bySeed[seed][model].classe === category) &&
    (!disagreementsOnly || !modelsAgree(flow, seed))
  );
}
