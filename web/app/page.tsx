import Link from "next/link";
import { XRayScanner } from "@/components/raiox/XRayScanner";
import { Reveal } from "@/components/raiox/Reveal";
import { carregarExperimento, fluxosVitrine } from "@/lib/experimento";
import s from "@/components/raiox/landing.module.css";

const n = (v: number) => v.toLocaleString("pt-BR");

export default function Page() {
  const exp = carregarExperimento();
  const fluxos = exp?.amostra.length ? exp.amostra.map(f => ({ pacotes: f.pacotes, rotulo: f.rotulo })) : fluxosVitrine();
  const execucoes = exp?.execucoes.length;

  return <>
    <section className={`${s.hero} grid-paper`}>
      <div className={`app-container ${s.heroGrid}`}>
        <div className={s.heroText}>
          <p className="eyebrow">Projeto 4 · Classificação de tráfego cifrado</p>
          <h1 className={`display ${s.title}`}>O conteúdo fica trancado. <span className={s.titleSoft}>O comportamento, não.</span></h1>
          <p className={s.lead}>O Raio-X lê só o tamanho, a direção e o ritmo dos pacotes de cada fluxo e diz se ele parece
            chat, e-mail, transferência, streaming ou VoIP. Três modelos fazem essa leitura lado a lado.</p>
          <div className={s.actions}>
            <Link href="/analise" className="ui-button ui-button--primary">Iniciar análise <span className="ui-button__arrow" aria-hidden>→</span></Link>
            <Link href="/enviar" className="ui-button ui-button--secondary">Analisar meus arquivos</Link>
          </div>
          <p className={s.note}><span className={s.lock} aria-hidden>●</span> Nenhum byte de conteúdo, IP ou porta é guardado.</p>
        </div>
        <figure className={`${s.film} registro`}>
          <div className={s.filmCanvas}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="film-mark" src="/brand/raio-x-symbol-dark.svg" alt="" width={18} height={18} />
            <XRayScanner fluxos={fluxos} />
          </div>
          <figcaption className={s.filmCaption}>
            <span><i className={s.dotUp} /> cliente → servidor</span>
            <span><i className={s.dotDown} /> servidor → cliente</span>
            <span className={s.filmCaptionRight}>fluxos reais do ISCX VPN-nonVPN</span>
          </figcaption>
        </figure>
      </div>
    </section>

    {exp && <section className={s.numbers} aria-label="O experimento em números">
      <div className={`app-container ${s.numbersGrid}`}>
        {[
          [n(exp.dados.capturas_incluidas), "capturas analisadas", `${n(exp.dados.tamanho_gb)} GB de tráfego bruto`],
          [n(exp.dados.fluxos), "fluxos extraídos", `${n(exp.dados.principais)} principais`],
          [n(execucoes || 0), "execuções de teste", "cenários C1–C4 e X1 · 5 sementes"],
          ["32 × 4", "matriz por fluxo", "primeiros 32 pacotes com carga"],
        ].map(([valor, rotulo, detalhe]) => <div key={rotulo} className={s.number}>
          <strong className="display">{valor}</strong><span>{rotulo}</span><small className="font-mono">{detalhe}</small>
        </div>)}
      </div>
    </section>}

    <section className="app-container">
      <Reveal className={s.section}>
        <header className={s.sectionHead}><span className="eyebrow">01 · O que o feixe enxerga</span>
          <h2 className={`display ${s.h2}`}>Quatro medidas por pacote. Nenhuma delas é o conteúdo.</h2></header>
        <div className={s.channels}>
          <article><div className={s.glyphSize}><i style={{ width: "88%" }} /><i style={{ width: "22%" }} /><i style={{ width: "54%" }} /></div>
            <h3>Tamanho</h3><p>Bytes de carga útil de cada pacote, divididos por 1.500 e limitados a ±1.</p></article>
          <article><div className={s.glyphDir}><b>↑</b><b className={s.down}>↓</b><b>↑</b></div>
            <h3>Direção</h3><p>O sinal do tamanho: quem abriu a conversa é o cliente (+), a resposta é o servidor (−).</p></article>
          <article><div className={s.glyphTime}>{[2, 14, 3, 30, 6, 2, 18].map((w, i) => <i key={i} style={{ marginRight: w }} />)}</div>
            <h3>Ritmo</h3><p>O intervalo desde o pacote anterior, em log(1 + ms). VoIP pulsa; transferência despeja.</p></article>
          <article className={s.locked}><div className={s.glyphLock} aria-hidden>9f3a·c0e1·77b4·2d90</div>
            <h3>Conteúdo</h3><p>Fica cifrado e é descartado na leitura. O modelo nunca vê payload, IP ou porta.</p></article>
        </div>
      </Reveal>

      <Reveal className={s.section}>
        <header className={s.sectionHead}><span className="eyebrow">02 · Três leituras do mesmo fluxo</span>
          <h2 className={`display ${s.h2}`}>Um método clássico, uma rede neural e a mesma rede com pré-treino.</h2></header>
        <div className={s.models}>
          <article><span className="ui-chip ui-chip--b1">B1</span><h3>Random Forest</h3>
            <p>300 árvores votam a partir de 11 estatísticas do fluxo: contagem, média, desvio, mínimo e máximo de tamanho e intervalo.</p></article>
          <article><span className="ui-chip ui-chip--b2">B2</span><h3>CNN 1D</h3>
            <p>Três camadas convolucionais percorrem a sequência de 32 pacotes procurando padrões locais, treinadas só com rótulos.</p></article>
          <article><span className="ui-chip ui-chip--p">P</span><h3>CNN 1D + pré-treino</h3>
            <p>A mesma rede, mas antes aprende sozinha: esconde 15% dos pacotes e tenta reconstruí-los, sem nenhum rótulo.</p></article>
        </div>
      </Reveal>

      <Reveal className={s.section}>
        <header className={s.sectionHead}><span className="eyebrow">03 · Como a análise acontece</span>
          <h2 className={`display ${s.h2}`}>Da captura bruta ao veredito, sem atalhos.</h2></header>
        <ol className={s.steps}>
          {[
            ["Capturas", "Lê cada .pcap, ignora DNS, DHCP e afins, e descarta pacotes sem carga."],
            ["Fluxos", "Agrupa pacotes pela conversa (5-tupla) até FIN, RST ou 60 s de silêncio."],
            ["Matriz", "Converte os 32 primeiros pacotes de cada fluxo numa matriz 32 × 4."],
            ["Treino e teste", "Divide por sessão, para nenhuma conversa estar no treino e no teste."],
            ["Veredito", "Compara os modelos em 5 sementes, com teste pareado e correção de Holm."],
          ].map(([t, d], i) => <li key={t}><span className="font-mono">{String(i + 1).padStart(2, "0")}</span><h3>{t}</h3><p>{d}</p></li>)}
        </ol>
      </Reveal>
    </section>

    <section className={s.cta}>
      <div className={`app-container ${s.ctaInner}`}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.ctaLogo} src="/brand/raio-x-logo-dark.svg" alt="Raio-X do Tráfego" width={119} height={48} />
          <h2 className={`display ${s.ctaTitle}`}>Coloque o tráfego no raio-X.</h2></div>
        <div className={s.actions}>
          <Link href="/analise" className={`ui-button ${s.ctaPrimary}`}>Iniciar análise <span className="ui-button__arrow" aria-hidden>→</span></Link>
          <Link href="/enviar" className={`ui-button ${s.ctaSecondary}`}>Enviar um .zip</Link>
        </div>
      </div>
    </section>
  </>;
}
