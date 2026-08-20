import type { Prisma, PrismaClient } from "@prisma/client";
import { calcBlock, blocksInActiveZones } from "@/lib/quote-calc";

export type AssignmentKindValue = "EVENT" | "MOUNT";

export type SlotExisting = {
  id: string;
  specialtyId: string;
  kind: AssignmentKindValue;
  userId: string | null;
  isFreelancer: boolean;
  freelancerName: string;
};

export type DesiredSlots = {
  specialtyId: string;
  kind: AssignmentKindValue;
  qty: number;
};

export type SlotPlan = {
  create: Array<{ specialtyId: string; kind: AssignmentKindValue }>;
  deleteIds: string[];
  watermarks: SlotWatermarks;
};

/** Ключ: "MOUNT:specialtyId" → сколько слотов уже импортировали из сметы. */
export type SlotWatermarks = Record<string, number>;

export function slotWatermarkKey(
  kind: AssignmentKindValue,
  specialtyId: string,
): string {
  return `${kind}:${specialtyId}`;
}

export function parseSlotWatermarks(raw: unknown): SlotWatermarks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SlotWatermarks = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (!k || !Number.isFinite(n) || n < 0) continue;
    out[k] = Math.round(n);
  }
  return out;
}

export function watermarksEqual(a: SlotWatermarks, b: SlotWatermarks): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  }
  return true;
}

const MOUNT_NAME_RE = /монтаж|пусконал|риггинг|rigg/i;

/** Роли персонала (услуги/должности), не Zoom и не лицензии. */
const PERSONNEL_ROLE_RE =
  /звукар|звукореж|световик|светорежис|видеоинж|видеоопера|ведущ|вокал|диджей|\bdj\b|техник|оператор|режисс|инженер|монтажн|бригадир|декоратор|хореограф|грим/i;

const SKIP_SERVICE_RE = /zoom|лиценз|licence|license|трансфер|доставк/i;

export function normalizeSpecialtyName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

export function isMountPersonnelName(name: string): boolean {
  return MOUNT_NAME_RE.test(String(name || ""));
}

export function looksLikePersonnelRole(name: string): boolean {
  const n = String(name || "").trim();
  if (!n || SKIP_SERVICE_RE.test(n)) return false;
  return PERSONNEL_ROLE_RE.test(n) || isMountPersonnelName(n);
}

export function slotLabelName(block: {
  name?: string | null;
  title?: string | null;
  catalogName?: string | null;
}): string {
  return (
    String(block.catalogName || "").trim() ||
    String(block.name || "").trim() ||
    String(block.title || "").trim()
  );
}

/**
 * PERSONNEL / релевантные услуги персонала → EVENT.
 * Монтаж в названии (и PERSONNEL с «монтаж») → MOUNT.
 */
export function classifyPersonnelBlock(block: {
  type?: string | null;
  name?: string | null;
  title?: string | null;
  catalogName?: string | null;
  itemKind?: string | null;
}): AssignmentKindValue | null {
  const type = String(block.type || "").toUpperCase();
  if (type !== "ITEM" && type !== "KIT_HEADER") return null;
  const kind = String(block.itemKind || "").toUpperCase();
  const label = slotLabelName(block);
  if (!label) return null;

  if (isMountPersonnelName(label)) {
    if (kind === "PERSONNEL" || kind === "SERVICE" || looksLikePersonnelRole(label)) {
      return "MOUNT";
    }
    return null;
  }

  if (kind === "PERSONNEL") return "EVENT";
  if (kind === "SERVICE" && looksLikePersonnelRole(label)) return "EVENT";
  return null;
}

