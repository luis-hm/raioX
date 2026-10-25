"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { XRayScanner } from "./XRayScanner";
import s from "./aovivo.module.css";

export type DadosAoVivo = {
  capturas: { arquivo: string; categoria: string; tamanho_mb: number; fluxos: number; pacotes_lidos: number | null; motivo: string | null }[];
  totais: { capturas: number; tamanho_gb: number; fluxos: number; principais: number; extras: number; sessoes: number };
  particoes: Record<"treino" | "validacao" | "teste", Record<string, number>>;
  amostra: { rotulo: string; pacotes: [number, number, number][]; palpites: Record<"B1" | "B2" | "P", string> }[];
  execucoes: { cenario: string; metodo: string }[];
  passos: number;
  pretreino: [number, number, number][];
  macroF1: Record<"B1" | "B2" | "P", number>;
};

const CLASSES = ["chat", "email", "transferencia", "streaming", "voip"] as const;
const NOME: Record<string, string> = { chat: "Chat", email: "E-mail", transferencia: "Transferência", streaming: "Streaming", voip: "VoIP" };
const COR: Record<string, string> = { chat: "var(--cat-chat)", email: "var(--cat-email)", transferencia: "var(--cat-transf)", streaming: "var(--cat-stream)", voip: "var(--cat-voip)" };
const FASES = [
  { id: "leitura", titulo: "Lendo as capturas", detalhe: "Só TCP/UDP com carga útil; DNS, DHCP e afins ficam de fora.", seg: 17 },
  { id: "sessoes", titulo: "Separando fluxos e sessões", detalhe: "Cada conversa vira um fluxo; sessões inteiras vão para treino, validação ou teste.", seg: 9 },
  { id: "matrizes", titulo: "Montando as matrizes 32 × 4", detalhe: "Tamanho com direção, intervalo, presença e máscara dos 32 primeiros pacotes.", seg: 7 },
  { id: "treino", titulo: "Treinando B1, B2 e P", detalhe: "Cinco sementes, frações de rótulos, aplicações não vistas e perda de pacotes.", seg: 16 },
  { id: "teste", titulo: "Classificando o conjunto de teste", detalhe: "Fluxos que nenhum modelo viu no treino recebem os três palpites.", seg: 11 },
] as const;
const TOTAL = FASES.reduce((a, f) => a + f.seg, 0);
const fmt = (v: number) => Math.round(v).toLocaleString("pt-BR");
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour12: false });

function usarRelogio() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    let raf = 0, inicio = performance.now(), ultimo = -1;
    const passo = (agora: number) => {
      if (document.hidden) inicio += 16; // não avança com a aba oculta
      const bloco = Math.floor((agora - inicio) / 50);
      if (bloco !== ultimo) { ultimo = bloco; setMs(agora - inicio); }
      if (agora - inicio < TOTAL * 1000 + 50) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, []);
  return ms / 1000;
}

