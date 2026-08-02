import { VenueEditor } from "@/components/VenueEditor";

export default async function VenueEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VenueEditor venueId={id} />;
}