export function findBestSpecialty<T extends { id: string; name: string }>(
  label: string,
  specialties: T[],
): T | null {
  const n = normalizeSpecialtyName(label);
  if (!n) return null;
  const exact = specialties.find((s) => normalizeSpecialtyName(s.name) === n);
  if (exact) return exact;

  const fuzzy = specialties
    .filter((s) => {
      const sn = normalizeSpecialtyName(s.name);
      if (sn.length < 4) return false;
      return n.includes(sn) || sn.includes(n);
    })
    .sort(
      (a, b) =>
        normalizeSpecialtyName(b.name).length -
        normalizeSpecialtyName(a.name).length,
    );
  if (fuzzy[0]) return fuzzy[0];

  const prefix = specialties.filter((s) => {
    const sn = normalizeSpecialtyName(s.name);
    if (sn.length < 4 || n.length < 4) return false;
    return sn.slice(0, 4) === n.slice(0, 4);
  });
  return prefix[0] ?? null;
}

export function isFilledSlot(a: {
  userId?: string | null;
  isFreelancer?: boolean | null;
  freelancerName?: string | null;
}): boolean {
  if (a.userId) return true;
  if (a.isFreelancer && String(a.freelancerName || "").trim()) return true;
  return false;
}

function slotQty(raw: number | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.round(n));
}

export function groupDesiredQty(
  items: Array<{ specialtyId: string; kind: AssignmentKindValue; qty: number }>,
): DesiredSlots[] {
  const map = new Map<string, DesiredSlots>();
  for (const item of items) {
    const qty = slotQty(item.qty);
    if (qty <= 0 || !item.specialtyId) continue;
    const key = `${item.kind}:${item.specialtyId}`;
    const prev = map.get(key);
    if (prev) prev.qty += qty;
    else map.set(key, { specialtyId: item.specialtyId, kind: item.kind, qty });
  }
  return [...map.values()];
}

/**
 * EVENT: qty — источник истины (сначала снимаем пустые).
 * MOUNT: импорт из сметы один раз. Watermark не уменьшается —
 * удалённые слоты не добираются. Рост qty в смете добавляет только дельту.
 * Лишние слоты бригадира не трогаем.
 */
export function planSlotSync(
  existing: SlotExisting[],
  desired: DesiredSlots[],
  watermarks: SlotWatermarks = {},
): SlotPlan {
  const create: SlotPlan["create"] = [];
  const deleteIds: string[] = [];
  const nextWatermarks: SlotWatermarks = { ...watermarks };
  const desiredKeys = new Set(desired.map((d) => `${d.kind}:${d.specialtyId}`));

  for (const d of desired) {
    const rows = existing.filter(
      (a) => a.kind === d.kind && a.specialtyId === d.specialtyId,
    );
    const qty = Math.max(0, Math.round(d.qty) || 0);
    if (d.kind === "MOUNT") {
      const key = slotWatermarkKey("MOUNT", d.specialtyId);
      const hasPrev = Object.prototype.hasOwnProperty.call(watermarks, key);
      let imported = hasPrev ? Math.max(0, watermarks[key] ?? 0) : 0;
      if (!hasPrev && rows.length > 0) {
        // Старые КП без watermark: не заполнять уже удалённые слоты.
        imported = Math.max(rows.length, qty);
      }
      const missing = Math.max(0, qty - imported);
      for (let i = 0; i < missing; i++) {
        create.push({ specialtyId: d.specialtyId, kind: "MOUNT" });
      }
      nextWatermarks[key] = Math.max(imported, qty);
      continue;
    }

    const filled = rows.filter(isFilledSlot);
    const empty = rows.filter((a) => !isFilledSlot(a));
    if (rows.length < qty) {
      for (let i = 0; i < qty - rows.length; i++) {
        create.push({ specialtyId: d.specialtyId, kind: "EVENT" });
      }
      continue;
    }
    if (rows.length <= qty) continue;

    let overflow = rows.length - qty;
    const emptyNewestFirst = [...empty].reverse();
    for (const slot of emptyNewestFirst) {
      if (overflow <= 0) break;
      deleteIds.push(slot.id);
      overflow -= 1;
    }
    if (overflow > 0 && filled.length > qty) {
      const extraFilled = filled.length - qty;
      const toDrop = Math.min(overflow, extraFilled);
      const filledNewestFirst = [...filled].reverse();
      for (let i = 0; i < toDrop; i++) {
        deleteIds.push(filledNewestFirst[i].id);
      }
    }
  }

  // EVENT-специальности, исчезнувшие из сметы: снимаем только пустые
  const existingGroups = new Map<string, SlotExisting[]>();
  for (const a of existing) {
    const key = `${a.kind}:${a.specialtyId}`;
    const list = existingGroups.get(key) ?? [];
    list.push(a);
    existingGroups.set(key, list);
  }
  for (const [key, rows] of existingGroups) {
    if (desiredKeys.has(key)) continue;
    const [kind] = key.split(":") as [AssignmentKindValue, string];
    if (kind !== "EVENT") continue;
    for (const slot of rows) {
      if (!isFilledSlot(slot)) deleteIds.push(slot.id);
    }
  }

  return {
    create,
    deleteIds: [...new Set(deleteIds)],
    watermarks: nextWatermarks,
  };
}

