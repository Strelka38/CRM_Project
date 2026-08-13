import { PublicEquipmentQr } from "@/components/PublicEquipmentQr";

export default async function PublicQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <PublicEquipmentQr token={token} />
    </div>
  );
}
