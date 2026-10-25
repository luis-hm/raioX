import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Resultado de `python -m experimento.executar`, refeito a partir dos pcaps. */
export type Metodo = "B1" | "B2" | "P" | "P_cong" | "B2_cong";
export type Media = { grupo: string; fracao_rotulos: number; taxa_perda: number; metodo: Metodo; media: number; dp: number; ic_inf: number; ic_sup: number; n: number };
export type Teste = { grupo: string; fracao: number; perda: number; comp: string; n: number; dif: number; dp: number; ic_inf: number; ic_sup: number; p: number | null; p_holm: number; veredito: string };
export type Queda = { fracao: number; perda: number; comp: string; queda_a: number; queda_b: number; dif: number; ic_inf: number; ic_sup: number; p_holm: number; veredito: string };
export type Captura = { arquivo: string; categoria: string; aplicacao: string; tamanho_mb: number; fluxos: number; pacotes_lidos: number | null; motivo: string | null };
export type FluxoAmostra = { rotulo: string; aplicacao: string; proto: number; n_pacotes: number; pacotes: [number, number, number][]; palpites: Record<"B1" | "B2" | "P", string> };
export type Experimento = {
  gerado_em: string;
  hardware: string;
  dados: {
    capturas_total: number; tamanho_gb: number; capturas_incluidas: number; excluidas: string[];
    fluxos: number; principais: number; extras: number; completos_32: number;
    por_categoria: { categoria: string; fluxos: number; mediana_pacotes: number }[];
    por_aplicacao: { categoria: string; aplicacao: string; arquivos: number; sessoes: number; fluxos: number }[];
    capturas: Captura[];
    acima_1500: { acima_1500: number; pacotes_32: number };
    testes: { blocos_temporais: string[]; teste5: Record<string, { duplicados: number; teste: number }> };
  };
  passos: { escolhidos: number; curva: { passos: number; mean: number; std: number }[] };
  particoes_N_s0: Record<"treino" | "validacao" | "teste", Record<string, number>> & { sessoes: number };
  pretreino_N_s0: { n_pre: number; tempo_s: number; hist: [number, number, number][] };
  consistencia_c4: number;
  execucoes: { id_execucao: string; cenario: string; dobra: string; metodo: Metodo; fracao_rotulos: number; semente: number; taxa_perda: number; macro_f1: number }[];
  medias: Media[];
  testes: Teste[];
  h1: Teste[];
  h3: Queda[];
  queda_NA: { fracao: number; dobra: string; metodo: string; N: number; A: number; queda: number }[];
  custo: Record<"B1" | "B2" | "P", { inferencia_ms: number; inferencia_dp: number; treino_s: number; pretreino_s: number | null; n_parametros: number | null }>;
  f1_por_classe: ({ grupo: string; metodo: string } & Record<string, number>)[];
  confusao: Record<string, number[][]>;
  skype: { metodo: string; categoria: string; apps: string; n: number; acerto: number; destino: Record<string, number> }[];
  oclusao: Record<"B2" | "P", { queda: (number | null)[][]; contagem: number[][]; top3: Record<string, number[]> }>;
  exposicao: { semente: number; n_apps_teste: number; f1_aplicacao: number; acc_aplicacao: number; f1_categoria_direto: number; f1_categoria_via_app: number }[];
  vereditos: Record<"H1" | "H2" | "H3" | "H4", { sustentada: boolean; regra: string }>;
  amostra: FluxoAmostra[];
};

/** Tabelas finais da simulação original, separadas da reexecução usada nos uploads. */
export type ResultadoEstudo = Pick<Experimento,
  "hardware" | "medias" | "testes" | "h1" | "h3" | "custo" | "f1_por_classe" |
  "confusao" | "exposicao" | "vereditos"> & {
  n_execucoes: number;
  skype: { metodo: string; categoria: string; apps: string; n: number; "acerto_%": number }[];
};

export function carregarResultadosEstudo(): ResultadoEstudo | null {
  const caminho = join(process.cwd(), "data", "resultados_estudo.json");
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8")) as ResultadoEstudo;
}

export type MetodologiaEstudo = {
  fonte: string;
  periodo: [string, string];
  hardware: string;
  n_execucoes: number;
  execucoes: Record<"C1" | "C2" | "C3" | "C4" | "X1", number>;
  dados: {
    capturas_total: number; tamanho_gb: number; capturas_incluidas: number;
    videochamadas_excluidas: number; fluxos: number; principais: number; extras: number;
    completos_32: number; por_aplicacao: { categoria: string; aplicacao: string; arquivos: number; sessoes: number; fluxos: number }[];
    acima_1500: { acima_1500: number; pacotes_32: number };
    blocos_temporais: string[];
    teste5: Record<string, { duplicados: number; teste: number }>;
  };
  passos: { escolhidos: number; curva: { passos: number; media: number }[] };
  fracoes: { cenario: string; fracao: string; total: number }[];
  particoes_s0: { cenario: string; treino: number; validacao: number; teste: number }[];
};

export function carregarMetodologiaEstudo(): MetodologiaEstudo | null {
  const caminho = join(process.cwd(), "data", "metodologia_estudo.json");
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8")) as MetodologiaEstudo;
}

export function carregarExperimento(): Experimento | null {
  const caminho = join(process.cwd(), "data", "experimento.json");
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8")) as Experimento;
}

export type Biblioteca = { exemplos: { categoria_captura: string; aplicacao: string; pacotes: [number, number, number][] }[] };

/** Fluxos reais para o visor: a amostra de teste do experimento ou, sem ela, a biblioteca de exemplos. */
export function fluxosDemo(): { pacotes: [number, number, number][]; rotulo: string }[] {
  const exp = carregarExperimento();
  return exp?.amostra.length ? exp.amostra.map(f => ({ pacotes: f.pacotes, rotulo: f.rotulo })) : fluxosVitrine();
}

/** Fluxos reais do ISCX (biblioteca de exemplos) para o visor da página inicial. */
export function fluxosVitrine(): { pacotes: [number, number, number][]; rotulo: string }[] {
  for (const base of [process.cwd(), join(process.cwd(), "..")]) {
    const caminho = join(base, "exemplos", "biblioteca.json");
    if (existsSync(caminho)) {
      const b = JSON.parse(readFileSync(caminho, "utf8")) as Biblioteca;
      return b.exemplos.map(e => ({ pacotes: e.pacotes, rotulo: e.categoria_captura }));
    }
  }
  return [];
}
