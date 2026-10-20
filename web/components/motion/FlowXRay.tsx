"use client";

import { useId, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PacketLadder, animatePacketLadder } from "./PacketLadder";
import { MatrixGrid, animateMatrixGrid } from "./MatrixGrid";
import { ProbBars } from "./ProbBars";
import { PacketLossControls } from "./PacketLossControls";
import { DEFAULT_LOSS, selectPacketLoss, type LossSettings } from "./packet-loss";
import {
  CATEGORIES, CATEGORY_LABEL, CATEGORY_TOKEN, MODELS, SEEDS, STEP_SECONDS,
  number, winningCategory, type FlowXRayData, type Seed,
} from "./types";
import styles from "./xray.module.css";

gsap.registerPlugin(useGSAP);

export type FlowXRayProps = {
  data?: FlowXRayData | null;
  status?: "ready" | "loading" | "error";
  onRetry?: () => void;
  seed?: Seed;
  onSeedChange?: (seed: Seed) => void;
  lossSimulation?: LossSettings;
  onLossSimulationChange?: (settings: LossSettings) => void;
};

/** All values are supplied by the caller. This component performs no inference or fetch. */
export function FlowXRay({ data, status = "ready", onRetry, seed: activeSeed, onSeedChange,
  lossSimulation, onLossSimulationChange }: FlowXRayProps) {
  const [localSeed, setLocalSeed] = useState<Seed>(0);
  const [localLoss, setLocalLoss] = useState<LossSettings>(DEFAULT_LOSS);
  const seed = activeSeed ?? localSeed;
  let content;
  if (status === "loading") content = <XRayState title="Preparando o raio-X" message="Carregando os pacotes e as explicações da semente selecionada." busy />;
  else if (status === "error") content = <XRayState title="Não foi possível abrir o raio-X" message="Tente carregar os dados novamente." onRetry={onRetry} />;
  else if (!data || data.packets.length === 0) content = <XRayState title="Nenhum pacote para reproduzir" message="Escolha um fluxo principal com pacotes disponíveis." />;
  else if (!validData(data, seed)) content = <XRayState title="Explicação incompleta" message="A matriz e a explicação da semente selecionada precisam estar disponíveis para sincronizar a reprodução." onRetry={onRetry} />;
  else content = <ReadyFlowXRay data={data} seed={seed} loss={lossSimulation ?? localLoss}
    onLossChange={onLossSimulationChange ?? setLocalLoss} />;
  return <div className={styles.root}>
    <label className={styles.seedLabel}>Semente dos três modelos
      <select className={styles.select} value={seed} onChange={event => (onSeedChange ?? setLocalSeed)(Number(event.target.value) as Seed)}>
        {SEEDS.map(value => <option key={value} value={value}>Semente {value}</option>)}
      </select>
    </label>
    {content}
  </div>;
}

function XRayState({ title, message, busy, onRetry }: { title: string; message: string; busy?: boolean; onRetry?: () => void }) {
  return <section className={styles.state} aria-busy={busy} role="status">
    <h1>{title}</h1><p>{message}</p>
    {onRetry ? <Button onClick={onRetry}>Tentar novamente</Button> : null}
  </section>;
}

function validData(data: FlowXRayData, seed: Seed): boolean {
  const count = Math.min(32, data.packets.length);
  return data.packets.length <= 100 && data.packets.every((packet, i) =>
    Number.isFinite(packet.bytes) && packet.bytes > 0 &&
    (packet.direction === 1 || packet.direction === -1) &&
    Number.isFinite(packet.timeSeconds) && packet.timeSeconds >= 0 &&
    (i === 0 || packet.timeSeconds >= data.packets[i - 1].timeSeconds)) &&
    data.matrix.length === 32 && data.matrix.every((row, i) =>
      row.length === 4 && row.every(Number.isFinite) &&
      Math.abs(row[0]) <= 1 && row[1] >= 0 &&
      row[2] === (i < count ? 1 : 0) && row[3] === 0 &&
      (i < count || row.every(value => value === 0))) &&
    [seed].every(seed => {
      const explanation = data.seeds[seed];
      return explanation && explanation.prefixes.length === count &&
        explanation.prefixes.every(prefix => MODELS.every(model => {
          const values = prefix[model];
          return values?.length === 5 && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1) &&
            Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.001;
        })) && (["b2", "p"] as const).every(model =>
          explanation.occlusion[model]?.length === count && explanation.occlusion[model].every(Number.isFinite));
    });
}

