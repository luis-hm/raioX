import { CLASSES, type ExplicacaoFluxo, type FluxoDetalhe, type FluxoTabela, type Palpite } from "./api";
import type { FlowXRayData, MatrixRow, Model, Probabilities, Seed } from "../components/motion/types";
import type { RibbonFlow } from "../components/motion/ribbon-data";

const models = [["b1", "B1"], ["b2", "B2"], ["p", "P"]] as const;

function probabilities(pick: Palpite): Probabilities {
  const values = CLASSES.map(category => pick?.probabilidades[category]);
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 1)
    || Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.001)
    throw new Error("Probabilidades incompletas na explicação.");
  return values as unknown as Probabilities;
}

/** Preserve API values and class order; never derive predictions in the browser. */
export function toFlowXRay(flow: FluxoDetalhe, explanation: ExplicacaoFluxo, seed: Seed,
  origin: "upload" | "exemplo"): FlowXRayData {
  const count = Math.min(32, flow.pacotes.length);
  // Validate metadata before caching an explanation, using the same requirements
  // as the renderer. An invalid response must reach the retryable error state.
  if (flow.pacotes.length < 3 || flow.pacotes.length > 100
    || flow.pacotes.some(([bytes, , time], index) =>
      !Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(time) || time < 0
      || (index > 0 && time < flow.pacotes[index - 1][2])))
    throw new Error("Pacotes inválidos na explicação.");
  if (flow.matriz_32x4.length !== 32
    || flow.matriz_32x4.some((row, index) =>
      row.length !== 4 || row.some(value => !Number.isFinite(value))
      || Math.abs(row[0]) > 1 || row[1] < 0
      || row[2] !== (index < count ? 1 : 0) || row[3] !== 0
      || (index >= count && row.some(value => value !== 0))))
    throw new Error("Matriz incompleta ou inválida.");
  if (explanation.semente !== seed || explanation.n_pacotes !== count
    || explanation.prefixos.length !== count
    || explanation.prefixos.some((prefix, index) => prefix.n_pacotes !== index + 1)
    || (["B2", "P"] as const).some(model =>
      !CLASSES.includes(explanation.classes_originais_oclusao[model])
      || explanation.oclusao_pp[model]?.length !== count
      || explanation.oclusao_pp[model].some(value => !Number.isFinite(value))))
    throw new Error("Explicação incompleta ou de outra semente.");
  const reference = origin === "exemplo" && flow.rotulo_referencia !== null
    ? CLASSES[flow.rotulo_referencia] : undefined;
  const allFinal = flow.previsoes_por_semente;
  const completeFinal = allFinal && [0, 1, 2, 3, 4].every(value =>
    models.every(([, name]) => CLASSES.includes(allFinal[String(value)]?.[name]?.classe_prevista as typeof CLASSES[number])));
  return {
    flowNumber: flow.n, protocol: flow.proto === 6 ? "TCP" : "UDP",
    packets: flow.pacotes.map(([bytes, direction, timeSeconds]) => {
      if (direction !== 1 && direction !== -1) throw new Error("Direção de pacote inválida.");
      return { bytes, direction, timeSeconds };
    }),
    matrix: flow.matriz_32x4.map((row): MatrixRow => {
      return [row[0], row[1], row[2], row[3]];
    }),
    seeds: { [seed]: {
      prefixes: explanation.prefixos.map(prefix => ({
        b1: probabilities(prefix.B1), b2: probabilities(prefix.B2), p: probabilities(prefix.P),
      })),
      occlusion: { b2: explanation.oclusao_pp.B2, p: explanation.oclusao_pp.P },
      occlusionClasses: { b2: explanation.classes_originais_oclusao.B2, p: explanation.classes_originais_oclusao.P },
    } },
    finalStability: completeFinal ? Object.fromEntries(models.map(([model, name]) =>
      [model, [0, 1, 2, 3, 4].filter(value =>
        allFinal[String(value)][name].classe_prevista === allFinal[String(seed)][name].classe_prevista).length])) as Record<Model, number> : undefined,
    source: reference ? { kind: "example", referenceLabel: reference } : { kind: "upload" },
    notice: explanation.aviso,
  };
}

export function toRibbonFlows(flows: readonly FluxoTabela[]) {
  let omittedDuration = 0;
  const ribbons: RibbonFlow[] = [];
  for (const flow of flows) {
    if (!Number.isInteger(flow.n) || flow.n < 0 || (flow.proto !== 6 && flow.proto !== 17)
      || !Number.isFinite(flow.ini_s) || flow.ini_s < 0
      || !Number.isInteger(flow.n_pacotes_guardados) || flow.n_pacotes_guardados < 3 || flow.n_pacotes_guardados > 100
      || !Number.isSafeInteger(flow.bytes_amostra_cliente) || flow.bytes_amostra_cliente < 0
      || !Number.isSafeInteger(flow.bytes_amostra_servidor) || flow.bytes_amostra_servidor < 0
      || (flow.duracao_s != null && (!Number.isFinite(flow.duracao_s) || flow.duracao_s < 0
        || !Number.isFinite(flow.ini_s + flow.duracao_s))))
      throw new Error("Metadados inválidos no mapa de fluxos. Tente carregar novamente.");
    if (flow.duracao_s == null) {
      omittedDuration++;
      continue;
    }
    const predictions = Object.fromEntries(models.map(([model, name]) => {
      const pick = flow.previsoes[name];
      const category = pick?.classe_prevista as typeof CLASSES[number];
      const probability = pick?.probabilidades[category];
      if (!CLASSES.includes(category) || !Number.isFinite(probability) || probability < 0 || probability > 1)
        throw new Error("Palpites incompletos no mapa de fluxos.");
      return [model, { category, probability }];
    })) as RibbonFlow["predictions"];
    ribbons.push({
      n: flow.n, protocol: flow.proto === 6 ? "TCP" : "UDP",
      startSeconds: flow.ini_s, durationSeconds: flow.duracao_s,
      packets: flow.n_pacotes_guardados,
      sampleBytes: flow.bytes_amostra_cliente + flow.bytes_amostra_servidor,
      predictions,
    });
  }
  return { ribbons, omittedDuration };
}
