import { VehicleEditor } from "@/components/VehicleEditor";

export default async function VehicleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VehicleEditor vehicleId={id} />;
}
