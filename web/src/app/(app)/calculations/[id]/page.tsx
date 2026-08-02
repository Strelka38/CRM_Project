import { CalculationEditor } from "@/components/CalculationEditor";

export default async function CalculationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CalculationEditor quoteId={id} />;
}
