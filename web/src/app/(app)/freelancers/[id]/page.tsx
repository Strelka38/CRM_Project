import { FreelancerEditor } from "@/components/FreelancerEditor";

export default async function FreelancerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FreelancerEditor freelancerId={id} />;
}
