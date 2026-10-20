import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type CsvRow = Record<string, string>;
export type MeanRow = { grupo: string; fracao: number; perda: number; metodo: string; media: number; dp: number; icInf: number; icSup: number; n: number };
export type TestRow = { grupo: string; fracao: number; perda: number; comparacao: string; diferenca: number; pHolm: number; veredito: string };
export type Results = { totalExecutions: number; means: MeanRow[]; tests: TestRow[]; cost: { B2: number | null; P: number | null }; source: string };

function parseCsv(text: string): CsvRow[] {
  const records: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some(Boolean)) records.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); records.push(row); }
  const [header, ...data] = records;
  if (!header) return [];
  return data.map(values => Object.fromEntries(header.map((name, index) => [name, values[index] || ""])));
}

function referencePath(name: string): string {
  const local = join(process.cwd(), "resultados_referencia", name);
  const fromWeb = join(process.cwd(), "..", "resultados_referencia", name);
  return existsSync(local) ? local : fromWeb;
}

export function loadResults(): Results {
  const read = (name: string) => parseCsv(readFileSync(referencePath(name), "utf8"));
  const executions = read("resultados.csv");
  const means = read("etapa9_medias_ic95.csv").map(row => ({
    grupo: row.grupo, fracao: Number(row.fracao_rotulos), perda: Number(row.taxa_perda),
    metodo: row.metodo, media: Number(row.media), dp: Number(row.dp),
    icInf: Number(row.ic_inf), icSup: Number(row.ic_sup), n: Number(row.n),
  }));
  const tests = read("etapa9_testes_pareados.csv").map(row => ({
    grupo: row.grupo, fracao: Number(row.fracao), perda: Number(row.perda),
    comparacao: row.comp, diferenca: Number(row.dif), pHolm: Number(row.p_holm), veredito: row.veredito,
  }));
  const cost = { B2: null as number | null, P: null as number | null };
  for (const method of ["B2", "P"] as const) {
    const rows = executions.filter(row => row.cenario === "C1" && row.metodo === method && row.dobra === "N" && Number(row.fracao_rotulos) === 1);
    if (rows.length) cost[method] = rows.reduce((sum, row) => sum + Number(row.tempo_inferencia_ms), 0) / rows.length;
  }
  return { totalExecutions: executions.length, means, tests, cost, source: "resultados_referencia/resultados.csv + etapa9_medias_ic95.csv + etapa9_testes_pareados.csv" };
}
