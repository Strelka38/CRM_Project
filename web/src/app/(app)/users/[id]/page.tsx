import { EmployeeEditor } from "@/components/EmployeeEditor";

export default async function UserEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmployeeEditor userId={id} isManager />;
}
