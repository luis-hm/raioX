export type EstadoAnalise = "recebida" | "extraindo" | "classificando" | "pronta" | "erro";
export type Modelo = "B1" | "B2" | "P";
export type Classe = "chat" | "email" | "transferencia" | "streaming" | "voip";
export const CLASSES: Classe[] = ["chat", "email", "transferencia", "streaming", "voip"];
export const MODELOS: Modelo[] = ["B1", "B2", "P"];
export const NOMES: Record<Classe, string> = { chat: "Chat", email: "E-mail", transferencia: "Transferência", streaming: "Streaming", voip: "VoIP" };

export type Palpite = { classe_prevista: string; probabilidades: Record<string, number> };
export type ConcordanciaPar = { iguais: number; diferentes: number };
export type ResumoSemente = {
  contagens: Record<string, Record<string, number>>;
  concordancia: Record<string, number>;
  concordancia_pares?: Record<"B1_B2" | "B1_P" | "B2_P", ConcordanciaPar>;
  serie_temporal: { segundo: number; bytes_observados: number }[];
};
export type StatusAnalise = {
  id: string; nome_exibicao: string | null; estado: EstadoAnalise; progresso: number; erro: string | null;
  n_pacotes_lidos: number; n_fluxos_principais: number; n_fluxos_extras: number;
  n_arquivos_zip: number | null;
  duracao_observada_s: number | null; motivo_parada: string | null;
  resumo_por_semente: Record<string, ResumoSemente>; origem: "upload" | "exemplo";
  versao_modelos: string | null; criada_em: string; expira_em: string;
};
export type FluxoTabela = {
  analise_id: string; n: number; proto: 6 | 17; ini_s: number; duracao_s: number | null; principal: boolean;
  n_pacotes_guardados: number; bytes_amostra_cliente: number; bytes_amostra_servidor: number;
  previsoes: Record<string, Palpite>; estabilidade: Record<string, number>; rotulo_referencia: number | null;
};
export type PaginaFluxos = { itens: FluxoTabela[]; total: number; pagina: number; tamanho: number };
export type FluxoDetalhe = FluxoTabela & { pacotes: [number, number, number][]; matriz_32x4: number[][]; previsoes_por_semente: Record<string, Record<Modelo, Palpite>> | null };
export type FiltrosFluxos = { pagina: number; tamanho: number; semente: number; classe?: Classe; modelo: Modelo; discordam: boolean; ordem: "-n_pacotes_guardados" | "n" | "ini_s" };
export type ExplicacaoFluxo = {
  semente: number; n_pacotes: number;
  prefixos: ({ n_pacotes: number } & Record<Modelo, Palpite>)[];
  classes_originais_oclusao: Record<"B2" | "P", Classe>;
  oclusao_pp: Record<"B2" | "P", number[]>;
  aviso: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "ApiError"; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, cache: "no-store" }); }
  catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiError(0, "Não foi possível conectar ao serviço. Confira a conexão e tente novamente.");
  }
  if (!response.ok) {
    let detail = "Não foi possível concluir a solicitação.";
    try { const body = await response.json(); if (typeof body.detail === "string") detail = body.detail; } catch { /* resposta sem JSON */ }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export function criarUpload(arquivo: File): Promise<{ id: string }> {
  const body = new FormData(); body.append("arquivo", arquivo);
  return request("/api/analises", { method: "POST", body });
}
export function criarExemplo(nome: Classe): Promise<{ id: string }> {
  return request(`/api/analises/exemplo/${encodeURIComponent(nome)}`, { method: "POST" });
}
export function consultarAnalise(id: string, signal?: AbortSignal): Promise<StatusAnalise> {
  return request(`/api/analises/${encodeURIComponent(id)}`, { signal });
}
export function listarFluxos(id: string, filtros: FiltrosFluxos, signal?: AbortSignal): Promise<PaginaFluxos> {
  const query = new URLSearchParams({ pagina: String(filtros.pagina), tamanho: String(filtros.tamanho),
    semente: String(filtros.semente), modelo: filtros.modelo.toLowerCase(),
    discordam: String(filtros.discordam), ordem: filtros.ordem });
  if (filtros.classe) query.set("classe", filtros.classe);
  return request(`/api/analises/${encodeURIComponent(id)}/fluxos?${query}`, { signal });
}
export function consultarFluxo(id: string, n: number, semente: number, signal?: AbortSignal): Promise<FluxoDetalhe> {
  return request(`/api/analises/${encodeURIComponent(id)}/fluxos/${n}?semente=${semente}`, { signal });
}
export function explicarFluxo(id: string, n: number, semente: number, signal?: AbortSignal): Promise<ExplicacaoFluxo> {
  return request(`/api/analises/${encodeURIComponent(id)}/fluxos/${n}/explicar?semente=${semente}`, { signal });
}
