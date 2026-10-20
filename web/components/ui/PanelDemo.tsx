"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CountUp } from "@/components/motion/CountUp";
import { ModelToggle } from "@/components/motion/ModelToggle";
import { FlowRibbons } from "@/components/motion/FlowRibbons";
import { TimelineScrubber } from "@/components/motion/TimelineScrubber";
import { demoRibbons } from "@/components/motion/ribbon-demo";
import { ribbonExtent } from "@/components/motion/ribbon-data";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { formatPercent } from "@/lib/format";
import {
  agreementPercent, categoryCounts, CLASS_NAMES, CLASSES, DEMO_FLOWS, filterFlows,
  MODEL_NAMES, MODELS, modelsAgree, SEEDS, seedStability,
  type DemoFlow, type FlowClass, type Model, type Seed,
} from "@/lib/panel-demo";

const classColor: Record<FlowClass, string> = {
  chat: "bg-cat-chat", email: "bg-cat-email", transf: "bg-cat-transf",
  stream: "bg-cat-stream", voip: "bg-cat-voip",
};
const fieldClass = "min-h-10 rounded-field border border-border-strong bg-surface-2 px-3 text-sm text-text";
const tabClass = "inline-flex min-h-10 items-center rounded-field px-4 text-sm font-semibold no-underline";

function StatCard({ label, value, digits = 0, suffix = "", context }: { label: string; value: number; digits?: number; suffix?: string; context: string }) {
  return <div className="ui-card flex min-h-[128px] flex-col justify-between gap-3">
    <span className="label-small text-text-muted">{label}</span>
    <strong className="font-mono text-xl leading-none"><CountUp value={value} digits={digits} suffix={suffix} /></strong>
    <span className="text-xs text-text-muted">{context}</span>
  </div>;
}

