export function isVacantStaff(a: {
  userId?: string | null;
  isFreelancer?: boolean;
}): boolean {
  return !a.userId && !a.isFreelancer;
}

export function staffRoleLabel(a: {
  kind?: string | null;
  specialtyName?: string | null;
  specialty?: { name?: string | null } | null;
}): string {
  if (String(a.kind || "").toUpperCase() === "MOUNT") return "монтажник";
  return (
    String(a.specialtyName || "").trim() ||
    String(a.specialty?.name || "").trim() ||
    "должность"
  );
}

/** «Видеоинженер ×2, звукооператор» */
export function formatVacantRoles(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const name = raw.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(", ");
}

export function vacantStaffLabels(
  assignments: Array<{
    userId?: string | null;
    isFreelancer?: boolean;
    kind?: string | null;
    specialtyName?: string | null;
    specialty?: { name?: string | null } | null;
  }>,
): string[] {
  return assignments.filter(isVacantStaff).map(staffRoleLabel);
}
