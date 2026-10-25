"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, CLASSES, MODELOS, NOMES, listarFluxos, type Classe, type FluxoTabela, type Modelo, type PaginaFluxos, type StatusAnalise } from "@/lib/api";
import { Card } from "./Card";
import { DataTable, type DataTableColumn } from "./DataTable";
import { LiveMap } from "./LiveMap";
import { COR as colors, FlowOverview, MODELO_NOME } from "./FlowOverview";
import { downloadVisibleFlowsCsv } from "@/lib/flow-export";

const fieldClass = "min-h-10 rounded-field border border-border-strong bg-surface-2 px-3 text-sm text-text";
const formatNumber = (value: number) => value.toLocaleString("pt-BR");
const formatPercent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const classCell = (value?: string) => value && value in colors
  ? <span className="inline-flex items-center gap-2"><i className="h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ backgroundColor: colors[value as Classe] }} />{NOMES[value as Classe]}</span> : value || "—";

export function LivePanel({ analysis, tab }: { analysis: StatusAnalise; tab: "geral" | "fluxos" | "mapa" }) {
  const [seed, setSeed] = useState(0);
  const [model, setModel] = useState<Modelo>("P");
  const [category, setCategory] = useState<Classe | "all">("all");
  const [disagreementsOnly, setDisagreementsOnly] = useState((analysis.resumo_por_semente["0"]?.concordancia?.discordam ?? 0) > 0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grade" | "tabela">("grade");
  const [flows, setFlows] = useState<PaginaFluxos | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const summary = analysis.resumo_por_semente[String(seed)];
  const total = analysis.n_fluxos_principais;
  const discord = summary?.concordancia?.discordam ?? 0;
  const agreement = total > 0 ? formatPercent(100 * (summary?.concordancia?.todos ?? 0) / total) : "—";
  const base = `/a/${encodeURIComponent(analysis.id)}`;
  const isZip = analysis.n_arquivos_zip !== null && analysis.n_arquivos_zip !== undefined;

  useEffect(() => { setPage(1); }, [seed, model, category, disagreementsOnly]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    void listarFluxos(analysis.id, { pagina: page, tamanho: 20, semente: seed, modelo: model,
      classe: category === "all" ? undefined : category, discordam: disagreementsOnly, ordem: "-n_pacotes_guardados" }, controller.signal)
      .then(result => { if (active) setFlows(result); })
      .catch(failure => { if (active) setError(failure instanceof ApiError ? failure : new ApiError(0, "Não foi possível carregar os fluxos.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [analysis.id, seed, model, category, disagreementsOnly, page, attempt]);
  useEffect(() => { if (tab !== "geral") document.getElementById(tab)?.scrollIntoView(); }, [tab]);

  const columns: DataTableColumn<FluxoTabela>[] = [
    { key: "n", header: "Fluxo", cell: flow => <span className="font-mono">#{flow.n}</span> },
    { key: "packets", header: "Pacotes", cell: flow => formatNumber(flow.n_pacotes_guardados) },
    ...MODELOS.map(name => ({ key: name, header: name, cell: (flow: FluxoTabela) => classCell(flow.previsoes[name]?.classe_prevista) })),
    { key: "stable", header: `Estabilidade ${model}`, cell: flow => typeof flow.estabilidade[model] === "number" ? `${flow.estabilidade[model]}/5` : "—" },
  ];

  return <div className="space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-5"><div className="grid gap-3">
      <p className="eyebrow">Análise · {isZip ? `${analysis.n_arquivos_zip} capturas no ZIP · resultado combinado` : "uma captura"}</p>
      <h1 className="display text-[clamp(32px,4.4vw,56px)]">{analysis.nome_exibicao || (isZip ? "Um painel para todo o lote." : "O que há nesta captura.")}</h1>
    </div><Link className="ui-button ui-button--secondary" href="/enviar">Nova análise</Link></header>

    <div className="border-l-[3px] border-teal-ink bg-surface-2 px-4 py-3 text-sm leading-relaxed text-text-muted" role="note">
      <strong className="text-text">Este painel mostra palpites para o seu {isZip ? "ZIP" : "arquivo"}.</strong>{" "}
      Como não sabemos a categoria verdadeira de cada fluxo, não há nota de acerto aqui. As cinco sementes são versões do treino; estabilidade 5/5 significa o mesmo palpite nas cinco, não certeza. Os gráficos de <Link className="font-semibold text-teal-ink underline underline-offset-2" href="/resultados">resultados do estudo</Link> usam capturas com categorias atribuídas e medem o desempenho dos modelos naquele teste.
    </div>

    <section className="grid border-t border-ink sm:grid-cols-3" aria-label="Resultado em números">
      <div className="grid gap-1 py-5 pr-5"><span className="eyebrow">Fluxos analisados</span><strong className="font-mono text-stat font-medium">{formatNumber(total)}</strong><span className="text-xs text-slate">com palpites dos 3 modelos</span></div>
      <div className="grid gap-1 border-line py-5 sm:border-l sm:px-5"><span className="eyebrow">Modelos discordam</span><strong className="font-mono text-stat font-medium text-warn">{formatNumber(discord)}</strong><span className="text-xs text-slate">palpites diferentes para o mesmo fluxo</span></div>
      <div className="grid gap-1 border-line py-5 sm:border-l sm:pl-5"><span className="eyebrow">Concordam nos três</span><strong className="font-mono text-stat font-medium">{agreement}</strong><span className="text-xs text-slate">concordância não é acerto</span></div>
    </section>
    {(analysis.n_fluxos_extras > 0 || analysis.motivo_parada === "teto_de_fluxos" || analysis.motivo_parada === "limite_de_pacotes") &&
      <p className="ui-card border-warn/40 text-sm text-warn" role="note">Resultado parcial: {formatNumber(analysis.n_fluxos_extras)} fluxos ficaram sem classificação{analysis.motivo_parada === "teto_de_fluxos" ? "; o limite de fluxos foi atingido" : analysis.motivo_parada === "limite_de_pacotes" ? "; a leitura atingiu o limite de pacotes" : ""}.</p>}

    <Card title="Como os modelos enxergam o tráfego">
      <p className="mb-4 text-sm text-text-muted">Cada linha é um modelo e cada cor, a classe que ele atribuiu aos fluxos. Quanto mais longo o trecho, mais fluxos receberam aquele palpite.</p>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-hidden="true">{CLASSES.map(name =>
        <span key={name} className="inline-flex items-center gap-2"><i className="h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ backgroundColor: colors[name] }} />{NOMES[name]}</span>)}</div>
      <div className="space-y-4" role="img" aria-label="Distribuição das classes previstas pelos três modelos">
        {MODELOS.map(name => <div key={name} className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center"><span className="grid"><strong className="font-mono text-sm">{name}</strong><span className="text-xs text-text-muted">{MODELO_NOME[name]}</span></span>
          <div className="flex h-8 overflow-hidden rounded-md bg-surface-2">{CLASSES.map(classKey => {
            const count = summary?.contagens?.[name]?.[classKey] ?? 0;
            return count > 0 && total > 0 ? <span key={classKey} title={`${NOMES[classKey]}: ${formatNumber(count)} fluxos (${formatPercent(100 * count / total)})`}
              style={{ width: `${100 * count / total}%`, backgroundColor: colors[classKey], borderRight: "2px solid var(--paper)" }} /> : null;
          })}</div></div>)}
      </div>
      <div className="ui-table-scroll mt-5"><table className="ui-table"><thead><tr><th>Modelo</th>{CLASSES.map(name => <th key={name}>
        <span className="inline-flex items-center gap-2"><span className="h-[10px] w-[10px] shrink-0 rounded-[2px]" style={{ backgroundColor: colors[name] }} />{NOMES[name]}</span></th>)}</tr></thead>
        <tbody>{MODELOS.map(name => <tr key={name}><td><span className="font-mono">{name}</span> <span className="text-xs text-text-muted">{MODELO_NOME[name]}</span></td>{CLASSES.map(classKey =>
          <td key={classKey} className="font-mono">{formatNumber(summary?.contagens?.[name]?.[classKey] ?? 0)}</td>)}</tr>)}</tbody></table></div>
      <p className="mt-4 text-xs text-text-muted">Os números contam fluxos por palpite. É o que cada modelo acha, não a classe real do tráfego: se as barras diferem muito, os modelos estão lendo a captura de jeitos diferentes.</p>
    </Card>

    <section id="fluxos" className="scroll-mt-8"><Card title={disagreementsOnly ? "Onde investigar primeiro" : "Fluxos da análise"} action={flows && !loading ? <span className="text-xs text-text-muted">{formatNumber(flows.total)} resultados</span> : undefined}>
      <p className="mb-4 text-sm text-text-muted">{disagreementsOnly
        ? "Fluxos em que pelo menos um dos três modelos deu um palpite diferente dos outros. São os casos ambíguos, que merecem um olhar humano."
        : "Todos os fluxos analisados, com o palpite de cada modelo."}</p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-xs text-text-muted">Visualização<div className="inline-flex" role="group" aria-label="Visualização">{([["grade", "Grade"], ["tabela", "Tabela"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}
            className={`${fieldClass} first:rounded-r-none last:-ml-[1px] last:rounded-l-none aria-pressed:bg-ink aria-pressed:text-paper`}>{label}</button>)}</div></div>
        <label className="inline-flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={disagreementsOnly} onChange={event => setDisagreementsOnly(event.target.checked)} />Só onde discordam</label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">Classe prevista por {model}<select className={fieldClass} value={category} onChange={event => setCategory(event.target.value as Classe | "all")}><option value="all">Todas</option>{CLASSES.map(name => <option key={name} value={name}>{NOMES[name]}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">Modelo do filtro<select className={fieldClass} value={model} onChange={event => setModel(event.target.value as Modelo)}>{MODELOS.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => { setCategory("all"); setDisagreementsOnly(false); }}>Ver todos</button>
      </div>
      {view === "grade" ? <FlowOverview id={analysis.id} seed={seed} model={model} category={category} disagreementsOnly={disagreementsOnly} />
        : loading ? <p role="status">Carregando fluxos…</p> : error ? <div role="alert"><p>{error.message}</p><button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>
        : flows ? <><DataTable caption="Palpites por fluxo" columns={columns} rows={flows.itens} rowKey={flow => flow.n}
            emptyMessage="Nenhum fluxo neste filtro. Use ‘Ver todos’ para explorar a captura." action={{ label: "Detalhes →", href: flow => `${base}/fluxo/${flow.n}` }} />
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className="ui-button ui-button--secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button>
            <span role="status" className="text-sm">Página {flows.pagina} de {Math.max(1, Math.ceil(flows.total / flows.tamanho))}</span>
            <button type="button" className="ui-button ui-button--secondary" disabled={page * flows.tamanho >= flows.total} onClick={() => setPage(value => value + 1)}>Próxima</button>
            <button type="button" className="ui-button ui-button--secondary" disabled={flows.itens.length === 0} onClick={() => downloadVisibleFlowsCsv(flows.itens)}>CSV desta página</button></div>
          <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-xs text-text-muted sm:grid-cols-2">
            <div><dt className="inline font-semibold text-text">Pacotes: </dt><dd className="inline">pacotes com carga útil guardados do fluxo (até 100).</dd></div>
            <div><dt className="inline font-semibold text-text">B1, B2 e P: </dt><dd className="inline">palpite de cada modelo: Random Forest, CNN e CNN com pré-treino.</dd></div>
            <div><dt className="inline font-semibold text-text">Estabilidade {model}: </dt><dd className="inline">em quantas das 5 sementes (treinos independentes) {model} deu o mesmo palpite. 5/5 é firme; 3/5 ou menos, incerto.</dd></div>
            <div><dt className="inline font-semibold text-text">Detalhes: </dt><dd className="inline">abre o Raio-X do fluxo, com os pacotes e a evolução dos palpites.</dd></div>
          </dl></> : null}
    </Card></section>

    <details className="ui-card"><summary className="cursor-pointer text-sm font-semibold">Método e detalhes da análise</summary><div className="mt-4 space-y-4 text-sm text-text-muted">
      <p>Palpites dos modelos treinados na análise do ISCX (cenário N, 100% dos rótulos). Probabilidades não calibradas; concordância não mede acurácia.</p>
      <label className="flex max-w-xs flex-col gap-1">Semente da análise<select className={fieldClass} value={seed} onChange={event => setSeed(Number(event.target.value))}>{[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>Semente {value}</option>)}</select></label>
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Pacotes lidos</dt><dd className="font-mono text-text">{formatNumber(analysis.n_pacotes_lidos)}</dd></div><div><dt>Fluxos extras sem classificação</dt><dd className="font-mono text-text">{formatNumber(analysis.n_fluxos_extras)}</dd></div><div><dt>Versão dos modelos</dt><dd>{analysis.versao_modelos || "Indisponível"}</dd></div><div><dt>ID da análise</dt><dd className="break-all font-mono">{analysis.id}</dd></div></dl>
      {analysis.motivo_parada === "teto_de_fluxos" && <p role="note">O limite de fluxos foi atingido; o lote pode conter fluxos que não foram classificados.</p>}
      {isZip && <p>Os arquivos do ZIP são combinados por fluxo, não por segundo; não há linha do tempo única para o lote.</p>}
      {summary?.concordancia_pares && <div><h2 className="mb-2 text-sm font-semibold text-text">Concordância par a par</h2><div className="flex flex-wrap gap-3">{([["B1_B2", "B1 × B2"], ["B1_P", "B1 × P"], ["B2_P", "B2 × P"]] as const).map(([key, label]) => {
        const pair = summary.concordancia_pares?.[key]; const n = (pair?.iguais ?? 0) + (pair?.diferentes ?? 0);
        return <span key={key}>{label}: {n ? formatPercent(100 * (pair?.iguais ?? 0) / n) : "—"}</span>;
      })}</div></div>}
    </div></details>
    {!isZip && <details id="mapa" className="ui-card scroll-mt-8"><summary className="cursor-pointer text-sm font-semibold">Mapa técnico dos fluxos</summary><div className="mt-4"><LiveMap id={analysis.id} seed={seed} model={model} category={category} disagreementsOnly={disagreementsOnly} /></div></details>}
  </div>;
}
