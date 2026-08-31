export function isVacantStaff(a: {
  userId?: string | null;
  isFreelancer?: boolean;
}): boolean {
  return !a.userId && !a.isFreelancer;
}

/** Монтажники (слот MOUNT или должность «монтажник») не подсвечивают мероприятие. */
export function isInstallerStaff(a: {
  kind?: string | null;
  specialtyName?: string | null;
  specialty?: { name?: string | null } | null;
}): boolean {
  if (String(a.kind || "").toUpperCase() === "MOUNT") return true;
  const name =
    String(a.specialtyName || "").trim() ||
    String(a.specialty?.name || "").trim();
  return /монтажн/i.test(name);
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
    dayIndex?: number | null;
    specialtyName?: string | null;
    specialty?: { name?: string | null } | null;
  }>,
): string[] {
  const event = assignments
    .filter(isVacantStaff)
    .filter((a) => !isInstallerStaff(a));
  const perDay = event
    .map((a) => Number(a.dayIndex))
    .filter((n) => Number.isFinite(n) && n >= 1);
  const eventForLabels =
    perDay.length > 0
      ? event.filter((a) => Number(a.dayIndex) === Math.min(...perDay))
      : event;
  return eventForLabels.map(staffRoleLabel);
}
