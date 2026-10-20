"use client";

import { useEffect, useState } from "react";
import { FlowRibbons } from "@/components/motion/FlowRibbons";
import { TimelineScrubber } from "@/components/motion/TimelineScrubber";
import { ribbonExtent } from "@/components/motion/ribbon-data";
import type { Model } from "@/components/motion/types";
import { loadFlowMap, MAP_FLOW_LIMIT } from "@/lib/flow-map";
import type { Classe, Modelo } from "@/lib/api";

type Props = { id: string; seed: number; model: Modelo; category: Classe | "all"; disagreementsOnly: boolean };

export function LiveMap(props: Props) {
  return <MapContent key={`${props.id}:${props.seed}:${props.model}:${props.category}:${props.disagreementsOnly}`} {...props} />;
}

function MapContent({ id, seed, model, category, disagreementsOnly }: Props) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadFlowMap>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [cutoff, setCutoff] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setResult(null); setCutoff(null);
    void loadFlowMap(id, { semente: seed, modelo: model,
      classe: category === "all" ? undefined : category, discordam: disagreementsOnly }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível carregar o mapa."); });
    return () => controller.abort();
  }, [id, seed, model, category, disagreementsOnly, attempt]);
  if (error) return <div role="alert"><p>{error}</p><button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>;
  if (!result) return <p role="status">Carregando as páginas do mapa, até {MAP_FLOW_LIMIT} fluxos…</p>;
  const extent = ribbonExtent(result.ribbons);
  return <div className="space-y-4">
    <p role="status">{result.ribbons.length} fluxos exibíveis de {result.loaded} carregados neste recorte.
      {" "}{result.omittedDuration} omitidos por duração desconhecida.
      {" "}{result.notLoaded} ficaram fora do carregamento pelo limite de {MAP_FLOW_LIMIT} fluxos.
      {result.notLoaded > 0 && " São os primeiros por início observado; as omissões de duração contam apenas os carregados."}</p>
    {result.ribbons.length ? <>
      <TimelineScrubber value={cutoff ?? extent} max={extent} onChange={setCutoff} />
      <FlowRibbons flows={result.ribbons} model={model.toLowerCase() as Model} seed={seed} cutoffSeconds={cutoff ?? extent} />
    </> : <p role="status">{result.total === 0
      ? "Nenhum fluxo corresponde aos filtros."
      : "Nenhum dos fluxos carregados tem duração conhecida. A tabela continua disponível; não estimamos a duração."}</p>}
  </div>;
}
