import { CLASSES, MODELOS, NOMES, type FluxoTabela, type Modelo } from "./api";

const headers = ["numero_fluxo", "protocolo", "inicio_observado_s", "duracao_observada_s", "pacotes_guardados", "bytes_amostra", ...MODELOS.flatMap(model => [`previsao_${model}`, `probabilidade_${model}`, `estabilidade_${model}_sementes`])];

function quote(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Serialize only the anonymized fields intended for the current table export. */
export function serializeVisibleFlowsCsv(flows: readonly FluxoTabela[]): string {
  const rows = flows.map(flow => [
    flow.n, flow.proto === 6 ? "TCP" : "UDP", flow.ini_s, flow.duracao_s,
    flow.n_pacotes_guardados, flow.bytes_amostra_cliente + flow.bytes_amostra_servidor,
    ...MODELOS.flatMap((model: Modelo) => {
      const prediction = flow.previsoes[model];
      const category = prediction?.classe_prevista;
      const probability = category && CLASSES.includes(category as typeof CLASSES[number])
        ? prediction.probabilidades[category] : undefined;
      const stability = flow.estabilidade[model];
      return [category && CLASSES.includes(category as typeof CLASSES[number]) ? NOMES[category as typeof CLASSES[number]] : category ?? null,
        typeof probability === "number" && Number.isFinite(probability) ? probability : null,
        typeof stability === "number" && Number.isFinite(stability) ? stability : null];
    }),
  ]);
  return [headers, ...rows].map(row => row.map(quote).join(",")).join("\r\n");
}

export function downloadVisibleFlowsCsv(flows: readonly FluxoTabela[]): void {
  const blob = new Blob(["\uFEFF", serializeVisibleFlowsCsv(flows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fluxos.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
