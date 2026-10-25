import Link from "next/link";
import { carregarExperimento } from "@/lib/experimento";
import s from "@/components/raiox/metodo.module.css";

export const metadata = { title: "Metodologia" };

const NOME: Record<string, string> = { chat: "Chat", email: "E-mail", transferencia: "Transferência", streaming: "Streaming", voip: "VoIP" };
const n = (v: number) => v.toLocaleString("pt-BR");
const SECOES = [
  ["problema", "O problema"], ["base", "Base de dados"], ["extracao", "Extração dos fluxos"], ["matriz", "Matriz 32 × 4"],
  ["divisao", "Divisão sem vazamento"], ["metodos", "Os três métodos"], ["cenarios", "Cenários"], ["estatistica", "Análise estatística"], ["limites", "Limitações"],
] as const;

export default function Page() {
  const exp = carregarExperimento();
  const d = exp?.dados;
  const contagem = (c: string) => exp?.execucoes.filter(e => e.cenario === c).length ?? 0;

  return <div className={s.page}>
    <header className={s.head}>
      <p className="eyebrow">Metodologia</p>
      <h1 className="display">Como o raio-X foi feito.</h1>
      <p className={s.lead}>O protocolo foi definido antes de rodar os experimentos e seguido do pcap bruto até o teste estatístico.
        Os números desta página são os desta execução{d ? `: ${n(d.capturas_incluidas)} capturas, ${n(d.fluxos)} fluxos e ${n(exp!.execucoes.length)} execuções` : ""}.</p>
    </header>

    <div className={s.layout}>
      <nav className={s.toc} aria-label="Seções">
        <ol>{SECOES.map(([id, t], i) => <li key={id}><a href={`#${id}`}><span className="font-mono">{String(i + 1).padStart(2, "0")}</span>{t}</a></li>)}</ol>
      </nav>

      <article className={s.body}>
        <section id="problema"><h2>O problema</h2>
          <p>A criptografia esconde o conteúdo dos pacotes, mas a rede continua vendo o comportamento: tamanho, direção, intervalo e duração.
            A pergunta do trabalho é se um <b>pré-treino auto-supervisionado</b> — esconder pacotes e pedir que a rede os reconstrua, sem rótulos —
            melhora a classificação quando há poucos rótulos, aplicações novas ou perda de pacotes.</p>
          <p>Quatro hipóteses foram registradas antes: H1 (poucos rótulos), H2 (aplicações não vistas), H3 (perda de pacotes) e H4 (custo).
            O veredito de cada uma está em <Link href="/resultados">Resultados</Link>.</p>
        </section>

        <section id="base"><h2>Base de dados</h2>
          <p>ISCX VPN-nonVPN (2016), só o tráfego sem VPN{d ? `: ${n(d.capturas_total)} capturas, ${d.tamanho_gb.toLocaleString("pt-BR")} GB` : ""}.
            A base não tem coluna de categoria; o rótulo vem do nome do arquivo. {d ? `${n(d.excluidas.length)} videochamadas` : "As videochamadas"} ficam
            de fora porque podem ser VoIP ou streaming. Os arquivos “a” e “b” de uma gravação são a mesma sessão registrada em duas pontas.</p>
          {d && <div className="ui-table-scroll"><table className="ui-table">
            <thead><tr><th>Categoria</th><th>Aplicação</th><th>Arquivos</th><th>Sessões</th><th>Fluxos</th></tr></thead>
            <tbody>{d.por_aplicacao.map(r => <tr key={r.categoria + r.aplicacao}><td>{NOME[r.categoria]}</td><td>{r.aplicacao}</td>
              <td className="font-mono">{r.arquivos}</td><td className="font-mono">{r.sessoes}</td><td className="font-mono">{n(r.fluxos)}</td></tr>)}</tbody>
          </table></div>}
        </section>

        <section id="extracao"><h2>Extração dos fluxos</h2>
          <dl className={s.params}>
            {[["Pacotes lidos", "TCP e UDP, IPv4 e IPv6"], ["Serviços removidos", "portas 53, 5353, 5355, 137–139, 1900, 67 e 68"],
              ["Sem carga útil", "descartados (SYN, ACK puro); o handshake TLS com carga fica"], ["Fluxo", "5-tupla bidirecional, fecha em FIN, RST ou 60 s de silêncio"],
              ["Mínimo", "3 pacotes com carga"], ["Guardados", "até 100 pacotes por fluxo"], ["Teto", "3 mi de pacotes e 2.000 fluxos por captura; os 500 primeiros são os principais"],
              ["Direção", "quem envia o primeiro pacote com carga é o cliente (+)"], ["Privacidade", "IP e porta só agrupam, em memória; nada de payload é gravado"],
            ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {d && <p className={s.note}>Nesta execução: {n(d.fluxos)} fluxos ({n(d.principais)} principais e {n(d.extras)} extras, usados só no pré-treino).
            {" "}{(d.acima_1500.acima_1500 / Math.max(1, d.acima_1500.pacotes_32) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% dos pacotes passavam de 1.500 bytes e foram limitados;
            só {(d.completos_32 * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos fluxos chegam a 32 pacotes.</p>}
        </section>

        <section id="matriz"><h2>Matriz 32 × 4</h2>
          <p>Cada fluxo vira uma matriz com os 32 primeiros pacotes com carga útil; fluxos curtos são completados com zeros.</p>
          <div className={s.channels}>
            {[["0", "Direção × tamanho ÷ 1.500", "limitado a ±1; positivo = cliente → servidor"], ["1", "log(1 + intervalo em ms)", "desde o pacote anterior; 0 no primeiro"],
              ["2", "Presença", "1 se há pacote na posição"], ["3", "Máscara", "sempre 0; vale 1 só nas posições escondidas do pré-treino"],
            ].map(([c, t, x]) => <div key={c}><span className="font-mono">canal {c}</span><strong>{t}</strong><p>{x}</p></div>)}
          </div>
          <p>A normalização (média e desvio dos canais 0 e 1) usa só as posições ocupadas do treino de cada cenário e semente.</p>
        </section>

        <section id="divisao"><h2>Divisão sem vazamento</h2>
          <p>Todas as divisões são por <b>sessão</b>, nunca por fluxo sorteado: se metade de uma conversa fosse para o treino e metade para o teste, o modelo
            reconheceria a conversa, não o tipo de tráfego. São cinco sementes (0 a 4) para três cenários:</p>
          <ul className={s.list}>
            <li><b>N — aplicações vistas.</b> Em cada aplicação, sessões sorteadas em ~70/15/15 (treino/validação/teste).
              {d ? ` Aplicações com menos de 3 sessões (${d.testes.blocos_temporais.join(", ")}) usam blocos temporais dentro de cada arquivo.` : ""}</li>
            <li><b>A1 e A2 — aplicações não vistas.</b> A1 retira Skype, YouTube e email1; A2 retira Facebook, FTPS, Netflix e email2. Elas ficam só no teste, fora do treino e do pré-treino.</li>
            <li><b>Frações de rótulos.</b> 1%, 5%, 10% e 100% do treino, estratificadas por classe (mínimo de 5), aninhadas e iguais para os três métodos.</li>
          </ul>
          {d && <p className={s.note}>Testes automáticos 1 a 4 (só matrizes e rótulos; nenhuma sessão em duas partições; pré-treino só com treino; frações aninhadas e reproduzíveis) passaram.
            Teste 5, cópias exatas entre treino e teste na semente 0: {Object.entries(d.testes.teste5).map(([k, v]) => `${k} ${v.duplicados}/${n(v.teste)}`).join(" · ")}.</p>}
        </section>

        <section id="metodos"><h2>Os três métodos</h2>
          <div className={s.methods}>
            <div><span className="ui-chip ui-chip--b1">B1</span><strong>Random Forest</strong><p>300 árvores, max_features √, classes balanceadas, sobre 11 estatísticas
              do fluxo: contagem; média, desvio, mínimo e máximo de tamanho e de intervalo; soma de tamanhos e de intervalos. Não usa a direção.</p></div>
            <div><span className="ui-chip ui-chip--b2">B2</span><strong>CNN 1D</strong><p>Três blocos Conv1D (4 → 64 → 128 → 128, kernel 3, BatchNorm, ReLU), média global e cabeça
              linear com dropout 0,3. AdamW (1e-3), entropia cruzada ponderada, lote de até 256 e número fixo de passos, sem parada antecipada.</p></div>
            <div><span className="ui-chip ui-chip--p">P</span><strong>CNN 1D + pré-treino</strong><p>Antes do ajuste, o encoder aprende a reconstruir 15% dos pacotes escondidos
              (30 épocas, lote 512, erro quadrático só nas posições mascaradas), sem rótulos e só com o treino. Depois, ajuste fino idêntico ao do B2.</p></div>
          </div>
          {exp && <p className={s.note}>A única escolha feita com dados foi o número de passos do ajuste, na validação de C1 (sementes 0–2): o menor número de passos a até 0,01 do melhor macro-F1 médio.
            Escolhidos: <b className="font-mono">{n(exp.passos.escolhidos)}</b> ({exp.passos.curva.map(c => `${n(c.passos)}: ${c.mean.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}`).join(" · ")}). O teste nunca foi usado para escolher nada.</p>}
        </section>

        <section id="cenarios"><h2>Cenários</h2>
          <div className="ui-table-scroll"><table className="ui-table">
            <thead><tr><th>Cenário</th><th>Pergunta</th><th>Divisão</th><th>Rótulos</th><th>Execuções</th></tr></thead>
            <tbody>{[["C1", "Referência", "N", "100%", contagem("C1")], ["C2", "Poucos rótulos (H1)", "N", "1%, 5%, 10%", contagem("C2")],
              ["C3", "Aplicações não vistas (H2)", "A1, A2", "10%, 100%", contagem("C3")], ["C4", "Perda de 0, 10 e 20% no teste (H3)", "N", "10%, 100%", contagem("C4")],
              ["C5", "Custo de inferência e treino (H4)", "C1", "100%", "agrega C1"], ["X1", "Encoder congelado", "N", "1% a 100%", contagem("X1")],
            ].map(r => <tr key={String(r[0])}>{r.map((c, i) => <td key={i} className={i === 0 || i === 4 ? "font-mono" : undefined}>{c}</td>)}</tr>)}</tbody>
          </table></div>
          <p className={s.note}>Na perda de pacotes, cada pacote do teste some com probabilidade p antes do corte em 32 e os intervalos são recalculados; o sorteio é o mesmo para todos os métodos da semente.</p>
        </section>

        <section id="estatistica"><h2>Análise estatística</h2>
          <p>A unidade é o macro-F1 no teste de cada semente, pareado entre métodos. Para cada comparação (P − B2, P − B1 e P congelado − B2 congelado):
            teste <i>t</i> pareado bilateral, α = 0,05, intervalo de 95% com 4 graus de liberdade e correção de Holm dentro de cada família
            (as frações de um mesmo grupo). Relevância prática: diferença de pelo menos 2 pontos percentuais.</p>
          <p>Cada comparação recebe um veredito: <b>significativa e relevante</b>, <b>significativa, mas &lt; 2 pp</b>, <b>relevante, mas não significativa</b> ou <b>sem evidência</b>.</p>
        </section>

        <section id="limites"><h2>Limitações</h2>
          <ul className={s.list}>
            <li>Base de laboratório de 2016: sem TLS 1.3 nem QUIC; em tráfego atual, os modelos podem errar mais.</li>
            <li>Parte do tráfego sem VPN pode não estar cifrada; como nenhum payload é guardado, isso não pôde ser verificado.</li>
            <li>Rótulos herdados do nome do arquivo, não verificados fluxo a fluxo.</li>
            <li>Cinco sementes dão pouco poder estatístico: ausência de significância não prova ausência de efeito.</li>
            <li>A perda de pacotes é simulada e uniforme; perdas reais vêm em rajadas e com retransmissões.</li>
            <li>Os primeiros pacotes, que incluem o handshake, pesam muito; o modelo pode estar aprendendo mais o início da conexão que o comportamento.</li>
          </ul>
          {exp && <p className={s.note}>Execução: {exp.hardware} · {new Date(exp.gerado_em).toLocaleString("pt-BR")}.</p>}
        </section>
      </article>
    </div>
  </div>;
}
