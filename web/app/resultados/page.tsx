import Link from "next/link";
import { Resultados } from "@/components/raiox/Resultados";
import { carregarExperimento } from "@/lib/experimento";

export const metadata = { title: "Resultados" };

export default function Page() {
  const exp = carregarExperimento();
  if (!exp) return <div className="ui-state"><h1 className="ui-state__title">Resultados ainda não disponíveis</h1>
    <p className="ui-state__description">A análise das capturas do ISCX ainda não terminou neste ambiente.</p>
    <Link className="ui-button ui-button--secondary" href="/">Voltar ao início</Link></div>;
  const { execucoes, amostra, dados, ...resto } = exp;
  return <Resultados exp={{ ...resto, n_execucoes: execucoes.length,
    dados: { fluxos: dados.fluxos, capturas: dados.capturas_incluidas, completos_32: dados.completos_32, por_categoria: dados.por_categoria } }} />;
}
