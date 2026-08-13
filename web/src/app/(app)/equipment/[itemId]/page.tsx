import { EquipmentItemPage } from "@/components/EquipmentItemPage";

export default async function EquipmentItemRoute({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <EquipmentItemPage itemId={itemId} />;
}
