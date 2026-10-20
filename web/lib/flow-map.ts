import { listarFluxos, type FiltrosFluxos, type FluxoTabela } from "./api";
import { toRibbonFlows } from "./flow-adapters";

export const MAP_FLOW_LIMIT = 500;

/** At most five sequential pages. An aborted/failed page never becomes a partial map. */
export async function loadFlowMap(id: string,
  filters: Pick<FiltrosFluxos, "semente" | "modelo" | "classe" | "discordam">, signal: AbortSignal) {
  const flows: FluxoTabela[] = [];
  const numbers = new Set<number>();
  let total = 0;
  for (let page = 1; page <= MAP_FLOW_LIMIT / 100; page++) {
    signal.throwIfAborted();
    const result = await listarFluxos(id, { ...filters, pagina: page, tamanho: 100, ordem: "ini_s" }, signal);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(result.total) || result.total < 0
      || result.pagina !== page || result.tamanho !== 100
      || (page > 1 && result.total !== total) || !Array.isArray(result.itens)
      || result.itens.length !== Math.min(100, Math.max(0, result.total - flows.length)))
      throw new Error("Página incompleta ou inconsistente. Tente carregar o mapa novamente.");
    total = result.total;
    for (const flow of result.itens) {
      if (!flow || flow.analise_id !== id || flow.principal !== true || numbers.has(flow.n)
        || (flows.length > 0 && flow.ini_s < flows[flows.length - 1].ini_s))
        throw new Error("Página inconsistente. Tente carregar o mapa novamente.");
      numbers.add(flow.n);
      flows.push(flow);
    }
    if (flows.length >= Math.min(total, MAP_FLOW_LIMIT)) break;
  }
  return { ...toRibbonFlows(flows), loaded: flows.length, total, notLoaded: Math.max(0, total - flows.length) };
}
