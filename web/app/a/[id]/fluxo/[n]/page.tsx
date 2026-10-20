import { notFound } from "next/navigation";
import { FlowDetails } from "@/components/ui/FlowDetails";

export const metadata = { title: "Detalhe do fluxo" };

export default async function FlowPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  if (!/^\d+$/.test(n) || !Number.isSafeInteger(Number(n)) || Number(n) < 0) notFound();
  return <FlowDetails id={id} n={Number(n)} />;
}
