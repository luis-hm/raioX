"use client";

import { useEffect, useRef } from "react";

/** Trios reais [tamanho em bytes, direção (+1 cliente→servidor, −1), tempo relativo em s]. */
export type Trio = readonly [number, number, number];
export type FluxoScanner = { pacotes: readonly Trio[]; rotulo?: string };

type Pacote = { faixa: number; x: number; w: number; dir: number; bytes: number; dt: number; lido: boolean; col: number };
type Faixa = { fluxo: number; prox: number; enfileirados: number; colunas: { v: number; dt: number; dir: number }[]; fim: number };

const HEX = "0123456789abcdef";
const COR = { teal: "#2DD4BF", violet: "#9D85FF", texto: "#E6EDF3", mudo: "#7D8B99", linha: "#1F2B36", fundo: "#0A0F14" };

function embaralhar(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[(Math.random() * 16) | 0];
  return s;
}

/**
 * Visor do raio-X: o conteúdo dos pacotes permanece cifrado (caracteres embaralhados);
 * o feixe só lê tamanho, direção e intervalo, que preenchem a matriz 32×4 de cada fluxo.
 */
export function XRayScanner({ fluxos, faixas = 5, velocidade = 1, className = "", rotulos = true }: {
  fluxos: readonly FluxoScanner[]; faixas?: number; velocidade?: number; className?: string; rotulos?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vel = useRef(velocidade);
  vel.current = velocidade;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !fluxos.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, raf = 0, ultimo = performance.now(), visivel = true;
    let proximoFluxo = 0;
    const pacotes: Pacote[] = [];
    const lanes: Faixa[] = [];
    let glifos: string[] = [];
    let trocaGlifo = 0;

    const novoFluxo = () => (proximoFluxo++) % fluxos.length;
    for (let i = 0; i < faixas; i++) lanes.push({ fluxo: novoFluxo(), prox: 0, enfileirados: 0, colunas: [], fim: 0 });

    const medir = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; });
    io.observe(canvas);

    const geo = () => {
      const feixe = W * 0.47, matriz = W * 0.70, topo = rotulos ? 34 : 14, base = H - 14;
      const alt = (base - topo) / faixas;
      return { feixe, matriz, topo, alt };
    };

    // Enfileira o próximo pacote de cada faixa respeitando o ritmo real (intervalo comprimido em log).
    const alimentar = (dtSeg: number) => {
      lanes.forEach((faixa, i) => {
        const fl = fluxos[faixa.fluxo].pacotes;
        faixa.prox -= dtSeg;
        if (faixa.fim > 0) {
          faixa.fim -= dtSeg;
          if (faixa.fim <= 0) { faixa.fluxo = novoFluxo(); faixa.enfileirados = 0; faixa.colunas = []; faixa.prox = 0.3; }
          return;
        }
        if (faixa.prox > 0 || faixa.enfileirados >= Math.min(32, fl.length)) return;
        const k = faixa.enfileirados;
        const [bytes, dir, t] = fl[k];
        const dt = k === 0 ? 0 : Math.max(0, t - fl[k - 1][2]);
        const w = 10 + Math.min(1, bytes / 1500) * 56;
        const ultimoDaFaixa = [...pacotes].reverse().find(p => p.faixa === i);
        const x = Math.min(-w - 4, ultimoDaFaixa ? ultimoDaFaixa.x - w - 6 : -w);
        pacotes.push({ faixa: i, x, w, dir, bytes, dt, lido: false, col: k });
        faixa.enfileirados++;
        faixa.prox = 0.08 + Math.min(0.6, Math.log1p(dt * 1000) / 12);
      });
    };

    const desenhar = (dtSeg: number) => {
      const g = geo();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = COR.fundo; ctx.fillRect(0, 0, W, H);
      // grade da chapa
      ctx.strokeStyle = "rgba(125,139,153,0.08)"; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

      if (rotulos) {
        ctx.font = "500 10px 'IBM Plex Mono', monospace"; ctx.fillStyle = COR.mudo; ctx.textBaseline = "middle";
        const curto = W < 600;
        ctx.fillText(curto ? "CIFRADO" : "ENTRADA · CONTEÚDO CIFRADO", 14, 16);
        ctx.fillText(curto ? "FEIXE" : "FEIXE · SÓ METADADOS", g.feixe + 12, 16);
        ctx.fillText(curto ? "32×4" : "MATRIZ 32×4", g.matriz + 10, 16);
      }

      trocaGlifo -= dtSeg;
      if (trocaGlifo <= 0) { glifos = pacotes.map(p => embaralhar(Math.max(1, Math.floor(p.w / 7)))); trocaGlifo = 0.07; }

      const velPx = W * 0.15 * vel.current;
      ctx.font = "400 9px 'IBM Plex Mono', monospace";
      // Uma leitura por vez em cada faixa: pacotes colados não sobrepõem os textos.
      const rotuloAte = new Array(faixas).fill(-Infinity);
      for (let i = pacotes.length - 1; i >= 0; i--) {
        const p = pacotes[i];
        p.x += velPx * dtSeg;
        const y = g.topo + p.faixa * g.alt + g.alt * 0.5;
        const h = Math.max(8, Math.min(18, g.alt * 0.42));
        const cor = p.dir > 0 ? COR.teal : COR.violet;
        if (!p.lido && p.x + p.w >= g.feixe) p.lido = true;
        if (p.x > g.matriz - 4) {
          const faixa = lanes[p.faixa];
          faixa.colunas.push({ v: Math.min(1, p.bytes / 1500), dt: Math.min(1, Math.log1p(p.dt * 1000) / 9), dir: p.dir });
          const total = Math.min(32, fluxos[faixa.fluxo].pacotes.length);
          if (faixa.colunas.length >= total) faixa.fim = 1.6;
          pacotes.splice(i, 1);
          continue;
        }
        const antes = Math.max(0, Math.min(p.w, g.feixe - p.x));
        // parte ainda não lida: caixa com conteúdo embaralhado
        if (antes > 0) {
          ctx.fillStyle = "rgba(230,237,243,0.05)"; ctx.fillRect(p.x, y - h / 2, antes, h);
          ctx.strokeStyle = "rgba(230,237,243,0.22)"; ctx.strokeRect(p.x + 0.5, y - h / 2 + 0.5, Math.max(0, antes - 1), h - 1);
          ctx.save(); ctx.beginPath(); ctx.rect(p.x, y - h / 2, antes, h); ctx.clip();
          ctx.fillStyle = "rgba(125,139,153,0.85)"; ctx.textBaseline = "middle";
          ctx.fillText(glifos[i] || "", p.x + 3, y + 0.5);
          ctx.restore();
        }
        // parte já lida: só a medida (o conteúdo nunca é revelado)
        if (antes < p.w) {
          const x0 = p.x + antes, larg = p.w - antes;
          ctx.fillStyle = cor; ctx.globalAlpha = 0.9; ctx.fillRect(x0, y - h / 2, larg, h); ctx.globalAlpha = 1;
          if (antes === 0 && p.x > g.feixe + 6 && p.x < g.matriz - 90 && p.x > rotuloAte[p.faixa]) {
            rotuloAte[p.faixa] = p.x + 64;
            ctx.fillStyle = COR.texto; ctx.textBaseline = "alphabetic";
            ctx.fillText(`${p.dir > 0 ? "↑" : "↓"} ${p.bytes} B`, p.x, y - h / 2 - 4);
            ctx.fillStyle = COR.mudo;
            ctx.fillText(`Δ${(p.dt * 1000).toFixed(p.dt < 0.01 ? 1 : 0)} ms`, p.x, y + h / 2 + 11);
          }
        }
      }

      // feixe
      const grad = ctx.createLinearGradient(g.feixe - 18, 0, g.feixe + 18, 0);
      grad.addColorStop(0, "rgba(45,212,191,0)"); grad.addColorStop(0.5, "rgba(45,212,191,0.16)"); grad.addColorStop(1, "rgba(45,212,191,0)");
      ctx.fillStyle = grad; ctx.fillRect(g.feixe - 18, g.topo - 8, 36, H - g.topo);
      ctx.fillStyle = COR.teal; ctx.fillRect(g.feixe - 0.5, g.topo - 8, 1, H - g.topo);

      // matrizes
      const mx = g.matriz, mw = W - mx - 12, cel = mw / 32;
      ctx.strokeStyle = COR.linha; ctx.beginPath(); ctx.moveTo(mx - 0.5, g.topo - 8); ctx.lineTo(mx - 0.5, H); ctx.stroke();
      lanes.forEach((faixa, i) => {
        const y0 = g.topo + i * g.alt + g.alt * 0.5 - 2 * Math.min(6, g.alt / 5.5);
        const ch = Math.min(6, g.alt / 5.5);
        for (let c = 0; c < 32; c++) {
          const col = faixa.colunas[c];
          for (let r = 0; r < 4; r++) {
            const x = mx + 6 + c * cel, y = y0 + r * (ch + 1);
            if (!col) { ctx.fillStyle = "rgba(125,139,153,0.10)"; ctx.fillRect(x, y, cel - 1, ch); continue; }
            if (r === 0) { ctx.fillStyle = col.dir > 0 ? COR.teal : COR.violet; ctx.globalAlpha = 0.25 + 0.75 * col.v; }
            else if (r === 1) { ctx.fillStyle = COR.texto; ctx.globalAlpha = 0.12 + 0.7 * col.dt; }
            else if (r === 2) { ctx.fillStyle = COR.texto; ctx.globalAlpha = 0.85; }
            else { ctx.fillStyle = "rgba(125,139,153,0.10)"; ctx.globalAlpha = 1; }
            ctx.fillRect(x, y, cel - 1, ch); ctx.globalAlpha = 1;
          }
        }
        if (faixa.fim > 0) {
          ctx.fillStyle = COR.teal; ctx.font = "500 9px 'IBM Plex Mono', monospace"; ctx.textBaseline = "alphabetic";
          ctx.fillText("● matriz pronta", mx + 6, y0 - 4);
          ctx.font = "400 9px 'IBM Plex Mono', monospace";
        }
      });
    };

    const quadro = (agora: number) => {
      const dtSeg = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      if (visivel && !document.hidden) { alimentar(dtSeg * vel.current); desenhar(dtSeg); }
      raf = requestAnimationFrame(quadro);
    };

    if (reduzido) {
      // Quadro estático: matrizes já preenchidas, sem movimento.
      lanes.forEach(f => {
        const fl = fluxos[f.fluxo].pacotes;
        f.colunas = fl.slice(0, 32).map(([b, d, t], k) => ({ v: Math.min(1, b / 1500), dir: d,
          dt: k ? Math.min(1, Math.log1p(Math.max(0, t - fl[k - 1][2]) * 1000) / 9) : 0 }));
      });
      desenhar(0);
    } else raf = requestAnimationFrame(quadro);

    return () => { cancelAnimationFrame(raf); obs.disconnect(); io.disconnect(); };
  }, [fluxos, faixas, rotulos]);

  return <canvas ref={ref} className={`block h-full w-full ${className}`} role="img"
    aria-label="Visor do raio-X: pacotes com conteúdo cifrado passam pelo feixe, que lê só tamanho, direção e intervalo e preenche a matriz 32×4 de cada fluxo." />;
}