export type PersonnelBlockInput = {
  type?: string | null;
  name?: string | null;
  title?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  dayMode?: string | null;
  dayCoefOverride?: number | null;
  itemKind?: string | null;
  catalogName?: string | null;
  zoneId?: string | null;
};

export function collectPersonnelSlotRequests(
  blocks: PersonnelBlockInput[],
): Array<{
  label: string;
  kind: AssignmentKindValue;
  qty: number;
  block: PersonnelBlockInput;
}> {
  const out: Array<{
    label: string;
    kind: AssignmentKindValue;
    qty: number;
    block: PersonnelBlockInput;
  }> = [];
  for (const block of blocks) {
    const kind = classifyPersonnelBlock(block);
    if (!kind) continue;
    const qty = slotQty(block.qty);
    if (qty <= 0) continue;
    const label = slotLabelName(block);
    if (!label) continue;
    out.push({ label, kind, qty, block });
  }
  return out;
}

export function montageBudgetFromBlocks(
  blocks: PersonnelBlockInput[],
  durationDays: number,
): number {
  let total = 0;
  for (const block of blocks) {
    if (classifyPersonnelBlock(block) !== "MOUNT") continue;
    const calc = calcBlock(
      {
        type: "ITEM",
        sortOrder: 0,
        name: slotLabelName(block),
        qty: block.qty ?? 0,
        unitPrice: block.unitPrice ?? 0,
        dayMode: block.dayMode ?? "FIXED1",
        dayCoefOverride: block.dayCoefOverride ?? null,
        itemKind: block.itemKind,
      },
      false,
      durationDays,
    );
    total += calc.lineTotalCash;
  }
  return Math.round(total);
}

export function recommendedMountQty(blocks: PersonnelBlockInput[]): number {
  return collectPersonnelSlotRequests(blocks)
    .filter((r) => r.kind === "MOUNT")
    .reduce((s, r) => s + r.qty, 0);
}

export async function ensureMountSpecialtyId(tx: Tx): Promise<string> {
  const list = await tx.specialty.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
  const found = list.find((s) => isMountPersonnelName(s.name));
  if (found) return found.id;
  const created = await tx.specialty.create({
    data: {
      name: "Монтажник",
      sortOrder: 90,
      active: true,
    },
    select: { id: true },
  });
  return created.id;
}

type Tx = Prisma.TransactionClient | PrismaClient;

