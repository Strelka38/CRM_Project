import { ClientEditor } from "@/components/ClientEditor";

export default async function ClientEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientEditor clientId={id} />;
}
