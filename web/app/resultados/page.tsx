import Link from "next/link";
import { Resultados } from "@/components/raiox/Resultados";
import { carregarResultadosEstudo } from "@/lib/experimento";

export const metadata = { title: "Resultados" };

export default function Page() {
  const exp = carregarResultadosEstudo();
  if (!exp) return <div className="ui-state"><h1 className="ui-state__title">Resultados ainda não disponíveis</h1>
    <p className="ui-state__description">As tabelas finais do estudo ainda não estão disponíveis neste ambiente.</p>
    <Link className="ui-button ui-button--secondary" href="/">Voltar ao início</Link></div>;
  return <Resultados exp={exp} />;
}
