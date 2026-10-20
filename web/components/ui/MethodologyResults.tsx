"use client";

import { useState } from "react";
import type { Results } from "@/lib/results";
import { Card } from "./Card";

const groups = [
  { id: "C1", label: "C1 · cenário N, 100% dos rótulos" },
  { id: "C2", label: "C2 · cenário N, fração de rótulos" },
  { id: "C3", label: "C3 · aplicações não vistas A1/A2" },
  { id: "C4", label: "C4 · perda simulada de pacotes" },
] as const;
const pct = (value: number) => `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const decimals = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function MethodologyResults({ results }: { results: Results }) {
  const [group, setGroup] = useState<(typeof groups)[number]["id"]>("C1");
  const rows = results.means.filter(row => group === "C1" ? row.grupo === "N" && row.fracao === 1
    : group === "C2" ? row.grupo === "N" : group === "C3" ? row.grupo.startsWith("C3-") : row.grupo === "C4-N");
  const tests = results.tests.filter(row => group === "C1" ? row.grupo === "N" && row.fracao === 1
    : group === "C2" ? row.grupo === "N" : group === "C3" ? row.grupo.startsWith("C3-") : row.grupo === "C4-N");
  return <div className="space-y-4">
    <Card title="Resultados corrigidos do estudo">
      <p className="text-sm text-text-muted">{results.totalExecutions} execuções finais; cada média reúne cinco sementes. As barras mostram macro-F1 médio e o intervalo de confiança de 95% está escrito. Valores vêm dos CSVs versionados da Etapa 9, após a correção do método P.</p>
      <label className="flex max-w-md flex-col gap-2 text-sm">Recorte do experimento
        <select className="min-h-10 rounded-field border border-border-strong bg-surface-2 px-3" value={group} onChange={event => setGroup(event.target.value as typeof group)}>
          {groups.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      <div className="mt-5 grid gap-3">{rows.map((row, index) => <div key={`${row.grupo}-${row.fracao}-${row.perda}-${row.metodo}-${index}`} className="rounded-field border border-border p-3">
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{row.metodo} · {row.grupo} · {pct(row.fracao)} rótulos{group === "C4" ? ` · ${pct(row.perda)} perda` : ""}</strong><span>macro-F1 {decimals(row.media)}</span></div>
        <div className="h-2 rounded bg-surface-2" aria-hidden="true"><div className="h-full rounded bg-accent" style={{ width: `${Math.max(0, Math.min(100, row.media * 100))}%` }} /></div>
        <p className="mb-0 text-xs text-text-muted">Média {decimals(row.media)} · DP {decimals(row.dp)} · IC 95% [{decimals(row.icInf)}, {decimals(row.icSup)}] · n={row.n}</p>
      </div>)}</div>
    </Card>
    <Card title="Comparações pareadas e vereditos">
      <p className="text-sm text-text-muted">Diferença de macro-F1 entre métodos, nas mesmas cinco sementes. Valor-p ajustado pelo método de Holm. O veredito segue a tabela corrigida.</p>
      {tests.length ? <div className="ui-table-scroll" role="region" aria-label="Testes pareados da Etapa 9" tabIndex={0}><table className="ui-table"><thead><tr><th scope="col">Grupo</th><th scope="col">Rótulos</th><th scope="col">Perda</th><th scope="col">Comparação</th><th scope="col">Diferença</th><th scope="col">p Holm</th><th scope="col">Veredito</th></tr></thead>
        <tbody>{tests.map((row, index) => <tr key={index}><td>{row.grupo}</td><td>{pct(row.fracao)}</td><td>{pct(row.perda)}</td><td>{row.comparacao}</td><td>{decimals(row.diferenca)}</td><td>{decimals(row.pHolm)}</td><td>{row.veredito}</td></tr>)}</tbody></table></div>
        : <p>Não há teste pareado publicado para este recorte.</p>}
    </Card>
  </div>;
}
