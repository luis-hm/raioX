"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./graficos.module.css";

export const num = (v: number | null | undefined, casas = 3) =>
  v == null || Number.isNaN(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Dica = { x: number; y: number; conteudo: ReactNode } | null;

function DicaFlutuante({ dica }: { dica: Dica }) {
  if (!dica) return null;
  return <div className={s.dica} style={{ left: dica.x, top: dica.y }} role="tooltip">{dica.conteudo}</div>;
}

export type Serie = { id: string; rotulo: string; cor: string; pontos: { x: string; y: number; lo?: number; hi?: number; extra?: string }[] };

/** Linhas sobre um eixo x categórico (ex.: % de rótulos, taxa de perda), com intervalo opcional. */
export function Linhas({ series, xs, titulo, yRotulo, dominio, altura = 300 }: {
  series: Serie[]; xs: string[]; titulo: string; yRotulo: string; dominio?: [number, number]; altura?: number;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const m = { t: 16, r: 92, b: 36, l: 44 };
  const valores = series.flatMap(sr => sr.pontos.flatMap(p => [p.lo ?? p.y, p.hi ?? p.y]));
  const [y0, y1] = dominio ?? [Math.max(0, Math.floor(Math.min(...valores) * 10) / 10), Math.min(1, Math.ceil(Math.max(...valores) * 10) / 10)];
  const iw = w - m.l - m.r, ih = altura - m.t - m.b;
  const X = (i: number) => m.l + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw);
  const Y = (v: number) => m.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const passo = y1 - y0 > 0.35 ? 0.1 : 0.05;
  const ticks = Array.from({ length: Math.round((y1 - y0) / passo) + 1 }, (_, i) => y0 + i * passo);
  // Rótulos diretos no fim de cada linha, afastados para não colidir.
  const fins = series.map(sr => ({ id: sr.id, y: Y(sr.pontos[sr.pontos.length - 1].y) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 16) fins[i].y = fins[i - 1].y + 16;
  const fimY = Object.fromEntries(fins.map(f => [f.id, f.y]));

  return <figure className={s.fig}>
    <figcaption className={s.cap}><strong>{titulo}</strong>
      <span className={s.legenda}>{series.map(sr => <button key={sr.id} type="button" onMouseEnter={() => setFoco(sr.id)} onMouseLeave={() => setFoco(null)}
        onFocus={() => setFoco(sr.id)} onBlur={() => setFoco(null)}><i style={{ background: sr.cor }} />{sr.rotulo}</button>)}</span></figcaption>
    <div ref={ref} className={s.plot} onMouseLeave={() => setDica(null)}>
      <svg width={w} height={altura} role="img" aria-label={`${titulo}. ${yRotulo} por ${xs.join(", ")}.`}>
        {ticks.map(t => <g key={t}><line x1={m.l} x2={w - m.r} y1={Y(t)} y2={Y(t)} className={s.grade} />
          <text x={m.l - 8} y={Y(t)} className={s.eixoY}>{num(t, 2)}</text></g>)}
        {xs.map((x, i) => <text key={x} x={X(i)} y={altura - 12} className={s.eixoX}>{x}</text>)}
        {series.map(sr => {
          const ativo = !foco || foco === sr.id;
          // IC95% como barra de erro vertical, levemente deslocada por série para não se sobrepor.
          const dx = (series.indexOf(sr) - (series.length - 1) / 2) * 7;
          return <g key={sr.id} style={{ opacity: ativo ? 1 : 0.18, transition: "opacity 150ms" }}>
            {sr.pontos.map((p, i) => p.lo != null && p.hi != null && <g key={i} stroke={sr.cor} strokeWidth={1.5} opacity={0.55}>
              <line x1={X(i) + dx} x2={X(i) + dx} y1={Y(p.lo)} y2={Y(p.hi)} />
              <line x1={X(i) + dx - 3} x2={X(i) + dx + 3} y1={Y(p.lo)} y2={Y(p.lo)} />
              <line x1={X(i) + dx - 3} x2={X(i) + dx + 3} y1={Y(p.hi)} y2={Y(p.hi)} /></g>)}
            <path d={sr.pontos.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join("")} fill="none" stroke={sr.cor} strokeWidth={2} strokeLinejoin="round" />
            {sr.pontos.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.y)} r={4.5} fill={sr.cor} stroke="var(--paper)" strokeWidth={2} />)}
            <text x={w - m.r + 10} y={fimY[sr.id]} className={s.rotuloDireto}>{sr.rotulo}</text>
          </g>;
        })}
        {xs.map((x, i) => <rect key={x} x={X(i) - Math.max(18, iw / xs.length / 2)} y={m.t} width={Math.max(36, iw / xs.length)} height={ih} fill="transparent"
          onMouseMove={e => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            setDica({ x: X(i), y: e.clientY - r.top, conteudo: <><b>{x}</b>{series.map(sr => {
              const p = sr.pontos[i];
              return <span key={sr.id}><i style={{ background: sr.cor }} />{sr.rotulo}<em className="font-mono">{num(p.y)}{p.lo != null ? ` (${num(p.lo, 2)}–${num(p.hi, 2)})` : ""}</em></span>;
            })}</> });
          }} />)}
        {dica && <line x1={dica.x} x2={dica.x} y1={m.t} y2={m.t + ih} className={s.mira} />}
      </svg>
      <DicaFlutuante dica={dica} />
    </div>
  </figure>;
}

