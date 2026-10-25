import Link from "next/link";
import { AnaliseAoVivo } from "@/components/raiox/AnaliseAoVivo";
import { carregarExperimento } from "@/lib/experimento";

export const metadata = { title: "Análise" };

export default function Page() {
  const exp = carregarExperimento();
  if (!exp) return <div className="app-container app-main">
    <div className="ui-state"><h1 className="ui-state__title">Análise ainda não disponível</h1>
      <p className="ui-state__description">O processamento das capturas do ISCX ainda não terminou neste ambiente.</p>
      <Link className="ui-button ui-button--secondary" href="/enviar">Enviar minhas capturas</Link></div>
  </div>;

  const c1 = (m: "B1" | "B2" | "P") => exp.medias.find(r => r.grupo === "N" && r.fracao_rotulos === 1 && r.metodo === m)?.media ?? 0;
  return <AnaliseAoVivo dados={{
    capturas: exp.dados.capturas,
    totais: { capturas: exp.dados.capturas_incluidas, tamanho_gb: exp.dados.tamanho_gb, fluxos: exp.dados.fluxos,
      principais: exp.dados.principais, extras: exp.dados.extras, sessoes: exp.particoes_N_s0.sessoes },
    particoes: exp.particoes_N_s0,
    amostra: exp.amostra.map(f => ({ rotulo: f.rotulo, pacotes: f.pacotes, palpites: f.palpites })),
    execucoes: exp.execucoes.map(e => ({ cenario: e.cenario, metodo: e.metodo })),
    passos: exp.passos.escolhidos,
    pretreino: exp.pretreino_N_s0.hist,
    macroF1: { B1: c1("B1"), B2: c1("B2"), P: c1("P") },
  }} />;
}
