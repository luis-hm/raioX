import { Card } from "@/components/ui/Card";
import { MethodologyResults } from "@/components/ui/MethodologyResults";
import { loadResults } from "@/lib/results";

export const metadata = { title: "Metodologia e resultados" };

export default function MethodologyPage() {
  const results = loadResults();
  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="ui-card"><p className="label-small text-accent">O experimento</p><h1 className="text-3xl">Como ler os resultados</h1>
      <p>O estudo classificou tráfego por metadados: tamanho, direção e tempo dos pacotes. B1 usa estatísticas; B2 usa uma CNN; P usa uma CNN com pré-treino e ajuste fino. A divisão foi por sessão e cada condição foi avaliada em cinco sementes.</p>
      <p className="text-sm text-text-muted">Fonte: {results.source}. Os pilotos e os resultados anteriores à correção de P ficam fora desta página.</p></header>
    <div className="grid gap-4 md:grid-cols-2"><Card title="O que é medido no estudo">
      <p>Macro-F1 é uma medida de desempenho em dados rotulados, calculada no conjunto de teste. Médias, dispersão, intervalos e testes pareados resumem as execuções corrigidas.</p></Card>
      <Card title="O que é um palpite da aplicação"><p>Na sua captura, cada modelo devolve uma classe e probabilidades não calibradas por fluxo. Sem rótulos conferidos, a página não sabe se acertou. Os classificadores locais foram reconstituídos e não reproduziram exatamente as previsões do estudo.</p></Card></div>
    <MethodologyResults results={results} />
    <Card title="Hipóteses e leitura dos resultados"><ul className="space-y-2 text-sm">
      <li><strong>H1:</strong> não sustentada pelo conjunto de comparações corrigidas.</li>
      <li><strong>H2:</strong> não sustentada; a vantagem de P sobre B2 varia entre condições e sementes.</li>
      <li><strong>H3:</strong> não sustentada; sob perda de pacotes, a diferença de queda não foi estatisticamente confirmada após correção.</li>
      <li><strong>H4:</strong> confirmada pela arquitetura e pelo custo de inferência semelhante de B2/P, sem teste estatístico específico. Na condição C1 N/100%, média de tempo de inferência: B2 {results.cost.B2?.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) ?? "—"} ms; P {results.cost.P?.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) ?? "—"} ms, nas medições do relatório.</li>
    </ul></Card>
    <Card title="Da captura à matriz 32 × 4"><p>Até 32 pacotes com carga útil por fluxo entram na matriz. Os canais representam tamanho com direção, intervalo relativo, presença e máscara; a máscara é zero na inferência. Apenas 15,6% dos fluxos do estudo chegaram a 32 pacotes.</p>
      <p>O estudo não verificou TLS em todas as capturas sem VPN. A base ISCX é de 2016; aplicações e protocolos atuais, como QUIC/TLS 1.3, podem se comportar de outro modo. Os intervalos e vereditos descrevem o estudo, não uma garantia para capturas novas.</p></Card>
  </div>;
}
