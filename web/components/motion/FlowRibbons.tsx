"use client";

import { useId, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CATEGORY_LABEL, CATEGORY_TOKEN, MODELS, number, type Model } from "./types";
import { ribbonDisagrees, ribbonExtent, ribbonGeometry, ribbonPage, type RibbonFlow } from "./ribbon-data";
import styles from "./shared.module.css";

gsap.registerPlugin(useGSAP);

export type FlowRibbonsProps = {
  flows: readonly RibbonFlow[];
  model: Model;
  seed: number;
  cutoffSeconds?: number;
  demonstration?: boolean;
};

/** Only anonymous temporal observations; callers supply predictions for one seed. */
export function FlowRibbons({ flows, model, seed, cutoffSeconds = Infinity, demonstration = false }: FlowRibbonsProps) {
  const scope = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  const result = ribbonPage(flows, cutoffSeconds, page);
  const extent = ribbonExtent(flows);
  const maxBytes = Math.max(0, ...flows.map(flow => flow.sampleBytes));
  const active = result.flows.find(flow => flow.n === selected) ?? result.flows[0];
  const geometryKey = result.flows.map(flow => `${flow.n}:${flow.startSeconds}:${flow.durationSeconds}`).join("|");

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const paths = scope.current?.querySelectorAll<SVGPathElement>("[data-ribbon-path]");
      if (!paths?.length || !scope.current) return;
      const sequence = gsap.timeline({ paused: true });
      paths.forEach((path, i) => {
        const initialPath = path.dataset.initial;
        const finalPath = path.dataset.final;
        if (!initialPath || !finalPath) return;
        sequence.fromTo(path, { attr: { d: initialPath } },
          { attr: { d: finalPath, duration: 0.8, ease: "power2.inOut" } }, i * 0.06);
      });
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { sequence.play(); observer.disconnect(); }
      });
      observer.observe(scope.current);
      return () => observer.disconnect();
    }, scope);
    // In reduced motion the complete server-rendered paths stay visible.
    return () => media.revert();
  }, { scope, dependencies: [geometryKey, extent], revertOnUpdate: true });

  return <div ref={scope} className={styles.ribbons}>
    {demonstration && <p className={styles.notice} role="note">Demonstração: tempos, bytes e palpites sintéticos. Nenhuma captura foi analisada.</p>}
    <p className={styles.caption}>Semente {seed} · cor: categoria prevista por {model.toUpperCase()}.
      Comprimento: duração observada. Espessura: bytes da amostra guardada, até 100 pacotes por fluxo.
      Contorno âmbar tracejado: discordância entre B1/B2/P na mesma semente.</p>
    <p className={styles.caption}>Padrões temporais anônimos, sem geografia, hosts, IPs, portas ou topologia inferida.
      A duração vai do primeiro ao último pacote com carga observado e pode incluir pacotes além dos 100 guardados.
      Os bytes descrevem apenas a amostra guardada.</p>
    {result.flows.length === 0 ? <p role="status">Nenhum fluxo iniciado neste recorte. Avance o cursor ou amplie os filtros.</p> : <>
      <div className={styles.axis} aria-hidden="true"><span>Fluxo</span><div><span>0 s</span><span>{number(extent / 2, 1)} s</span><span>{number(extent, 1)} s</span></div></div>
      <ol className={styles.ribbonList} aria-label="Fitas temporais anônimas">
        {result.flows.map(flow => {
          const shape = ribbonGeometry(flow, extent, maxBytes);
          const category = flow.predictions[model].category;
          const discordant = ribbonDisagrees(flow);
          return <li key={flow.n}>
            <button type="button" className={styles.ribbonRow} aria-controls={`${id}-detail`}
              aria-pressed={active?.n === flow.n}
              aria-label={`Fluxo ${flow.n}, ${flow.protocol}, início ${number(flow.startSeconds, 1)} segundos, duração ${number(flow.durationSeconds, 1)} segundos, ${CATEGORY_LABEL[category]}, ${discordant ? "discordam" : "concordam"}`}
              onMouseEnter={() => setSelected(flow.n)} onFocus={() => setSelected(flow.n)} onClick={() => setSelected(flow.n)}>
              <span className={styles.ribbonName}>#{flow.n}<small>{flow.protocol}</small></span>
              <span className={styles.ribbonBody}>
                <svg viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M20,22 L980,22" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  {discordant && <path d={shape.path} fill="none" stroke="var(--warn)" strokeWidth={shape.thickness + 6}
                    strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
                  <path data-ribbon-path data-initial={shape.initialPath} data-final={shape.path} d={shape.path}
                    fill="none" stroke={CATEGORY_TOKEN[category]} strokeWidth={shape.thickness} vectorEffect="non-scaling-stroke" />
                  <path d={`M${shape.start},8 L${shape.start},36`} stroke={CATEGORY_TOKEN[category]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className={styles.ribbonSummary}>{CATEGORY_LABEL[category]} · {number(flow.startSeconds, 1)}–{number(flow.startSeconds + flow.durationSeconds, 1)} s
                  {discordant ? " · Discordam" : " · Concordam"}</span>
              </span>
            </button>
          </li>;
        })}
      </ol>
      <div className={styles.pagination}>
        <button className="ui-button ui-button--secondary" disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>Anterior</button>
        <span role="status">Página {result.page + 1}/{result.pages} · {result.total} fluxos no recorte</span>
        <button className="ui-button ui-button--secondary" disabled={result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)}>Próxima</button>
      </div>
      {active && <section id={`${id}-detail`} className={styles.detail} aria-label={`Detalhes do fluxo ${active.n}`}>
        <h3 className="m-0 text-sm">Fluxo #{active.n} · {active.protocol}</h3>
        <p className={styles.caption}>{active.packets} pacotes guardados · {number(active.sampleBytes)} bytes da amostra · início {number(active.startSeconds, 1)} s · duração observada {number(active.durationSeconds, 1)} s.</p>
        <ul className={styles.predictions}>{MODELS.map(name => <li key={name}>
          <strong style={{ color: `var(--${name})` }}>{name.toUpperCase()}</strong>
          {" "}{CATEGORY_LABEL[active.predictions[name].category]} · {number(active.predictions[name].probability * 100, 1)}%
        </li>)}</ul>
        <p className={styles.caption}>Probabilidades não calibradas. Concordância entre modelos não mede acerto.</p>
      </section>}
    </>}
  </div>;
}