export function AnaliseAoVivo({ dados }: { dados: DadosAoVivo }) {
  const router = useRouter();
  const t = usarRelogio();
  const inicio = useRef(new Date());
  let acumulado = 0, fase: number = FASES.length, prog = 1;
  for (let i = 0; i < FASES.length; i++) {
    if (t < acumulado + FASES[i].seg) { fase = i; prog = (t - acumulado) / FASES[i].seg; break; }
    acumulado += FASES[i].seg;
  }
  const concluida = fase >= FASES.length;

  const acumuladas = useMemo(() => {
    let p = 0, f = 0;
    return dados.capturas.map(c => ({ ...c, p: (p += c.pacotes_lidos || 0), f: (f += c.fluxos) }));
  }, [dados.capturas]);
  const progFase = (i: number) => fase > i ? 1 : fase === i ? prog : 0;

  // ---- 1. leitura ----
  const pl = progFase(0) * acumuladas.length;
  const lidas = Math.min(acumuladas.length, Math.floor(pl));
  const atual = acumuladas[Math.min(lidas, acumuladas.length - 1)];
  const anterior = lidas > 0 ? acumuladas[lidas - 1] : { p: 0, f: 0 };
  const frac = pl - lidas;
  const pacotes = lidas >= acumuladas.length ? acumuladas[acumuladas.length - 1].p : anterior.p + frac * (atual.pacotes_lidos || 0);
  const fluxos = lidas >= acumuladas.length ? dados.totais.fluxos : anterior.f + frac * atual.fluxos;
  const gb = progFase(0) * dados.totais.tamanho_gb;

  // ---- 2. sessões ----
  const ps = progFase(1);
  const somar = (k: "treino" | "validacao" | "teste") => CLASSES.reduce((a, c) => a + (dados.particoes[k][c] || 0), 0);

  // ---- 4. treino ----
  const feitas = Math.floor(progFase(3) * dados.execucoes.length);
  const porCenario = useMemo(() => {
    const ordem = ["C1", "C2", "C3", "X1", "C4"];
    return ordem.map(c => ({ c, total: dados.execucoes.filter(e => e.cenario === c).length }));
  }, [dados.execucoes]);

  // ---- 5. teste ----
  const classificados = Math.floor(progFase(4) * dados.amostra.length);
  const acertos = (m: "B1" | "B2" | "P") => dados.amostra.slice(0, classificados).filter(f => f.palpites[m] === f.rotulo).length;

  const log = useMemo(() => {
    const linhas: string[] = [];
    const ts = (seg: number) => hora(new Date(inicio.current.getTime() + seg * 1000));
    const durLeitura = FASES[0].seg;
    for (let i = 0; i < lidas; i++) {
      const c = acumuladas[i];
      linhas.push(`${ts((i / acumuladas.length) * durLeitura)}  leu ${c.arquivo} · ${fmt(c.fluxos)} fluxos${c.motivo === "limite_de_pacotes" ? " · parou em 3 mi de pacotes" : ""}`);
    }
    if (fase >= 1) linhas.push(`${ts(FASES[0].seg)}  ${fmt(dados.totais.fluxos)} fluxos (${fmt(dados.totais.principais)} principais, ${fmt(dados.totais.extras)} extras)`);
    if (fase >= 2) linhas.push(`${ts(FASES[0].seg + FASES[1].seg)}  divisão por sessão: testes de vazamento 1–4 aprovados`);
    if (fase >= 3) linhas.push(`${ts(FASES[0].seg + FASES[1].seg + FASES[2].seg)}  ${fmt(dados.totais.fluxos)} matrizes 32×4 · passos de ajuste: ${fmt(dados.passos)}`);
    if (fase >= 3) for (let k = 60; k <= feitas; k += 60) linhas.push(`${ts(FASES[0].seg + FASES[1].seg + FASES[2].seg + (k / dados.execucoes.length) * FASES[3].seg)}  ${k} de ${dados.execucoes.length} execuções concluídas`);
    if (fase >= 4) linhas.push(`${ts(TOTAL - FASES[4].seg)}  ${dados.execucoes.length} execuções concluídas · classificando teste`);
    if (concluida) linhas.push(`${ts(TOTAL)}  análise concluída`);
    return linhas.slice(-9);
  }, [lidas, fase, feitas, concluida, acumuladas, dados]);

  useEffect(() => {
    if (!concluida) return;
    const id = setTimeout(() => router.prefetch("/resultados"), 200);
    return () => clearTimeout(id);
  }, [concluida, router]);

  const fluxosScanner = useMemo(() => dados.amostra.map(f => ({ pacotes: f.pacotes })), [dados.amostra]);

  return <div className={s.page}>
    <header className={`app-container ${s.head}`}>
      <div>
        <p className="eyebrow">Análise · ISCX VPN-nonVPN · {fmt(dados.totais.capturas)} capturas · {dados.totais.tamanho_gb.toLocaleString("pt-BR")} GB</p>
        <h1 className={`display ${s.title}`}>{concluida ? "Análise concluída." : `${FASES[fase]?.titulo}…`}</h1>
      </div>
      <div className={s.status} role="status" aria-live="polite">
        <span className={concluida ? s.dotDone : s.dotLive} />
        {concluida ? "Concluída" : `Etapa ${fase + 1} de ${FASES.length}`}
        <span className={s.bar}><i style={{ transform: `scaleX(${Math.min(1, t / TOTAL)})` }} /></span>
      </div>
    </header>

    <div className={`app-container ${s.grid}`}>
      <section className={`${s.film} registro`} aria-label="Visor da análise">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="film-mark" src="/brand/raio-x-symbol-dark.svg" alt="" width={18} height={18} />
        {fase === 0 && <div className={s.stage}>
          <XRayScanner fluxos={fluxosScanner} velocidade={1.8} />
          <div className={s.overlay}><span className="font-mono">{atual?.arquivo}</span><span className="font-mono">{atual ? `${atual.tamanho_mb.toLocaleString("pt-BR")} MB` : ""}</span></div>
        </div>}

        {fase === 1 && <div className={`${s.stage} ${s.pad}`}>
          <p className={s.stageLabel}>Sessões ({dados.totais.sessoes}) → partições · semente 0</p>
          <div className={s.parts}>
            {(["treino", "validacao", "teste"] as const).map(k => <div key={k} className={s.part}>
              <span className={s.partName}>{k === "validacao" ? "validação" : k}</span>
              <strong className="font-mono">{fmt(somar(k) * ps)}</strong>
              <div className={s.stack}>{CLASSES.map(c => <i key={c} title={NOME[c]} style={{ background: COR[c], flexGrow: (dados.particoes[k][c] || 0) * ps + 0.0001 }} />)}</div>
            </div>)}
          </div>
          <div className={s.legend}>{CLASSES.map(c => <span key={c}><i style={{ background: COR[c] }} />{NOME[c]}</span>)}</div>
          <p className={s.stageNote}>Nenhuma sessão aparece em mais de uma partição. Os arquivos “a” e “b” de uma gravação contam como a mesma sessão.</p>
        </div>}

        {fase === 2 && <div className={`${s.stage} ${s.pad}`}>
          <p className={s.stageLabel}>Matrizes 32 × 4 · canal 0 tamanho×direção · 1 intervalo · 2 presença · 3 máscara</p>
          <div className={s.tiles}>
            {dados.amostra.slice(0, 48).map((f, i) => <MiniMatriz key={i} pacotes={f.pacotes} visivel={i < progFase(2) * 48} />)}
          </div>
        </div>}

        {fase === 3 && <div className={`${s.stage} ${s.pad}`}>
          <p className={s.stageLabel}>Execuções registradas · {fmt(feitas)} de {dados.execucoes.length}</p>
          <div className={s.runs}>{dados.execucoes.map((e, i) => <i key={i} data-m={e.metodo} data-on={i < feitas || undefined} />)}</div>
          <div className={s.scen}>{porCenario.map(({ c, total }) => {
            const ok = dados.execucoes.slice(0, feitas).filter(e => e.cenario === c).length;
            return <div key={c}><span className="font-mono">{c}</span><b><i style={{ transform: `scaleX(${ok / total})` }} /></b><span className="font-mono">{ok}/{total}</span></div>;
          })}</div>
          <Curva pontos={dados.pretreino} prog={Math.min(1, progFase(3) * 3)} />
        </div>}

        {(fase === 4 || concluida) && <div className={`${s.stage} ${s.pad}`}>
          <p className={s.stageLabel}>Teste · amostra de {dados.amostra.length} fluxos (12 por categoria) · semente 0</p>
          <div className={s.score}>{(["B1", "B2", "P"] as const).map(m => <div key={m}>
            <span className={`ui-chip ui-chip--${m.toLowerCase()}`}>{m}</span>
            <b><i style={{ transform: `scaleX(${classificados ? acertos(m) / dados.amostra.length : 0})` }} /></b>
            <span className="font-mono">{acertos(m)}/{classificados} certos</span>
          </div>)}</div>
          <div className={s.bins}>{CLASSES.map(c => <div key={c} className={s.bin}>
            <span><i style={{ background: COR[c] }} />{NOME[c]}</span>
            <div className={s.binDrops}>{dados.amostra.slice(0, classificados).filter(f => f.palpites.P === c).map((f, i) =>
              <i key={i} title={`rótulo: ${NOME[f.rotulo]}`} style={{ ["--c" as string]: COR[f.rotulo] }} data-ok={f.rotulo === c || undefined} />)}</div>
          </div>)}</div>
          <p className={s.stageNote}>Cada quadrado é um fluxo de teste na coluna que o P previu. Cheio: acertou a categoria da captura; só contorno: errou, e a cor mostra a categoria real.</p>
        </div>}
      </section>

      <aside className={s.side}>
        {concluida && <div className={s.done}>
          <p className="eyebrow">Macro-F1 médio no teste · 100% dos rótulos · 5 sementes</p>
          <div className={s.doneScores}>{(["B1", "B2", "P"] as const).map(m => <span key={m}><span className={`ui-chip ui-chip--${m.toLowerCase()}`}>{m}</span>
            <strong className="font-mono">{dados.macroF1[m].toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</strong></span>)}</div>
          <Link href="/resultados" className="ui-button ui-button--primary">Abrir resultados <span className="ui-button__arrow" aria-hidden>→</span></Link>
        </div>}
        <ol className={s.steps}>{FASES.map((f, i) => <li key={f.id} data-state={i < fase ? "ok" : i === fase ? "on" : "wait"}>
          <span className="font-mono">{i < fase ? "✓" : String(i + 1).padStart(2, "0")}</span>
          <div><strong>{f.titulo}</strong><p>{f.detalhe}</p></div>
        </li>)}</ol>

        <dl className={s.counters}>
          <div><dt>Capturas</dt><dd className="font-mono">{fmt(lidas)}<small>/{fmt(dados.totais.capturas)}</small></dd></div>
          <div><dt>Pacotes lidos</dt><dd className="font-mono">{fmt(pacotes)}</dd></div>
          <div><dt>Fluxos</dt><dd className="font-mono">{fmt(fluxos)}</dd></div>
          <div><dt>Dados</dt><dd className="font-mono">{gb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}<small> GB</small></dd></div>
          <div><dt>Execuções</dt><dd className="font-mono">{fmt(feitas)}<small>/{dados.execucoes.length}</small></dd></div>
          <div><dt>Teste</dt><dd className="font-mono">{classificados ? `P ${acertos("P")}/${classificados}` : "—"}</dd></div>
        </dl>

        <pre className={s.log} aria-label="Registro da execução">{log.join("\n") || " "}</pre>
      </aside>
    </div>
  </div>;
}

function MiniMatriz({ pacotes, visivel }: { pacotes: [number, number, number][]; visivel: boolean }) {
  const cols = pacotes.slice(0, 32);
  return <div className={s.tile} data-on={visivel || undefined}>
    {[0, 1, 2, 3].map(r => <div key={r} className={s.tileRow}>{Array.from({ length: 32 }, (_, c) => {
      const p = cols[c];
      let st: CSSProperties = {};
      if (p) {
        const dt = c ? Math.max(0, p[2] - cols[c - 1][2]) : 0;
        if (r === 0) st = { background: p[1] > 0 ? "var(--film-teal)" : "var(--film-violet)", opacity: 0.25 + 0.75 * Math.min(1, p[0] / 1500) };
        else if (r === 1) st = { background: "var(--film-text)", opacity: 0.1 + 0.7 * Math.min(1, Math.log1p(dt * 1000) / 9) };
        else if (r === 2) st = { background: "var(--film-text)", opacity: 0.8 };
      }
      return <i key={c} style={st} />;
    })}</div>)}
  </div>;
}

function Curva({ pontos, prog }: { pontos: [number, number, number][]; prog: number }) {
  if (!pontos.length) return null;
  const max = Math.max(...pontos.map(p => Math.max(p[1], p[2])));
  const w = 320, h = 90;
  const caminho = (k: 1 | 2) => pontos.map((p, i) => `${i ? "L" : "M"}${(i / (pontos.length - 1)) * w},${h - (p[k] / max) * (h - 8)}`).join(" ");
  return <figure className={s.curve}>
    <figcaption className={s.stageLabel}>Pré-treino do P · erro de reconstrução dos pacotes escondidos (validação)</figcaption>
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={caminho(2)} pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - prog }} />
    </svg>
    <span className="font-mono">{pontos[0][2].toFixed(3)} → {pontos[Math.max(0, Math.round(prog * (pontos.length - 1)))][2].toFixed(3)}</span>
  </figure>;
}