async function resolveSpecialtyId(
  tx: Tx,
  label: string,
  cache: Map<string, { id: string; name: string }>,
): Promise<string> {
  const n = normalizeSpecialtyName(label);
  const hit = [...cache.values()].find(
    (s) => normalizeSpecialtyName(s.name) === n,
  );
  if (hit) return hit.id;

  const list = [...cache.values()];
  const best = findBestSpecialty(label, list);
  if (best) return best.id;

  try {
    const created = await tx.specialty.create({
      data: {
        name: label.trim().slice(0, 80) || "Должность",
        sortOrder: 1000 + cache.size,
        active: true,
      },
      select: { id: true, name: true },
    });
    cache.set(created.id, created);
    return created.id;
  } catch {
    const again = await tx.specialty.findMany({
      select: { id: true, name: true },
    });
    for (const s of again) cache.set(s.id, s);
    const retry =
      findBestSpecialty(label, again) ||
      again.find((s) => normalizeSpecialtyName(s.name) === n);
    if (retry) return retry.id;
    throw new Error(`Не удалось создать должность «${label}»`);
  }
}

/** Upsert пустых слотов по PERSONNEL/монтажу из активных зон сметы. */
export async function syncQuoteAssignmentSlots(
  tx: Tx,
  quoteId: string,
): Promise<SlotPlan> {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    select: {
      durationDays: true,
      assignmentImportWatermark: true,
      zones: { select: { id: true, active: true } },
      blocks: {
        select: {
          type: true,
          name: true,
          title: true,
          qty: true,
          unitPrice: true,
          dayMode: true,
          dayCoefOverride: true,
          zoneId: true,
          catalogItem: { select: { name: true, itemKind: true } },
        },
      },
      assignments: {
        select: {
          id: true,
          specialtyId: true,
          kind: true,
          userId: true,
          isFreelancer: true,
          freelancerName: true,
        },
      },
    },
  });
  if (!quote) {
    return { create: [], deleteIds: [], watermarks: {} };
  }

  const activeBlocks = blocksInActiveZones(quote.zones, quote.blocks);
  const requests = collectPersonnelSlotRequests(
    activeBlocks.map((b) => ({
      type: b.type,
      name: b.name,
      title: b.title,
      qty: b.qty,
      unitPrice: b.unitPrice,
      dayMode: b.dayMode,
      dayCoefOverride: b.dayCoefOverride,
      itemKind: b.catalogItem?.itemKind ?? null,
      catalogName: b.catalogItem?.name ?? null,
      zoneId: b.zoneId,
    })),
  );

  const specialties = await tx.specialty.findMany({
    select: { id: true, name: true },
  });
  const cache = new Map(specialties.map((s) => [s.id, s]));

  const desiredParts: Array<{
    specialtyId: string;
    kind: AssignmentKindValue;
    qty: number;
  }> = [];
  for (const req of requests) {
    const specialtyId = await resolveSpecialtyId(tx, req.label, cache);
    desiredParts.push({ specialtyId, kind: req.kind, qty: req.qty });
  }
  const desired = groupDesiredQty(desiredParts);

  const existing: SlotExisting[] = quote.assignments.map((a) => ({
    id: a.id,
    specialtyId: a.specialtyId,
    kind: (a.kind as AssignmentKindValue) || "EVENT",
    userId: a.userId,
    isFreelancer: a.isFreelancer,
    freelancerName: a.freelancerName,
  }));

  const prevWatermarks = parseSlotWatermarks(quote.assignmentImportWatermark);
  const plan = planSlotSync(existing, desired, prevWatermarks);
  if (plan.deleteIds.length > 0) {
    await tx.quoteAssignment.deleteMany({
      where: { id: { in: plan.deleteIds }, quoteId },
    });
  }
  if (plan.create.length > 0) {
    await tx.quoteAssignment.createMany({
      data: plan.create.map((c) => ({
        quoteId,
        userId: null,
        specialtyId: c.specialtyId,
        kind: c.kind,
        payMode: "SHIFT",
        hours: null,
        rateOverride: null,
        isFreelancer: false,
        freelancerName: "",
        owners: [],
      })),
    });
  }
  if (!watermarksEqual(prevWatermarks, plan.watermarks)) {
    await tx.quote.update({
      where: { id: quoteId },
      data: { assignmentImportWatermark: plan.watermarks },
    });
  }
  return plan;
}
