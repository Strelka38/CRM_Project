import { LegalEntityEditor } from "@/components/LegalEntityEditor";

export default async function LegalEntityEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LegalEntityEditor entityId={id} />;
}
