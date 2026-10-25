"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError, CLASSES, MODELOS, NOMES, consultarAnalise, consultarFluxo, criarExemplo,
  explicarFluxo, listarFluxos, type Classe, type ExplicacaoFluxo, type FluxoDetalhe,
  type FluxoTabela, type Modelo, type StatusAnalise,
} from "@/lib/api";
import { watchAnalysis } from "@/lib/analysis-poll";
import styles from "./example.module.css";

const nameOf = (value?: string) => value && NOMES[value as Classe] || "Indisponível";
const initialFilter = { pagina: 1, tamanho: 1, semente: 0, modelo: "P" as Modelo, discordam: false, ordem: "n" as const };

function ModelPicks({ flow, prefix }: { flow: FluxoTabela; prefix?: ExplicacaoFluxo["prefixos"][number] }) {
  const picks = MODELOS.map(model => ({ model, pick: prefix?.[model] || flow.previsoes[model] }));
  const consensus = picks.every(({ pick }) => pick?.classe_prevista === picks[0].pick?.classe_prevista);
  return <>
    <div className={styles.modelGrid} aria-label="Palpites dos três modelos">
      {picks.map(({ model, pick }) => <div key={model} className={styles.modelCard} data-model={model.toLowerCase()}>
        <span className={styles.modelName}>{model}</span>
        <strong>{nameOf(pick?.classe_prevista)}</strong>
        <small>{prefix ? "Palpite neste ponto da sequência" : typeof flow.estabilidade[model] === "number" ? `${flow.estabilidade[model]}/5 sementes repetem o palpite final` : "Estabilidade indisponível"}</small>
      </div>)}
    </div>
    <p className={styles.consensus}>{consensus
      ? `Os 3 modelos classificam ${prefix ? "este trecho" : "este fluxo"} como ${nameOf(picks[0].pick?.classe_prevista)}.`
      : `Os modelos discordam ${prefix ? "neste trecho" : "neste fluxo"}.`}</p>
  </>;
}

