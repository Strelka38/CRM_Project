import { mountDutyFlags } from "@/lib/quote-assignments";

export type MountDuty = "mount" | "demount";

export type MountDutyFlags = { onMount: boolean; onDemount: boolean };

export type MountDutyRow = {
  id: string;
  userId: string | null;
  onMount?: boolean | null;
  onDemount?: boolean | null;
};

export type MountDutyOp =
  | { op: "fill"; id: string; flags: MountDutyFlags }
  | { op: "keepPerson"; id: string; flags: MountDutyFlags }
  | { op: "vacate"; id: string; flags: MountDutyFlags }
  | { op: "createFilled"; fromId: string; flags: MountDutyFlags }
  | { op: "createVacant"; fromId: string; flags: MountDutyFlags }
  | { op: "createFromPerson"; fromId: string; flags: MountDutyFlags }
  | { op: "delete"; id: string };

export function mountDutyOnly(duty: MountDuty): MountDutyFlags {
  return duty === "mount"
    ? { onMount: true, onDemount: false }
    : { onMount: false, onDemount: true };
}

export function addMountDuty(
  flags: MountDutyFlags,
  duty: MountDuty,
): MountDutyFlags {
  return duty === "mount"
    ? { ...flags, onMount: true }
    : { ...flags, onDemount: true };
}

function flagsOf(row: MountDutyRow): MountDutyFlags {
  return mountDutyFlags(row);
}

function bothDuties(flags: MountDutyFlags): boolean {
  return flags.onMount && flags.onDemount;
}

export function rowHasMountDuty(
  row: MountDutyRow | null | undefined,
  duty: MountDuty,
): boolean {
  if (!row) return false;
  const flags = flagsOf(row);
  return duty === "mount" ? flags.onMount : flags.onDemount;
}

/**
 * Назначение из сроста: только тот день, куда бросили.
 * Если этот человек уже стоит на другой части — сливаем в одну строку с двумя маркерами.
 */
export function planMountDutyAssign(opts: {
  duty: MountDuty;
  target: MountDutyRow;
  incomingUserId: string;
  existingSameUser: MountDutyRow | null;
}): MountDutyOp[] {
  const { duty, target, incomingUserId } = opts;
  const existing =
    opts.existingSameUser && opts.existingSameUser.id !== target.id
      ? opts.existingSameUser
      : null;
  const tFlags = flagsOf(target);
  const onlyDuty = mountDutyOnly(duty);
  const otherOnly = mountDutyOnly(duty === "mount" ? "demount" : "mount");
  const vacant = !target.userId;
  const sameUser = target.userId === incomingUserId;

  if (existing) {
    const ops: MountDutyOp[] = [
      {
        op: "fill",
        id: existing.id,
        flags: addMountDuty(flagsOf(existing), duty),
      },
    ];
    if (vacant || sameUser) {
      if (bothDuties(tFlags)) {
        ops.push({ op: "vacate", id: target.id, flags: otherOnly });
      } else {
        ops.push({ op: "delete", id: target.id });
      }
      return ops;
    }
    if (bothDuties(tFlags)) {
      ops.push({ op: "keepPerson", id: target.id, flags: otherOnly });
    } else {
      ops.push({ op: "vacate", id: target.id, flags: onlyDuty });
    }
    return ops;
  }

  if (sameUser) {
    return [{ op: "fill", id: target.id, flags: addMountDuty(tFlags, duty) }];
  }

  if (vacant) {
    if (bothDuties(tFlags)) {
      return [
        { op: "fill", id: target.id, flags: onlyDuty },
        { op: "createVacant", fromId: target.id, flags: otherOnly },
      ];
    }
    return [{ op: "fill", id: target.id, flags: onlyDuty }];
  }

  if (bothDuties(tFlags)) {
    return [
      { op: "keepPerson", id: target.id, flags: otherOnly },
      { op: "createFilled", fromId: target.id, flags: onlyDuty },
    ];
  }
  return [{ op: "fill", id: target.id, flags: onlyDuty }];
}

/** Снятие с одного дня: второй маркер остаётся, на снятый день остаётся пустой слот. */
export function planMountDutyUnassign(opts: {
  duty: MountDuty;
  target: MountDutyRow;
}): MountDutyOp[] {
  const { duty, target } = opts;
  if (!target.userId) return [];
  const tFlags = flagsOf(target);
  const onlyDuty = mountDutyOnly(duty);
  const otherOnly = mountDutyOnly(duty === "mount" ? "demount" : "mount");
  if (bothDuties(tFlags)) {
    return [
      { op: "createFromPerson", fromId: target.id, flags: otherOnly },
      { op: "vacate", id: target.id, flags: onlyDuty },
    ];
  }
  return [{ op: "vacate", id: target.id, flags: onlyDuty }];
}
