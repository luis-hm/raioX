import { AnalysisView } from "@/components/ui/AnalysisView";
import { fluxosDemo } from "@/lib/experimento";

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedTab = Array.isArray(query.aba) ? query.aba[0] : query.aba;
  const tab = requestedTab === "fluxos" || requestedTab === "mapa" ? requestedTab : "geral";
  return <AnalysisView id={id} tab={tab} vitrine={fluxosDemo().slice(0, 30)} />;
}