/** Mapa de calor de uma só matiz (claro → escuro). `valores[l][c]`; null = sem dado. */
export function Calor({ titulo, linhas, colunas, valores, max, formato = v => num(v, 2), rotuloValor, mostrarValores = true, nota }: {
  titulo: string; linhas: string[]; colunas: string[]; valores: (number | null)[][]; max?: number;
  formato?: (v: number) => string; rotuloValor: string; mostrarValores?: boolean; nota?: string;
}) {
  const [dica, setDica] = useState<Dica>(null);
  const todos = valores.flat().filter((v): v is number => v != null);
  const topo = max ?? Math.max(...todos, 1e-9);
  return <figure className={s.fig}>
    <figcaption className={s.cap}><strong>{titulo}</strong>
      <span className={s.escala}><span>0</span><i /><span>{formato(topo)}</span></span></figcaption>
    <div className={s.calorWrap} onMouseLeave={() => setDica(null)}>
      <table className={s.calor} aria-label={titulo}>
        <colgroup><col style={{ width: 128 }} />{colunas.map(c => <col key={c} />)}</colgroup>
        <thead><tr><th />{colunas.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={l}><th scope="row">{l}</th>{colunas.map((c, j) => {
          const v = valores[i][j];
          const pct = v == null ? 0 : Math.max(0, Math.min(1, v / topo)) * 100;
          return <td key={c} style={{ background: v == null ? "transparent" : `color-mix(in oklab, var(--teal-ink) ${pct}%, var(--paper-2))`, color: pct > 55 ? "var(--paper)" : "var(--ink)" }}
            onMouseMove={e => {
              const r = (e.currentTarget.closest("div") as HTMLDivElement).getBoundingClientRect();
              setDica({ x: e.clientX - r.left, y: e.clientY - r.top, conteudo: <><b>{l} · {c}</b><span>{rotuloValor}<em className="font-mono">{v == null ? "sem dado" : formato(v)}</em></span></> });
            }}>{mostrarValores && v != null ? <span className="font-mono">{formato(v)}</span> : null}</td>;
        })}</tr>)}</tbody>
      </table>
      <DicaFlutuante dica={dica} />
    </div>
    {nota && <p className={s.nota}>{nota}</p>}
  </figure>;
}

/** Ponto com intervalo por grupo e método (ex.: aplicações não vistas). */
export function PontosIntervalo({ titulo, grupos, series, dominio = [0, 0.7] }: {
  titulo: string; grupos: string[]; series: Serie[]; dominio?: [number, number];
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica>(null);
  const linhaH = 22, m = { t: 8, r: 24, l: 120, b: 30 };
  const altura = m.t + grupos.length * (series.length * linhaH + 18) + m.b;
  const X = (v: number) => m.l + ((v - dominio[0]) / (dominio[1] - dominio[0])) * (w - m.l - m.r);
  const ticks = Array.from({ length: 8 }, (_, i) => dominio[0] + ((dominio[1] - dominio[0]) * i) / 7);
  return <figure className={s.fig}>
    <figcaption className={s.cap}><strong>{titulo}</strong>
      <span className={s.legenda}>{series.map(sr => <span key={sr.id}><i style={{ background: sr.cor }} />{sr.rotulo}</span>)}</span></figcaption>
    <div ref={ref} className={s.plot} onMouseLeave={() => setDica(null)}>
      <svg width={w} height={altura} role="img" aria-label={titulo}>
        {ticks.map(t => <g key={t}><line x1={X(t)} x2={X(t)} y1={m.t} y2={altura - m.b} className={s.grade} />
          <text x={X(t)} y={altura - 10} className={s.eixoX}>{num(t, 1)}</text></g>)}
        {grupos.map((g, gi) => {
          const y0 = m.t + gi * (series.length * linhaH + 18);
          return <g key={g}>
            <text x={0} y={y0 + (series.length * linhaH) / 2} className={s.grupo}>{g}</text>
            {series.map((sr, si) => {
              const p = sr.pontos[gi];
              const y = y0 + si * linhaH + linhaH / 2;
              return <g key={sr.id} onMouseMove={e => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setDica({ x: X(p.y), y: e.clientY - r.top, conteudo: <><b>{g}</b><span><i style={{ background: sr.cor }} />{sr.rotulo}<em className="font-mono">{num(p.y)}{p.lo != null ? ` (${num(p.lo, 2)}–${num(p.hi, 2)})` : ""}</em></span></> });
              }}>
                <rect x={m.l} y={y - linhaH / 2} width={w - m.l - m.r} height={linhaH} fill="transparent" />
                {p.lo != null && <line x1={X(p.lo)} x2={X(p.hi!)} y1={y} y2={y} stroke={sr.cor} strokeWidth={2} strokeLinecap="round" opacity={0.45} />}
                <circle cx={X(p.y)} cy={y} r={5} fill={sr.cor} stroke="var(--paper)" strokeWidth={2} />
              </g>;
            })}
          </g>;
        })}
      </svg>
      <DicaFlutuante dica={dica} />
    </div>
  </figure>;
}

/** Tabela alternativa recolhível, exigida para leitura sem cor. */
export function TabelaDados({ titulo, cabecalho, linhas }: { titulo: string; cabecalho: string[]; linhas: (string | number)[][] }) {
  return <details className={s.tabela}><summary>Ver tabela · {titulo}</summary>
    <div className="ui-table-scroll"><table className="ui-table"><thead><tr>{cabecalho.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className={j ? "font-mono" : undefined}>{c}</td>)}</tr>)}</tbody></table></div>
  </details>;
}