function ReadyFlowXRay({ data, seed, loss, onLossChange }: {
  data: FlowXRayData; seed: Seed; loss: LossSettings; onLossChange: (settings: LossSettings) => void;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const ladder = useRef<HTMLDivElement>(null);
  const matrix = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const scrubber = useRef<HTMLInputElement>(null);
  const lastSeen = useRef(-1);
  const speedRef = useRef(1);
  const [seen, setSeen] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [speed, setSpeed] = useState("normal");
  const id = useId();
  const count = Math.min(32, data.packets.length);
  const selection = useMemo(() => selectPacketLoss(data.flowNumber, data.packets, loss.seed, loss.enabled ? loss.level : 0),
    [data.flowNumber, data.packets, loss.seed, loss.enabled, loss.level]);

  useGSAP(() => {
    if (!ladder.current || !matrix.current) return;
    const media = gsap.matchMedia();
    media.add({
      reduce: "(prefers-reduced-motion: reduce)",
      full: "(prefers-reduced-motion: no-preference)",
    }, context => {
      const reduce = Boolean(context.conditions?.reduce);
      setReducedMotion(reduce);
      setPlaying(false);
      lastSeen.current = -1;
      // Only this timeline owns GSAP animation. Motion owns the probability fills.
      const sequence = gsap.timeline({ paused: true });
      timeline.current = sequence;
      animatePacketLadder(sequence, ladder.current!);
      // During simulation the original matrix stays fully visible, never rebuilt.
      if (!loss.enabled) animateMatrixGrid(sequence, matrix.current!);
      // The ladder's last arrow ends before the packet boundary.
      sequence.to({}, { duration: count * STEP_SECONDS }, 0);
      sequence.timeScale(speedRef.current);
      const sync = () => {
        const current = Math.min(count, Math.floor(sequence.time() / STEP_SECONDS + 0.00001));
        if (lastSeen.current !== current) {
          lastSeen.current = current;
          setSeen(current);
        }
        // High-frequency progress stays out of React rendering.
        if (scrubber.current) scrubber.current.value = String(sequence.progress() * 100);
      };
      sequence.eventCallback("onUpdate", sync);
      sequence.eventCallback("onComplete", () => setPlaying(false));
      sequence.progress(reduce ? 1 : 0, false).pause();
      sync();
      return () => {
        sequence.eventCallback("onUpdate", null);
        sequence.eventCallback("onComplete", null);
        timeline.current = null;
      };
    }, scope);
    return () => media.revert();
  }, { scope, dependencies: [data.packets, data.matrix, count, selection, loss.enabled], revertOnUpdate: true });

  // Event handlers control an existing timeline; they create no unscoped tweens.
  function seek(progress: number) {
    if (reducedMotion || !timeline.current) return;
    timeline.current.pause().progress(progress, false);
    setPlaying(false);
  }
  function play() {
    const sequence = timeline.current;
    if (!sequence || reducedMotion) return;
    if (sequence.progress() === 1) sequence.progress(0, false);
    sequence.play();
    setPlaying(true);
  }
  function pause() {
    timeline.current?.pause();
    setPlaying(false);
  }
  function changeSpeed(value: string) {
    const rate = value === "slow" ? 320 / 650 : value === "fast" ? 320 / 120 : 1;
    speedRef.current = rate;
    timeline.current?.timeScale(rate);
    setSpeed(value);
  }
  const explanation = data.seeds[seed]!;
  const predictionCount = loss.enabled ? count : seen;
  const prediction = predictionCount > 0 ? explanation.prefixes[predictionCount - 1] : null;
  const finalPrediction = explanation.prefixes[count - 1];
  const winners = prediction ? MODELS.map(model => winningCategory(prediction[model])) : [];
  const agreement = prediction ? new Set(winners).size === 1 : null;
  const sampleBytes = data.packets.reduce((total, packet) => total + packet.bytes, 0);

  return (
    <div ref={scope} className={styles.root}>
      {data.source.kind === "illustrative" ? <aside className={styles.banner} role="note">
        <strong>Demonstração ilustrativa.</strong> Todos os valores desta tela são sintéticos, incluindo pacotes, matriz, probabilidades e oclusão.
        Estes valores não são resultados do experimento nem de uma captura enviada.
      </aside> : <aside className={styles.banner} role="note">
        <strong>Metadados da análise real.</strong> {data.notice}
      </aside>}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Raio-X do fluxo · reprodução de metadados</p>
          <h1 className={styles.title}>De pacotes a palpites</h1>
          <p className={styles.subtitle}>
            Fluxo <span className="font-mono">{number(data.flowNumber)}</span> · {data.protocol} · {number(data.packets.length)} pacotes guardados
            {" "}· {number(sampleBytes)} bytes nesta amostra. Observe a mesma entrada pelos três modelos.
          </p>
        </div>
      </header>
      <PacketLossControls settings={loss} selection={selection} onChange={onLossChange} />
      <Card title="Reproduzir os pacotes já lidos" action={<span className="font-mono text-xs text-text-muted">{seen}/{count}</span>}>
        <div className={styles.controls}>
          <Button onClick={play} disabled={reducedMotion || playing}>Reproduzir</Button>
          <Button variant="secondary" onClick={pause} disabled={reducedMotion || !playing}>Pausar</Button>
          <Button variant="ghost" onClick={() => seek(0)} disabled={reducedMotion}>Reiniciar</Button>
          <label className={styles.seedLabel} htmlFor={`${id}-speed`}>Velocidade
            <select id={`${id}-speed`} className={styles.select} value={speed} disabled={reducedMotion} onChange={event => changeSpeed(event.target.value)}>
              <option value="slow">Lenta · 650 ms</option><option value="normal">Normal · 320 ms</option><option value="fast">Rápida · 120 ms</option>
            </select>
          </label>
          <div className={styles.scrubber}>
            <label className={styles.scrubberLabel} htmlFor={`${id}-progress`}>
              <span>Pacotes vistos</span><span className="font-mono">{seen} de {count}</span>
            </label>
            <input ref={scrubber} id={`${id}-progress`} className={styles.range} type="range" min={0} max={100} step={0.1}
              defaultValue={0} disabled={reducedMotion} aria-valuetext={`${seen} de ${count} pacotes`}
              onChange={event => seek(Number(event.target.value) / 100)} />
          </div>
        </div>
        <p className={styles.caption} role="status">
          {reducedMotion
            ? "Movimento reduzido: todos os pacotes e o resultado final estão visíveis, sem animação."
            : playing ? "Reproduzindo. O ritmo é didático; os tempos observados estão na tabela."
              : seen === count ? "Reprodução concluída. Reinicie ou escolha outro prefixo para explorar."
                : "Reprodução pausada. Use Reproduzir, o controle de progresso ou um prefixo abaixo."}
        </p>
      </Card>
      <div className={styles.workspace}>
        <Card title={loss.enabled ? "Perda visual e entrada original dos modelos" : "O que entra nos modelos"}>
          <div className={styles.observation}>
            <section aria-label="Pacotes observados">
              <h3 className={styles.columnTitle}><span>01</span>Pacotes com carga</h3>
              <PacketLadder rootRef={ladder} packets={data.packets} activePacket={seen}
                lost={loss.enabled ? selection.lost : undefined} />
              <div className={styles.legend}><span className={styles.up}>→ Saída</span><span className={styles.down}>← Retorno</span></div>
              {loss.enabled ? <p className={styles.caption}>× Perdido na simulação · seta interrompida. Retidos mantêm a direção original.</p> : null}
            </section>
            <section aria-label="Representação matricial">
              <h3 className={styles.columnTitle}><span>02</span>Matriz 32 × 4{loss.enabled ? " · entrada original" : ""}</h3>
              <MatrixGrid rootRef={matrix} rows={data.matrix} activePacket={loss.enabled ? 0 : seen} />
            </section>
          </div>
          <details className={styles.explanation}>
            <summary>Como ler os quatro canais</summary>
            <dl>
              <dt>Tam. ±</dt><dd>Tamanho ÷ 1.500, com sinal da direção, limitado ao intervalo de −1 a 1.</dd>
              <dt>Δt</dt><dd>log(1 + intervalo em ms). O primeiro pacote tem intervalo 0.</dd>
              <dt>Pres.</dt><dd>1 para pacote presente; 0 para preenchimento.</dd>
              <dt>Másc.</dt><dd>0 na classificação. O canal de máscara pertence ao pré-treino.</dd>
            </dl>
            <p className={styles.caption}>A matriz exibida precede a padronização com estatísticas do treino. B1 deriva 11 estatísticas; B2 e P usam a matriz padronizada.</p>
          </details>
        </Card>
        <div className={styles.predictions}>
          <Card title={`03 · Palpites${loss.enabled ? " da entrada original" : ""} · semente ${seed}`}>
            <p className={`${styles.subtitle} mb-5`}>Prefixo de {predictionCount} pacote{predictionCount === 1 ? "" : "s"}.
              {loss.enabled ? " Entrada original completa, sem reclassificação da perda." : ""} Probabilidades não são confiança calibrada.</p>
            {MODELS.map(model => <ProbBars key={model} model={model} probabilities={prediction?.[model] ?? null} animate={!loss.enabled && playing && !reducedMotion} />)}
          </Card>
          <Card title="Leitura do resultado">
            <div className={styles.insight}>
              {agreement === null ? <p>Reproduza ou selecione um prefixo para comparar os três palpites.</p>
                : <p>Na semente <strong>{seed}</strong>, os três modelos {agreement ? "concordam" : "discordam"} após <strong>{predictionCount} pacotes</strong>{loss.enabled ? " da entrada original" : ""}.
                  {" "}Concordância entre modelos não mede acerto.</p>}
              <p>A escolha inicial da semente 0 é uma convenção de navegação. Trocar a semente atualiza os três modelos juntos.</p>
              {data.finalStability ? <p>Estabilidade do palpite final, em relação à semente ativa: {MODELS.map(model =>
                `${model.toUpperCase()} ${data.finalStability![model]}/5`).join(" · ")}.
                Usa os palpites armazenados para a entrada completa de até 32 pacotes, não o prefixo selecionado. Estabilidade não é acurácia.</p>
                : data.source.kind !== "illustrative" ? <p>Estabilidade final indisponível. As explicações por prefixo são carregadas apenas para a semente selecionada.</p> : null}
              {prediction && data.source.kind === "illustrative" && SEEDS.every(value => data.seeds[value]) ? <p>Estabilidade neste prefixo, em relação à semente ativa: {MODELS.map(model => {
                const winner = winningCategory(prediction[model]);
                const same = SEEDS.filter(value => winningCategory(data.seeds[value]!.prefixes[predictionCount - 1][model]) === winner).length;
                return `${model.toUpperCase()} ${same}/5`;
              }).join(" · ")}. Estabilidade também não é acurácia.</p> : null}
              {data.source.kind === "example" ? <p>Referência herdada da captura: <strong>{CATEGORY_LABEL[data.source.referenceLabel]}</strong>.
                Não é uma verificação manual deste fluxo.</p> : <p>Sem rótulo de referência para medir acerto neste fluxo.</p>}
            </div>
          </Card>
        </div>
      </div>
      <Card title={loss.enabled ? "Palpite depois de cada pacote · entrada original" : "Palpite depois de cada pacote"}>
        <p className={styles.subtitle}>Exploração por prefixos. O estudo não avaliou quantos pacotes seriam necessários para decidir.
          {loss.enabled ? " Durante a simulação, esta faixa mostra apenas os prefixos originais; as barras acima mantêm a entrada original completa."
            : " Selecione uma posição para pausar a reprodução naquele prefixo."}</p>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Palpites por prefixo, com rolagem horizontal">
          <table className={styles.prefixTable}>
            <caption className="sr-only">Categorias previstas por modelo e prefixo na semente {seed}</caption>
            <thead><tr><th scope="col">Modelo</th>{explanation.prefixes.map((_, i) => <th key={i} scope="col">{i + 1}</th>)}</tr></thead>
            <tbody>{MODELS.map(model => <tr key={model}>
              <th scope="row">{model.toUpperCase()}</th>
              {explanation.prefixes.map((prefix, i) => {
                const category = winningCategory(prefix[model]);
                return <td key={i}><button className={styles.prefixButton} type="button" aria-pressed={predictionCount === i + 1}
                  aria-label={`${model.toUpperCase()}, ${i + 1} pacotes: ${CATEGORY_LABEL[category]}`}
                  title={`${i + 1} pacotes · ${CATEGORY_LABEL[category]}`} data-future={i >= predictionCount}
                  disabled={reducedMotion || loss.enabled} onClick={() => seek((i + 1) / count)}>
                  <span className={styles.prefixDot} style={{ background: CATEGORY_TOKEN[category] }} aria-hidden="true" />
                </button></td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        <div className={styles.legend}>{CATEGORIES.map(category => <span key={category}>
          <span className={styles.swatch} style={{ background: CATEGORY_TOKEN[category] }} aria-hidden="true" />{CATEGORY_LABEL[category]}
        </span>)}</div>
      </Card>
      <Card title={loss.enabled ? "Oclusão · entrada original, sem simulação" : "Oclusão · o que muda ao zerar um pacote"}>
        <p className={styles.subtitle}>Exploração de sensibilidade de B2 e P na entrada de {count} pacotes (até os primeiros 32 do fluxo).
          Diferença em pontos percentuais (pp) na probabilidade da classe originalmente prevista.
          Valor positivo: a probabilidade caiu ao zerar a linha; negativo: aumentou. Não demonstra causalidade.</p>
        <div className={styles.occlusion}>
          {(["b2", "p"] as const).map(model => <section key={model} aria-label={`Oclusão de ${model.toUpperCase()}`}>
            <h3 className={`${styles.columnTitle} mt-5`} style={{ color: `var(--${model})` }}>
              {model.toUpperCase()} · {CATEGORY_LABEL[explanation.occlusionClasses?.[model] ?? winningCategory(finalPrediction[model])]}
            </h3>
            <ol className={styles.occlusionList}>{explanation.occlusion[model].map((value, i) => <li key={i}>
              <span>Pacote {i + 1}</span>{value > 0 ? "+" : ""}{number(value, 1)} pp
            </li>)}</ol>
          </section>)}
        </div>
        <p className={styles.caption}>Oclusão apenas de B2/P. A visualização por fluxo é uma extensão didática; o estudo registrou o efeito agregado em uma semente.</p>
      </Card>
      <Card title="Pacotes da amostra guardada" action={<span className="text-xs text-text-muted">Até 100 · primeiros 32 na matriz</span>}>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Tabela de pacotes, com rolagem horizontal">
          <table className={styles.packetTable}>
            <caption className="sr-only">Metadados dos pacotes, disponíveis mesmo com a reprodução pausada</caption>
            <thead><tr>{["Pacote", "Tempo relativo (s)", "Direção", "Bytes", "Δt (ms)", "Entrada original",
              ...(loss.enabled ? ["Simulação local"] : [])].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{data.packets.map((packet, i) => <tr key={i} data-active={seen === i + 1}>
              <td>{i + 1}</td><td>{number(packet.timeSeconds, 3)}</td>
              <td className={packet.direction === 1 ? styles.up : styles.down}>{packet.direction === 1 ? "→ Saída" : "← Retorno"}</td>
              <td>{number(packet.bytes)}</td><td>{number(i === 0 ? 0 : (packet.timeSeconds - data.packets[i - 1].timeSeconds) * 1000, 1)}</td>
              <td>{i < 32 ? `Linha ${i + 1}` : "Fora do corte"}</td>
              {loss.enabled ? <td data-loss={selection.lost[i]}><span aria-hidden="true">{selection.lost[i] ? "× " : "→ "}</span>
                {selection.lost[i] ? "Perdido (simulação)" : "Retido (simulação)"}</td> : null}
            </tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