export function PanelDemo({ id, tab }: { id: string; tab: "geral" | "fluxos" | "mapa" }) {
  const [seed, setSeed] = useState<Seed>(0);
  const [model, setModel] = useState<Model>("b1");
  const [category, setCategory] = useState<FlowClass | "all">("all");
  const [disagreementsOnly, setDisagreementsOnly] = useState(false);
  const ribbons = useMemo(() => demoRibbons(seed), [seed]);
  const extent = ribbonExtent(ribbons);
  const [cutoff, setCutoff] = useState(extent);
  const baseHref = `/a/${encodeURIComponent(id)}`;
  const counts = categoryCounts(DEMO_FLOWS, model, seed);
  const agreement = agreementPercent(DEMO_FLOWS, seed);
  const packetCount = DEMO_FLOWS.reduce((total, flow) => total + flow.packets, 0);
  const filtered = filterFlows(DEMO_FLOWS, seed, model, category, disagreementsOnly);
  const stable = DEMO_FLOWS.filter((flow) => seedStability(flow, model, seed) === SEEDS.length).length;

  const columns: DataTableColumn<DemoFlow>[] = [
    { key: "n", header: "Fluxo", cell: (flow) => <span className="font-mono" data-numeric>#{flow.n}</span> },
    { key: "proto", header: "Protocolo", cell: (flow) => flow.proto === 6 ? "TCP" : "UDP" },
    { key: "packets", header: "Pacotes guardados", cell: (flow) => <span className="font-mono" data-numeric>{flow.packets}</span> },
    ...MODELS.map((name): DataTableColumn<DemoFlow> => ({
      key: name, header: name.toUpperCase(),
      cell: (flow) => <div className="flex min-w-[112px] flex-col items-start gap-1">
        <Chip tone={flow.bySeed[seed][name].classe}>{CLASS_NAMES[flow.bySeed[seed][name].classe]}</Chip>
        <span className="font-mono text-xs text-text-muted" data-numeric>{formatPercent(flow.bySeed[seed][name].probability * 100)}</span>
      </div>,
    })),
    { key: "stability", header: `Estabilidade ${model.toUpperCase()}`, cell: (flow) => <span className="font-mono" data-numeric>{seedStability(flow, model, seed)}/5 sementes</span> },
    { key: "agreement", header: "Concordância", cell: (flow) => <Chip tone={modelsAgree(flow, seed) ? "ok" : "warn"}>{modelsAgree(flow, seed) ? "Concordam" : "Discordam"}</Chip> },
  ];

  return <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="ui-card h-fit" aria-label="Contexto da análise">
      <p className="label-small mb-2 text-text-muted">Análise demonstrativa</p>
      <p className="mb-4 break-all font-mono text-sm" data-numeric>{id}</p>
      <Chip tone="ok">Demonstração</Chip>
      <dl className="mt-5 grid gap-4 border-t border-border pt-5 text-sm">
        <div><dt className="text-text-muted">Fluxos principais</dt><dd className="m-0 font-mono" data-numeric>{DEMO_FLOWS.length}</dd></div>
        <div><dt className="text-text-muted">Fluxos extras</dt><dd className="m-0 font-mono" data-numeric>0</dd></div>
        <div><dt className="text-text-muted">Origem</dt><dd className="m-0">Dados sintéticos da interface</dd></div>
      </dl>
      <Link className="ui-button ui-button--secondary mt-6 w-full" href="/">Nova análise</Link>
    </aside>

    <div className="min-w-0 space-y-4">
      <header className="ui-card">
        <p className="label-small mb-2 text-accent">Explorar os palpites</p>
        <h1 className="m-0 text-xl font-semibold">Painel da análise</h1>
        <p className="mb-0 mt-3 max-w-[72ch] text-sm text-text-muted">Demonstração visual: todos os números, fluxos, classes e probabilidades desta página são sintéticos. Nenhuma captura foi analisada aqui.</p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Abas do painel">
        {(["geral", "mapa", "fluxos"] as const).map((name) => <Link key={name}
          href={name === "geral" ? baseHref : `${baseHref}?aba=${name}`}
          aria-current={tab === name ? "page" : undefined}
          className={`${tabClass} ${tab === name ? "bg-accent text-bg" : "border border-border bg-surface text-text-muted hover:bg-surface-2"}`}>
          {name === "geral" ? "Visão geral" : name === "mapa" ? "Mapa de fluxos" : "Fluxos"}
        </Link>)}
      </nav>

      <Card title="Recorte da demonstração"><div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2 text-xs text-text-muted">Semente para B1, B2 e P
          <select className={fieldClass} value={seed} onChange={(event) => setSeed(Number(event.target.value) as Seed)}>
            {SEEDS.map((value) => <option key={value} value={value}>Semente {value}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-2 text-xs text-text-muted"><span>Modelo da distribuição, mapa e filtro</span>
          <ModelToggle value={model} onChange={setModel} label="Modelo da distribuição, mapa e filtro" />
        </div>
        <p className="m-0 max-w-[46ch] text-xs text-text-muted">Semente 0 é só a escolha inicial de navegação. As probabilidades exibidas não são calibradas.</p>
      </div></Card>

      {tab === "geral" && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores da demonstração">
          <StatCard label="Pacotes lidos" value={packetCount} context="Soma dos pacotes dos fluxos sintéticos" />
          <StatCard label="Fluxos principais" value={DEMO_FLOWS.length} context="8 fluxos classificados · 0 extras" />
          <StatCard label="Duração observada" value={extent} digits={1} suffix=" s" context="Intervalo sintético ilustrativo" />
          <StatCard label="Concordância entre modelos" value={agreement} suffix="%" context={`B1, B2 e P · semente ${seed}`} />
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Card title="Distribuição dos palpites" icon="◫">
            <p className="mt-0 text-xs text-text-muted">{MODEL_NAMES[model]} · semente {seed}. Categorias previstas nos 8 fluxos principais sintéticos.</p>
            <div className="grid gap-3">{CLASSES.map((name) => <div key={name} className="grid grid-cols-[112px_minmax(0,1fr)_32px] items-center gap-2 text-sm">
              <span>{CLASS_NAMES[name]}</span>
              <div className="h-2 overflow-hidden rounded-chip bg-surface-2" role="meter" aria-label={`${CLASS_NAMES[name]}: ${counts[name]} fluxos`} aria-valuemin={0} aria-valuemax={DEMO_FLOWS.length} aria-valuenow={counts[name]}>
                <div className={`h-full rounded-chip ${classColor[name]}`} style={{ width: `${counts[name] / DEMO_FLOWS.length * 100}%` }} />
              </div>
              <span className="font-mono text-right" data-numeric>{counts[name]}</span>
            </div>)}</div>
          </Card>
          <Card title="Estabilidade entre sementes" icon="◇">
            <p className="mt-0 text-sm text-text-muted">Em {stable} de {DEMO_FLOWS.length} fluxos sintéticos, {model.toUpperCase()} repete o palpite da semente {seed} nas cinco sementes.</p>
            <p className="text-sm text-text-muted">A coluna de estabilidade da tabela mostra quantas sementes repetem cada palpite. Isso é diferente da concordância entre B1, B2 e P na mesma semente.</p>
            <Link className="ui-button ui-button--secondary mt-2" href={`${baseHref}?aba=fluxos`}>Ver tabela de fluxos →</Link>
          </Card>
        </div>
        <Card title="Leitura do resultado" icon="◇" className="border-accent-2 bg-surface-2">
          <p className="m-0 text-sm">Na semente {seed}, os três modelos concordam em {formatPercent(agreement)} dos fluxos demonstrativos. Concordância entre palpites não mede acerto nem composição real de uma captura.</p>
        </Card>
        <Card title="Série temporal observada"><p className="m-0 text-sm text-text-muted">A série de bytes por segundo será exibida quando o painel consumir uma análise real. Os tempos ilustrativos do mapa são sintéticos e não constituem medições temporais.</p></Card>
      </>}

      {tab === "fluxos" && <>
        <Card title="Filtrar fluxos"><div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2 text-xs text-text-muted">Categoria prevista por {model.toUpperCase()}
            <select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value as FlowClass | "all")}>
              <option value="all">Todas</option>
              {CLASSES.map((name) => <option key={name} value={name}>{CLASS_NAMES[name]}</option>)}
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input className="h-4 w-4 accent-accent" type="checkbox" checked={disagreementsOnly} onChange={(event) => setDisagreementsOnly(event.target.checked)} />Só onde discordam</label>
          <Button variant="ghost" onClick={() => { setCategory("all"); setDisagreementsOnly(false); }}>Limpar filtros</Button>
        </div></Card>
        <Card title="Fluxos principais" action={<span className="font-mono text-xs text-text-muted" data-numeric>{filtered.length} de {DEMO_FLOWS.length}</span>}>
          <p className="mt-0 text-xs text-text-muted">Até 100 pacotes guardados por fluxo. As três probabilidades são saídas demonstrativas não calibradas; os rótulos são palpites, sem referência de acerto.</p>
          <DataTable caption="Fluxos principais demonstrativos" columns={columns} rows={filtered} rowKey={(flow) => flow.n}
            emptyMessage="Nenhum fluxo sintético corresponde aos filtros. Limpe os filtros ou escolha outra semente/modelo."
            action={{ label: "Raio-X →", href: (flow) => `${baseHref}/fluxo/${flow.n}` }} />
        </Card>
      </>}

      {tab === "mapa" && <Card title="Mapa de fluxos">
        <TimelineScrubber value={cutoff} max={extent} markers={ribbons.map(flow => flow.startSeconds)} onChange={setCutoff} />
        <FlowRibbons flows={ribbons} model={model} seed={seed} cutoffSeconds={cutoff} demonstration />
        <Link className="ui-button ui-button--secondary mt-4" href={`${baseHref}?aba=fluxos`}>Explorar a tabela</Link>
      </Card>}
    </div>
  </div>;
}