export function ExamplePanel({ analysis }: { analysis: StatusAnalise }) {
  const [flow, setFlow] = useState<FluxoDetalhe | null>(null);
  const [explanation, setExplanation] = useState<ExplicacaoFluxo | null>(null);
  const [error, setError] = useState("");
  const [explanationError, setExplanationError] = useState("");
  const [step, setStep] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFlow(null); setExplanation(null); setError(""); setExplanationError(""); setStep(null);
    void listarFluxos(analysis.id, initialFilter, controller.signal).then(async page => {
      const first = page.itens[0];
      if (!first) throw new Error("Este exemplo não contém um fluxo principal.");
      const detail = await consultarFluxo(analysis.id, first.n, 0, controller.signal);
      if (controller.signal.aborted) return;
      setFlow(detail);
      try {
        const result = await explicarFluxo(analysis.id, detail.n, 0, controller.signal);
        if (!controller.signal.aborted) setExplanation(result);
      } catch (failure) {
        if (!controller.signal.aborted) setExplanationError(failure instanceof Error ? failure.message : "Não foi possível carregar a evolução dos palpites.");
      }
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível carregar este exemplo.");
    });
    return () => controller.abort();
  }, [analysis.id, attempt]);

  const reference = flow?.rotulo_referencia == null ? "Indisponível" : nameOf(CLASSES[flow.rotulo_referencia]);
  const prefixCount = Math.min(32, flow?.pacotes.length || 0);
  const selected = step !== null && explanation?.prefixos[step - 1]?.n_pacotes === step ? explanation.prefixos[step - 1] : undefined;
  const packetCount = flow?.pacotes.length || 0;

  return <div className={styles.page}>
    <Link className={styles.back} href="/enviar">← Escolher outro exemplo</Link>
    <header className={styles.hero}>
      <div>
        <p className="eyebrow">Um fluxo, três pontos de vista</p>
        <h1>{flow ? `Exemplo de ${reference}` : analysis.nome_exibicao || "Exemplo ISCX"}</h1>
        <p>Veja os palpites lado a lado e acompanhe como mudam conforme chegam os pacotes.</p>
      </div>
      <Link className="ui-button ui-button--secondary" href="/exemplos">Comparar os 5 exemplos →</Link>
    </header>
    {error ? <section className="ui-card" role="alert"><p>{error}</p><button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></section>
      : !flow ? <section className="ui-card" role="status">Carregando os dados deste fluxo…</section>
      : <>
        <section className={styles.result} aria-label="Resultado do exemplo">
          <div className={styles.reference}><span className="label-small">Referência da captura</span><strong>{reference}</strong><small>Rótulo herdado da captura ISCX; este fluxo não foi verificado manualmente.</small></div>
          <ModelPicks flow={flow} prefix={selected} />
          <p className={styles.limit}>Palpites dos modelos treinados na análise do ISCX; probabilidades não calibradas. Concordância e estabilidade não medem acerto.</p>
        </section>
        <section className={styles.timeline} aria-labelledby="packet-story-title">
          <div className={styles.sectionHead}><div><p className="eyebrow">O que muda no caminho</p><h2 id="packet-story-title">Pacote a pacote</h2></div>
            <span className="font-mono">{step === null ? `${prefixCount} pacotes` : `${step} / ${prefixCount}`}</span></div>
          <p>Avance na amostra inicial para comparar os palpites após cada pacote. O resultado acima começa pelo fluxo completo.</p>
          <div className={styles.packetTrack} role="img" aria-label={`Primeiros ${prefixCount} pacotes guardados; ${step ?? prefixCount} considerados`}>
            {flow.pacotes.slice(0, prefixCount).map(([bytes, direction], index) => <span key={index} className={styles.packet}
              data-direction={direction} data-active={step === null || index < step} style={{ height: `${Math.max(12, Math.min(100, Math.sqrt(bytes) * 5))}%` }} />)}
          </div>
          <div className={styles.trackLabels}><span>Cliente → servidor</span><span>Servidor → cliente</span></div>
          {explanation ? <label className={styles.sliderLabel}>Pacotes considerados
            <input type="range" min="1" max={prefixCount} value={step ?? prefixCount} onChange={event => setStep(Number(event.target.value))} aria-valuetext={`${step ?? prefixCount} pacotes`} />
          </label> : <p role={explanationError ? "alert" : "status"}>{explanationError || "Carregando evolução dos palpites…"}</p>}
          {step !== null && explanation && <button type="button" className="ui-button ui-button--secondary" onClick={() => setStep(null)}>Voltar ao fluxo completo</button>}
          <p className={styles.caption}>{packetCount > 32 ? `A evolução usa os primeiros 32 de ${packetCount} pacotes guardados.` : `Este fluxo tem ${packetCount} pacotes guardados.`} Prefixos são exploratórios; não representam uma nova análise.</p>
        </section>
        <details className={styles.details}><summary>Metadados e detalhes técnicos</summary><div className={styles.detailBody}>
          <p>{flow.proto === 6 ? "TCP" : "UDP"} · {packetCount} pacotes guardados · duração {flow.duracao_s == null ? "desconhecida" : `${flow.duracao_s.toLocaleString("pt-BR")} s`}.</p>
          <p>Versão dos modelos: {analysis.versao_modelos || "indisponível"}. Análise: <span className="font-mono">{analysis.id}</span>.</p>
          <Link className="ui-button ui-button--secondary" href={`/a/${encodeURIComponent(analysis.id)}/fluxo/${flow.n}`}>Abrir matriz, oclusão e tabela de pacotes →</Link>
        </div></details>
      </>}
  </div>;
}

type ComparisonRow = { status: string; id?: string; flow?: FluxoTabela; error?: string };
const cacheKey = (name: Classe) => `raiox:example:${name}`;
const pendingExamples = new Map<Classe, Promise<string>>();

async function ensureExample(name: Classe): Promise<string> {
  const cached = window.sessionStorage.getItem(cacheKey(name));
  if (cached && /^[A-Za-z0-9_-]{12}$/.test(cached)) {
    try { await consultarAnalise(cached); return cached; }
    catch (failure) { if (!(failure instanceof ApiError) || failure.status !== 404) throw failure; }
  }
  const pending = pendingExamples.get(name);
  if (pending) return pending;
  const created = criarExemplo(name).then(result => {
    if (!/^[A-Za-z0-9_-]{12}$/.test(result.id)) throw new Error("O serviço devolveu um identificador inválido.");
    window.sessionStorage.setItem(cacheKey(name), result.id);
    return result.id;
  }).finally(() => pendingExamples.delete(name));
  pendingExamples.set(name, created);
  return created;
}

