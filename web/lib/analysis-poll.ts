import { ApiError, consultarAnalise, type StatusAnalise } from "./api";

export function watchAnalysis(
  id: string,
  onStatus: (status: StatusAnalise) => void,
  onError: (error: ApiError) => void,
  fetchStatus: typeof consultarAnalise = consultarAnalise,
  intervalMs = 2000,
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  async function poll() {
    try {
      const status = await fetchStatus(id, controller.signal);
      if (stopped) return;
      if (status.id !== id) throw new ApiError(0, "O identificador da resposta não corresponde à análise solicitada.");
      onStatus(status);
      if (status.estado !== "pronta" && status.estado !== "erro") timer = setTimeout(poll, intervalMs);
    } catch (failure) {
      if (stopped) return;
      onError(failure instanceof ApiError ? failure : new ApiError(0, "Não foi possível consultar a análise."));
    }
  }
  void poll();
  return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
}
