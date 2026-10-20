import type { Metadata } from "next";
import Link from "next/link";
import { FlowXRay } from "@/components/motion/FlowXRay";
import { DEMO_FLOW } from "@/components/motion/demo-data";
import { SharedMotionDemo } from "@/components/motion/SharedMotionDemo";
import styles from "@/components/motion/xray.module.css";

export const metadata: Metadata = { title: "Componentes · demonstração" };

export default function ComponentsPage() {
  return <>
    <SharedMotionDemo />
    <div className="mb-5"><Link href="/a/demonstracao/fluxo/1" className={styles.backLink}>Abrir a tela Raio-X →</Link></div>
    <div id="raio-x"><FlowXRay data={DEMO_FLOW} /></div>
    <section className={styles.demoNotes}>
      <h2>Contrato dos componentes</h2>
      <p><code>FlowXRay</code> recebe <code>FlowXRayData</code>: pacotes anônimos, matriz 32×4, prefixos de B1/B2/P e oclusão de B2/P para cada semente de 0 a 4.
        A ordem das cinco probabilidades é Chat, E-mail, Transferência, Streaming e VoIP. Nenhum componente busca dados ou executa modelos.</p>
      <p><code>PacketLadder</code> recebe <code>packets</code>, <code>activePacket</code> e <code>rootRef</code>.
        <code> MatrixGrid</code> recebe <code>rows</code>, <code>activePacket</code> e <code>rootRef</code>.
        As funções <code>animatePacketLadder</code> e <code>animateMatrixGrid</code> adicionam as etapas à mesma timeline,
        criada pelo consumidor dentro de <code>useGSAP</code> com escopo e limpeza.</p>
      <p><code>ProbBars</code> recebe <code>model</code>, <code>probabilities</code> e <code>animate</code>.
        Probabilidades nulas representam nenhum prefixo visto. A mola atua só em escala; pausas e buscas aplicam o valor imediatamente.</p>
      <p>Os dados em <code>demo-data.ts</code> são sintéticos e determinísticos. A matriz usa 24 pacotes e 8 linhas de preenchimento.
        A semente 3 inclui discordância ilustrativa. Ative movimento reduzido no sistema para conferir o estado final estático.</p>
      <p>O simulador local oferece 0%, 10% e 20% de perda visual e uma semente própria.
        <code> selectPacketLoss</code> retorna índices originais retidos/perdidos sobre toda a amostra, sem alterar os pacotes.
        A escada marca perdas com × e texto; a tabela continua acessível sem reprodução.
        A matriz, os palpites, os prefixos e as oclusões permanecem os da entrada original, sem reclassificação.</p>
      <details>
        <summary>Estados sem dados</summary>
        <div className="grid gap-4 mt-4">
          <FlowXRay status="loading" /><FlowXRay data={null} /><FlowXRay status="error" />
        </div>
      </details>
    </section>
  </>;
}