export function ExampleComparison() {
  const [rows, setRows] = useState<Partial<Record<Classe, ComparisonRow>>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const cancellations: (() => void)[] = [];
    const update = (name: Classe, row: ComparisonRow) => { if (active) setRows(current => ({ ...current, [name]: row })); };
    for (const name of CLASSES) {
      void (async () => {
        try {
          update(name, { status: "Consultando" });
          const id = await ensureExample(name);
          if (!active) return;
          const analysisId = id;
          update(name, { status: "Processando", id: analysisId });
          const stop = watchAnalysis(analysisId, status => {
            if (status.estado === "erro") { update(name, { status: "Erro", id: analysisId, error: status.erro || "A análise não terminou." }); return; }
            if (status.estado !== "pronta") { update(name, { status: "Processando", id: analysisId }); return; }
            stop();
            void listarFluxos(analysisId, initialFilter).then(page => {
              update(name, { status: "Pronto", id: analysisId, flow: page.itens[0], error: page.itens[0] ? undefined : "Nenhum fluxo principal encontrado." });
            }).catch(failure => update(name, { status: "Erro", id: analysisId, error: failure instanceof Error ? failure.message : "Falha ao buscar o fluxo." }));
          }, error => update(name, { status: "Erro", id: analysisId, error: error.message }));
          cancellations.push(stop);
        } catch (failure) {
          update(name, { status: "Erro", error: failure instanceof Error ? failure.message : "Não foi possível abrir o exemplo." });
        }
      })();
    }
    return () => { active = false; cancellations.forEach(stop => stop()); };
  }, [attempt]);

  return <div className={styles.page}>
    <Link className={styles.back} href="/">← Voltar ao início</Link>
    <header className={`${styles.hero} ${styles.comparisonHero}`}><div><p className="label-small text-accent">Biblioteca ISCX</p><h1>Cinco casos, os mesmos três modelos.</h1>
      <p>Compare onde os palpites coincidem ou divergem. Cada linha é um único fluxo, não uma medição de acurácia.</p></div></header>
    <section className={styles.comparison} aria-label="Comparação dos cinco exemplos">
      <div className={styles.comparisonHead}><span>Exemplo / referência herdada</span>{MODELOS.map(model => <span key={model}>{model}</span>)}<span>Próximo passo</span></div>
      {CLASSES.map(name => { const row = rows[name]; const picks = row?.flow?.previsoes;
        return <div className={styles.comparisonRow} key={name}>
          <div className={styles.caseName}><strong>{NOMES[name]}</strong><small>1 fluxo · referência da captura</small></div>
          {MODELOS.map(model => <div key={model} className={styles.cell} data-model={model.toLowerCase()}>
            <span className={styles.mobileLabel}>{model}</span><strong>{picks?.[model] ? nameOf(picks[model].classe_prevista) : "—"}</strong>
            {picks?.[model] && <small>{row?.flow?.estabilidade[model] ?? "—"}/5 sementes</small>}
          </div>)}
          <div className={styles.caseAction}>{row?.flow && row.id ? <Link href={`/a/${encodeURIComponent(row.id)}`}>Explorar caso →</Link>
            : row?.error ? <button type="button" onClick={() => { window.sessionStorage.removeItem(cacheKey(name)); setAttempt(value => value + 1); }}>Tentar novamente</button>
            : <span role="status">{row?.status || "Aguardando"}…</span>}</div>
          {row?.error && <p className={styles.rowError} role="alert">{row.error}</p>}
        </div>;
      })}
    </section>
    <p className={styles.caption}>Os exemplos usam apenas a biblioteca leve do projeto. Os rótulos são herdados das capturas ISCX e não foram verificados manualmente fluxo a fluxo. Palpites dos modelos treinados na análise do ISCX não equivalem a acertos.</p>
  </div>;
}
