"use client";

import Link from "next/link";
import { useState } from "react";
import type { Experimento, Media, Teste } from "@/lib/experimento";
import { Calor, Linhas, PontosIntervalo, TabelaDados, num, type Serie } from "./graficos";
import { Reveal } from "./Reveal";
import s from "./resultados.module.css";

type Dados = Omit<Experimento, "execucoes" | "amostra" | "dados"> & {
  n_execucoes: number;
  dados: { fluxos: number; capturas: number; completos_32: number; por_categoria: Experimento["dados"]["por_categoria"] };
};

const CLASSES = ["chat", "email", "transferencia", "streaming", "voip"];
const NOME: Record<string, string> = { chat: "Chat", email: "E-mail", transferencia: "Transferência", streaming: "Streaming", voip: "VoIP" };
const MET = [
  { id: "B1", rotulo: "B1 · Random Forest", cor: "var(--b1)" },
  { id: "B2", rotulo: "B2 · CNN", cor: "var(--b2)" },
  { id: "P", rotulo: "P · CNN + pré-treino", cor: "var(--p)" },
] as const;
const FRACOES = [0.01, 0.05, 0.1, 1] as const;
const pct = (f: number) => `${Math.round(f * 100)}%`;
const pp = (v: number) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v) * 100, 1)} pp`;
const pval = (v: number | null | undefined) => v == null ? "—" : v < 0.001 ? "< 0,001" : num(v, 3);

function media(m: Media[], grupo: string, metodo: string, fracao: number, perda = 0) {
  return m.find(r => r.grupo === grupo && r.metodo === metodo && Math.abs(r.fracao_rotulos - fracao) < 1e-6 && Math.abs(r.taxa_perda - perda) < 1e-6);
}
function teste(t: Teste[], grupo: string, comp: string, fracao: number, perda = 0) {
  return t.find(r => r.grupo === grupo && r.comp === comp && Math.abs(r.fracao - fracao) < 1e-6 && Math.abs(r.perda - perda) < 1e-6);
}

export function Resultados({ exp }: { exp: Dados }) {
  const v = exp.vereditos;
  const melhorC1 = [...MET].sort((a, b) => (media(exp.medias, "N", b.id, 1)?.media ?? 0) - (media(exp.medias, "N", a.id, 1)?.media ?? 0))[0];
  const ganhou = (["H1", "H2", "H3"] as const).filter(h => v[h].sustentada);
  const manchete = ganhou.length === 0 ? "O pré-treino não trouxe ganho comprovado."
    : `O pré-treino trouxe ganho em ${ganhou.join(", ")}.`;

  const serieRotulos: Serie[] = MET.map(m => ({ id: m.id, rotulo: m.id, cor: m.cor,
    pontos: FRACOES.map(f => { const r = media(exp.medias, "N", m.id, f); return { x: pct(f), y: r?.media ?? NaN, lo: r?.ic_inf, hi: r?.ic_sup }; }) }));
  const gruposC3 = [["C3-A1", 0.1], ["C3-A1", 1], ["C3-A2", 0.1], ["C3-A2", 1]] as const;
  const serieC3: Serie[] = MET.map(m => ({ id: m.id, rotulo: m.rotulo, cor: m.cor,
    pontos: gruposC3.map(([g, f]) => { const r = media(exp.medias, g, m.id, f); return { x: g, y: r?.media ?? NaN, lo: r?.ic_inf, hi: r?.ic_sup }; }) }));
  const serieC4 = (f: number): Serie[] => MET.map(m => ({ id: m.id, rotulo: m.id, cor: m.cor,
    pontos: [0, 0.1, 0.2].map(p => { const r = media(exp.medias, "C4-N", m.id, f, p); return { x: pct(p), y: r?.media ?? NaN, lo: r?.ic_inf, hi: r?.ic_sup }; }) }));
  const serieX1: Serie[] = [
    { id: "B2_cong", rotulo: "B2 congelado", cor: "var(--b2)" },
    { id: "P_cong", rotulo: "P congelado", cor: "var(--p)" },
  ].map(m => ({ ...m, pontos: FRACOES.map(f => { const r = media(exp.medias, "X1", m.id, f); return { x: pct(f), y: r?.media ?? NaN, lo: r?.ic_inf, hi: r?.ic_sup }; }) }));

  const [metConf, setMetConf] = useState<"B1" | "B2" | "P">("P");
  const conf = exp.confusao[`N|${metConf}`] || [];
  const confPct = conf.map(l => { const t = l.reduce((a, b) => a + b, 0) || 1; return l.map(c => c / t); });
  const [metOcl, setMetOcl] = useState<"B2" | "P">("P");
  const ocl = exp.oclusao[metOcl];
  const f1N = MET.map(m => exp.f1_por_classe.find(r => r.grupo === "N" && r.metodo === m.id));
  const expo = exp.exposicao;
  const mediaExpo = (k: keyof (typeof expo)[number]) => expo.reduce((a, r) => a + Number(r[k]), 0) / Math.max(1, expo.length);

  const cartoes = [
    { h: "H1" as const, titulo: "Poucos rótulos", pergunta: "Com 1%, 5% e 10% dos rótulos, P supera B2 por ≥ 2 pp?",
      evid: exp.h1.map(r => `${pct(r.fracao)}: ${pp(r.dif)} · p ${pval(r.p_holm)}`) },
    { h: "H2" as const, titulo: "Aplicações não vistas", pergunta: "Com aplicações fora do treino, P supera B2 e B1?",
      evid: gruposC3.map(([g, f]) => { const a = teste(exp.testes, g, "P - B2", f), b = teste(exp.testes, g, "P - B1", f);
        return `${g.replace("C3-", "")} ${pct(f)}: vs B2 ${a ? pp(a.dif) : "—"} · vs B1 ${b ? pp(b.dif) : "—"}`; }) },
    { h: "H3" as const, titulo: "Perda de pacotes", pergunta: "Quando pacotes somem, P perde menos que B2?",
      evid: exp.h3.filter(r => r.comp === "queda P - queda B2").map(r => `${pct(r.fracao)} rót., ${pct(r.perda)} perda: ${pp(r.dif)} · p ${pval(r.p_holm)}`) },
    { h: "H4" as const, titulo: "Custo", pergunta: "P tem a mesma inferência de B2, pagando só o pré-treino?",
      evid: [`inferência B2 ${num(exp.custo.B2.inferencia_ms, 1)} ms · P ${num(exp.custo.P.inferencia_ms, 1)} ms (lote de 256)`,
        `${(exp.custo.P.n_parametros ?? 0).toLocaleString("pt-BR")} parâmetros nos dois`,
        `pré-treino ≈ ${num(exp.custo.P.pretreino_s ?? 0, 1)} s por cenário e semente`] },
  ];

  return <div className={s.page}>
    <header className={s.hero}>
      <p className="eyebrow">Resultados · {exp.n_execucoes} execuções · 5 sementes · teste t pareado com correção de Holm</p>
      <h1 className={`display ${s.title}`}>{manchete}</h1>
      <p className={s.lead}>Com 100% dos rótulos, o melhor macro-F1 médio no teste foi o de <strong>{melhorC1.rotulo}</strong>:{" "}
        {MET.map((m, i) => <span key={m.id}>{i ? " · " : ""}{m.id} <b className="font-mono">{num(media(exp.medias, "N", m.id, 1)?.media)}</b></span>)}.
        Diferença não significativa não prova ausência de efeito: com cinco sementes o teste tem pouco poder.</p>
    </header>

    <section className={s.cards} aria-label="Veredito das hipóteses">
      {cartoes.map(c => <article key={c.h} className={s.card} data-ok={v[c.h].sustentada || undefined}>
        <div className={s.cardHead}><span className="font-mono">{c.h}</span>
          <span className={`ui-chip ${v[c.h].sustentada ? "ui-chip--ok" : ""}`}>{v[c.h].sustentada ? (c.h === "H4" ? "Confirmada" : "Sustentada") : "Não sustentada"}</span></div>
        <h2>{c.titulo}</h2><p>{c.pergunta}</p>
        <ul className="font-mono">{c.evid.map(e => <li key={e}>{e}</li>)}</ul>
        <small>Regra: {v[c.h].regra}.</small>
      </article>)}
    </section>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">01 · C1 e C2</span><h2 className="display">Quanto rótulo cada modelo precisa?</h2>
        <p>Macro-F1 no teste do cenário N (aplicações vistas), média de 5 sementes e intervalo de confiança de 95%.</p></header>
      <Linhas titulo="Macro-F1 por fração de rótulos" xs={FRACOES.map(pct)} series={serieRotulos} yRotulo="macro-F1" />
      <TabelaDados titulo="C1/C2" cabecalho={["Rótulos", ...MET.map(m => m.id), "P − B2", "p de Holm"]}
        linhas={FRACOES.map(f => { const t = teste(exp.testes, "N", "P - B2", f);
          return [pct(f), ...MET.map(m => num(media(exp.medias, "N", m.id, f)?.media)), t ? pp(t.dif) : "—", pval(t?.p_holm)]; })} />
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">02 · C3</span><h2 className="display">E com aplicações que o treino nunca viu?</h2>
        <p>A1 retira Skype, YouTube e email1; A2 retira Facebook, FTPS, Netflix e email2. O teste da dobra é fixo; a semente muda só o treino.</p></header>
      <PontosIntervalo titulo="Macro-F1 em aplicações não vistas (10% e 100% dos rótulos)"
        grupos={gruposC3.map(([g, f]) => `${g.replace("C3-", "")} · ${pct(f)}`)} series={serieC3} />
      <TabelaDados titulo="C3" cabecalho={["Dobra", ...MET.map(m => m.id), "P − B2", "P − B1"]}
        linhas={gruposC3.map(([g, f]) => [`${g.replace("C3-", "")} · ${pct(f)}`, ...MET.map(m => num(media(exp.medias, g, m.id, f)?.media)),
          pp(teste(exp.testes, g, "P - B2", f)?.dif ?? NaN), pp(teste(exp.testes, g, "P - B1", f)?.dif ?? NaN)])} />
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">03 · C4</span><h2 className="display">Quando pacotes se perdem no caminho.</h2>
        <p>Cada pacote do teste some com probabilidade p antes do corte em 32, e os intervalos são recalculados. Os modelos não treinam com perda.
          Consistência: com 0% de perda, a diferença máxima para C1/C2 foi {num(exp.consistencia_c4, 4)}.</p></header>
      <div className={s.duo}>
        <Linhas titulo="10% dos rótulos" xs={["0%", "10%", "20%"]} series={serieC4(0.1)} yRotulo="macro-F1" altura={260} />
        <Linhas titulo="100% dos rótulos" xs={["0%", "10%", "20%"]} series={serieC4(1)} yRotulo="macro-F1" altura={260} />
      </div>
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">04 · C5 e X1</span><h2 className="display">Custo e o que o pré-treino aprende sozinho.</h2></header>
      <div className={s.stats}>
        {MET.map(m => { const c = exp.custo[m.id]; return <div key={m.id}><span className={`ui-chip ui-chip--${m.id.toLowerCase()}`}>{m.id}</span>
          <strong className="font-mono">{num(c.inferencia_ms, 1)}<small> ms</small></strong><span>inferência por lote de 256 (CPU)</span>
          <span className="font-mono">{c.n_parametros ? `${c.n_parametros.toLocaleString("pt-BR")} parâmetros` : "300 árvores"}{c.pretreino_s ? ` · pré-treino ${num(c.pretreino_s, 1)} s` : ""}</span></div>; })}
      </div>
      <Linhas titulo="Codificador congelado: só a cabeça de classificação treina" xs={FRACOES.map(pct)} series={serieX1} yRotulo="macro-F1" altura={240} />
      <p className={s.note}>Se o encoder pré-treinado fosse útil por si só, “P congelado” ficaria acima de “B2 congelado”, que parte de um encoder aleatório.</p>
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">05 · Onde os modelos erram</span><h2 className="display">Cada classe tem a sua dificuldade.</h2>
        <p>Cenário N, 100% dos rótulos. A matriz soma as 5 sementes; cada linha mostra para onde foram os fluxos daquela categoria real.</p></header>
      <Calor titulo="F1 por classe (média de 5 sementes)" linhas={MET.map(m => m.id)} colunas={CLASSES.map(c => NOME[c])}
        valores={f1N.map(r => CLASSES.map(c => (r ? Number(r[c]) : null)))} max={1} rotuloValor="F1" />
      <div className={s.toggle} role="group" aria-label="Modelo da matriz de confusão">
        {(["B1", "B2", "P"] as const).map(m => <button key={m} type="button" aria-pressed={metConf === m} onClick={() => setMetConf(m)}>{m}</button>)}</div>
      <Calor titulo={`Matriz de confusão · ${metConf} · linha = categoria real, coluna = prevista`} linhas={CLASSES.map(c => NOME[c])}
        colunas={CLASSES.map(c => NOME[c])} valores={confPct} max={1} formato={x => `${Math.round(x * 100)}%`} rotuloValor="dos fluxos da linha" />
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">06 · O que o modelo olha</span><h2 className="display">Os primeiros pacotes dizem quase tudo.</h2>
        <p>Oclusão: zera um pacote por vez e mede a queda na probabilidade da classe prevista (semente 0). Mostra correlação, não causa.</p></header>
      <div className={s.toggle} role="group" aria-label="Modelo da oclusão">
        {(["B2", "P"] as const).map(m => <button key={m} type="button" aria-pressed={metOcl === m} onClick={() => setMetOcl(m)}>{m}</button>)}</div>
      <Calor titulo={`Queda média de probabilidade ao esconder o pacote · ${metOcl}`} linhas={CLASSES.map(c => NOME[c])}
        colunas={Array.from({ length: 32 }, (_, i) => String(i + 1))} valores={ocl.queda.map(l => l.map(x => x == null ? null : Math.max(0, x)))}
        mostrarValores={false} formato={x => num(x, 3)} rotuloValor="queda média"
        nota={`Posições mais influentes: ${CLASSES.map(c => `${NOME[c]} ${ocl.top3[c]?.join(", ")}`).join(" · ")}. Células com menos de 5 fluxos ficam vazias.`} />
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">07 · Privacidade</span><h2 className="display">Sem payload, ainda vaza alguma coisa.</h2>
        <p>Um Random Forest sobre a matriz achatada tenta adivinhar a aplicação (17 combinações) e a categoria.</p></header>
      <div className={s.stats}>
        <div><strong className="font-mono">{num(mediaExpo("acc_aplicacao"), 2)}</strong><span>acurácia ao identificar a aplicação</span><span className="font-mono">acaso uniforme ≈ 0,06</span></div>
        <div><strong className="font-mono">{num(mediaExpo("f1_aplicacao"), 2)}</strong><span>F1 da aplicação</span><span className="font-mono">17 classes</span></div>
        <div><strong className="font-mono">{num(mediaExpo("f1_categoria_direto"), 2)}</strong><span>F1 da categoria</span><span className="font-mono">via aplicação {num(mediaExpo("f1_categoria_via_app"), 2)}</span></div>
      </div>
    </Reveal>

    <Reveal className={s.block}>
      <header className={s.blockHead}><span className="eyebrow">08 · Todos os testes</span><h2 className="display">Os números por trás do veredito.</h2></header>
      <div className="ui-table-scroll"><table className="ui-table">
        <thead><tr><th>Grupo</th><th>Rótulos</th><th>Perda</th><th>Comparação</th><th>Diferença (IC95%)</th><th>p de Holm</th><th>Veredito</th></tr></thead>
        <tbody>{exp.testes.map((r, i) => <tr key={i}><td>{r.grupo}</td><td className="font-mono">{pct(r.fracao)}</td><td className="font-mono">{pct(r.perda)}</td>
          <td>{r.comp.replace(" - ", " − ").replace(/_cong/g, " congelado")}</td><td className="font-mono">{pp(r.dif)} ({num(r.ic_inf, 3)} a {num(r.ic_sup, 3)})</td>
          <td className="font-mono">{pval(r.p_holm)}</td><td>{r.veredito}</td></tr>)}</tbody>
      </table></div>
    </Reveal>

    <footer className={s.fim}>
      <p className="font-mono">{exp.dados.fluxos.toLocaleString("pt-BR")} fluxos · {(exp.dados.completos_32 * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% com 32 pacotes · passos de ajuste escolhidos na validação: {exp.passos.escolhidos.toLocaleString("pt-BR")} · {exp.hardware}</p>
      <div className={s.fimLinks}><Link href="/metodologia" className="ui-button ui-button--secondary">Como foi feito</Link>
        <Link href="/enviar" className="ui-button ui-button--primary">Analisar meus arquivos <span className="ui-button__arrow" aria-hidden>→</span></Link></div>
    </footer>
  </div>;
}
