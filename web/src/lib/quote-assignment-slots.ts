import type { Prisma, PrismaClient } from "@prisma/client";
import { calcBlock, blocksInActiveZones } from "@/lib/quote-calc";
import { normDayIndex, workingDayCount } from "@/lib/quote-assignment-days";

export type AssignmentKindValue = "EVENT" | "MOUNT";

export type SlotExisting = {
  id: string;
  specialtyId: string;
  kind: AssignmentKindValue;
  userId: string | null;
  isFreelancer: boolean;
  freelancerName: string;
  zoneId?: string | null;
  dayIndex?: number | null;
};

export type DesiredSlots = {
  specialtyId: string;
  kind: AssignmentKindValue;
  qty: number;
  zoneId?: string | null;
};

export type SlotPlan = {
  create: Array<{
    specialtyId: string;
    kind: AssignmentKindValue;
    zoneId?: string | null;
    dayIndex?: number | null;
  }>;
  deleteIds: string[];
  watermarks: SlotWatermarks;
};

/** Ключ: "MOUNT:specialtyId" или "MOUNT:specialtyId:zoneId". */
export type SlotWatermarks = Record<string, number>;

export function normZoneId(zoneId?: string | null): string | null {
  const z = String(zoneId || "").trim();
  return z || null;
}

export function slotGroupKey(
  kind: AssignmentKindValue,
  specialtyId: string,
  zoneId?: string | null,
): string {
  const z = normZoneId(zoneId);
  return z ? `${kind}:${specialtyId}:${z}` : `${kind}:${specialtyId}`;
}

export function slotWatermarkKey(
  kind: AssignmentKindValue,
  specialtyId: string,
  zoneId?: string | null,
): string {
  return slotGroupKey(kind, specialtyId, zoneId);
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
const MOUNT_NEGATION_RE = /без\s+монтаж\w*/gi;
const MOUNT_SERVICE_RE = /^(монтаж|демонтаж|риггинг|rigg|пусконал)/i;

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

function stripMountNegation(name: string): string {
  return String(name || "")
    .replace(MOUNT_NEGATION_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMountPersonnelName(name: string): boolean {
  return MOUNT_NAME_RE.test(stripMountNegation(name));
}

export function isMountServiceLabel(name: string): boolean {
  return MOUNT_SERVICE_RE.test(stripMountNegation(name));
}

export function looksLikePersonnelRole(name: string): boolean {
  const n = String(name || "").trim();
  if (!n || SKIP_SERVICE_RE.test(n)) return false;
  return PERSONNEL_ROLE_RE.test(n);
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
 * Слоты только из каталога: PERSONNEL, услуга со ставкой, услуга-роль.
 * Свободные строки (импорт без совпадения) назначения не создают.
 */
export function classifyPersonnelBlock(block: {
  type?: string | null;
  name?: string | null;
  title?: string | null;
  catalogName?: string | null;
  itemKind?: string | null;
  linkedSpecialtyId?: string | null;
  linkedSpecialtyName?: string | null;
}): AssignmentKindValue | null {
  const type = String(block.type || "").toUpperCase();
  if (type !== "ITEM" && type !== "KIT_HEADER") return null;
  const kind = String(block.itemKind || "").toUpperCase();
  const label = slotLabelName(block);
  if (!label) return null;
  const linked = Boolean(String(block.linkedSpecialtyId || "").trim());
  const fromCatalog = kind === "PERSONNEL" || kind === "SERVICE";
  if (!fromCatalog && !linked) return null;

  const mountLabel =
    isMountPersonnelName(label) ||
    isMountPersonnelName(block.linkedSpecialtyName || "") ||
    isMountServiceLabel(label);

  if (mountLabel) {
    if (linked || kind === "PERSONNEL") return "MOUNT";
    if (
      kind === "SERVICE" &&
      (looksLikePersonnelRole(label) || isMountServiceLabel(label))
    ) {
      return "MOUNT";
    }
    return null;
  }

  if (kind === "PERSONNEL" || linked) return "EVENT";
  if (kind === "SERVICE" && looksLikePersonnelRole(label)) return "EVENT";
  return null;
}

export function findSpecialtyByCatalogItemId<
  T extends {
    id: string;
    catalogItemId?: string | null;
    catalogItemIds?: string[] | null;
  },
>(catalogItemId: string | null | undefined, specialties: T[]): T | null {
  const id = String(catalogItemId || "").trim();
  if (!id) return null;
  return (
    specialties.find((s) => {
      if (s.catalogItemId === id) return true;
      return (s.catalogItemIds ?? []).includes(id);
    }) ?? null
  );
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
  items: Array<{
    specialtyId: string;
    kind: AssignmentKindValue;
    qty: number;
    zoneId?: string | null;
  }>,
): DesiredSlots[] {
  const map = new Map<string, DesiredSlots>();
  for (const item of items) {
    const qty = slotQty(item.qty);
    if (qty <= 0 || !item.specialtyId) continue;
    const zoneId = normZoneId(item.zoneId);
    const key = slotGroupKey(item.kind, item.specialtyId, zoneId);
    const prev = map.get(key);
    if (prev) prev.qty += qty;
    else {
      map.set(key, {
        specialtyId: item.specialtyId,
        kind: item.kind,
        qty,
        zoneId,
      });
    }
  }
  return [...map.values()];
}

/**
 * Старые слоты без зоны: разложить по зонам сметы, чтобы не плодить дубли.
 */
export function allocateZonesToSlots(
  existing: SlotExisting[],
  desired: DesiredSlots[],
): SlotExisting[] {
  const result = existing.map((s) => ({
    ...s,
    zoneId: normZoneId(s.zoneId),
  }));
  const remaining = new Map<string, Array<string | null>>();
  for (const d of desired) {
    const specKey = `${d.kind}:${d.specialtyId}`;
    const list = remaining.get(specKey) ?? [];
    for (let i = 0; i < d.qty; i++) list.push(normZoneId(d.zoneId));
    remaining.set(specKey, list);
  }
  for (const slot of result) {
    if (!slot.zoneId) continue;
    const list = remaining.get(`${slot.kind}:${slot.specialtyId}`);
    if (!list) continue;
    const i = list.findIndex((z) => z === slot.zoneId);
    if (i >= 0) list.splice(i, 1);
  }
  for (const slot of result) {
    if (slot.zoneId) continue;
    const list = remaining.get(`${slot.kind}:${slot.specialtyId}`);
    if (!list || list.length === 0) continue;
    const next = list.shift();
    if (next) slot.zoneId = next;
  }
  return result;
}

/** Следующая зона сметы для новой строки той же должности. */
export function pickZoneForNewSlot(args: {
  specialtyId: string;
  kind: AssignmentKindValue;
  desired: DesiredSlots[];
  existing: Array<{
    specialtyId: string;
    kind: AssignmentKindValue;
    zoneId?: string | null;
  }>;
}): string | null {
  const needed: string[] = [];
  for (const d of args.desired) {
    if (d.kind !== args.kind || d.specialtyId !== args.specialtyId) continue;
    const z = normZoneId(d.zoneId);
    if (!z) continue;
    for (let i = 0; i < d.qty; i++) needed.push(z);
  }
  const remaining = [...needed];
  for (const e of args.existing) {
    if (e.kind !== args.kind || e.specialtyId !== args.specialtyId) continue;
    const z = normZoneId(e.zoneId);
    if (!z) continue;
    const i = remaining.indexOf(z);
    if (i >= 0) remaining.splice(i, 1);
  }
  return remaining[0] || needed[0] || null;
}

function mountImportedQty(
  watermarks: SlotWatermarks,
  specialtyId: string,
  zoneId: string | null | undefined,
  rows: SlotExisting[],
  qty: number,
): { imported: number; writeKey: string } {
  const writeKey = slotWatermarkKey("MOUNT", specialtyId, zoneId);
  if (Object.prototype.hasOwnProperty.call(watermarks, writeKey)) {
    return { imported: Math.max(0, watermarks[writeKey] ?? 0), writeKey };
  }
  const legacyKey = slotWatermarkKey("MOUNT", specialtyId, null);
  if (
    normZoneId(zoneId) &&
    Object.prototype.hasOwnProperty.call(watermarks, legacyKey)
  ) {
    return { imported: Math.max(rows.length, qty), writeKey };
  }
  if (rows.length > 0) {
    return { imported: Math.max(rows.length, qty), writeKey };
  }
  return { imported: 0, writeKey };
}

function syncEventQty(
  rows: SlotExisting[],
  specialtyId: string,
  zoneId: string | null,
  qty: number,
  dayIndex: number | null,
  create: SlotPlan["create"],
  deleteIds: string[],
) {
  const filled = rows.filter(isFilledSlot);
  const empty = rows.filter((a) => !isFilledSlot(a));
  if (rows.length < qty) {
    for (let i = 0; i < qty - rows.length; i++) {
      create.push({
        specialtyId,
        kind: "EVENT",
        zoneId,
        dayIndex,
      });
    }
    return;
  }
  if (rows.length <= qty) return;

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

/**
 * EVENT: qty — число позиций, не qty × дни. Пустые слоты на каждый день
 * не создаём: нехватка по дням показывается в сводке. Заполненные
 * подневные слоты оставляем. Монтажники — один раз, без дня.
 * MOUNT: импорт из сметы один раз. Watermark не уменьшается —
 * удалённые слоты не добираются. Рост qty в смете добавляет только дельту.
 * Лишние слоты бригадира не трогаем.
 */
export function planSlotSync(
  existing: SlotExisting[],
  desired: DesiredSlots[],
  watermarks: SlotWatermarks = {},
  eventDays = 1,
): SlotPlan {
  const create: SlotPlan["create"] = [];
  const deleteIds: string[] = [];
  const nextWatermarks: SlotWatermarks = { ...watermarks };
  const days = workingDayCount(eventDays);
  const desiredKeys = new Set(
    desired.map((d) => slotGroupKey(d.kind, d.specialtyId, d.zoneId)),
  );

  for (const d of desired) {
    const zoneId = normZoneId(d.zoneId);
    const rows = existing.filter(
      (a) =>
        a.kind === d.kind &&
        a.specialtyId === d.specialtyId &&
        normZoneId(a.zoneId) === zoneId,
    );
    const qty = Math.max(0, Math.round(d.qty) || 0);
    if (d.kind === "MOUNT") {
      const { imported, writeKey } = mountImportedQty(
        watermarks,
        d.specialtyId,
        zoneId,
        rows,
        qty,
      );
      const missing = Math.max(0, qty - imported);
      for (let i = 0; i < missing; i++) {
        create.push({
          specialtyId: d.specialtyId,
          kind: "MOUNT",
          zoneId,
          dayIndex: null,
        });
      }
      nextWatermarks[writeKey] = Math.max(imported, qty);
      continue;
    }

    if (days <= 1) {
      const singleDay = rows.filter((a) => {
        const di = normDayIndex(a.dayIndex);
        return di == null || di === 1;
      });
      syncEventQty(
        singleDay,
        d.specialtyId,
        zoneId,
        qty,
        null,
        create,
        deleteIds,
      );
      for (const slot of rows) {
        const di = normDayIndex(slot.dayIndex);
        if (di != null && di > 1 && !isFilledSlot(slot)) {
          deleteIds.push(slot.id);
        }
      }
      continue;
    }

    const perDay = rows.filter((a) => normDayIndex(a.dayIndex) != null);
    const allDays = rows.filter((a) => normDayIndex(a.dayIndex) == null);

    for (const slot of perDay) {
      const di = normDayIndex(slot.dayIndex);
      if (!isFilledSlot(slot) || (di != null && di > days)) {
        deleteIds.push(slot.id);
      }
    }

    const filledPerDay = perDay.filter(
      (a) => isFilledSlot(a) && !deleteIds.includes(a.id),
    );
    let maxPerDayFilled = 0;
    for (let day = 1; day <= days; day++) {
      const n = filledPerDay.filter(
        (a) => normDayIndex(a.dayIndex) === day,
      ).length;
      if (n > maxPerDayFilled) maxPerDayFilled = n;
    }
    const current = allDays.length + maxPerDayFilled;
    if (current < qty) {
      for (let i = 0; i < qty - current; i++) {
        create.push({
          specialtyId: d.specialtyId,
          kind: "EVENT",
          zoneId,
          dayIndex: null,
        });
      }
    } else if (current > qty) {
      let overflow = current - qty;
      const emptyAllNewestFirst = [...allDays]
        .filter((a) => !isFilledSlot(a))
        .reverse();
      for (const slot of emptyAllNewestFirst) {
        if (overflow <= 0) break;
        deleteIds.push(slot.id);
        overflow -= 1;
      }
    }
  }

  // EVENT-специальности, исчезнувшие из сметы: снимаем только пустые
  const existingGroups = new Map<string, SlotExisting[]>();
  for (const a of existing) {
    const key = slotGroupKey(a.kind, a.specialtyId, a.zoneId);
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
  catalogItemId?: string | null;
  linkedSpecialtyId?: string | null;
  linkedSpecialtyName?: string | null;
  zoneId?: string | null;
};

export type SpecialtyLinkRow = {
  id: string;
  name: string;
  catalogItemId?: string | null;
  catalogItemIds?: string[] | null;
};

export function annotatePersonnelBlocks<T extends PersonnelBlockInput>(
  blocks: T[],
  specialties: SpecialtyLinkRow[],
): T[] {
  return blocks.map((block) => {
    const linked = findSpecialtyByCatalogItemId(
      block.catalogItemId,
      specialties,
    );
    if (!linked) return block;
    return {
      ...block,
      linkedSpecialtyId: linked.id,
      linkedSpecialtyName: linked.name,
    };
  });
}

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
): Promise<string | null> {
  const n = normalizeSpecialtyName(label);
  const hit = [...cache.values()].find(
    (s) => normalizeSpecialtyName(s.name) === n,
  );
  if (hit) return hit.id;

  const best = findBestSpecialty(label, [...cache.values()]);
  if (best) return best.id;

  const again = await tx.specialty.findMany({
    select: { id: true, name: true },
  });
  for (const s of again) cache.set(s.id, s);
  const retry =
    again.find((s) => normalizeSpecialtyName(s.name) === n) ||
    findBestSpecialty(label, again);
  return retry?.id ?? null;
}

/**
 * Синхронизация персонала по смете запускается только явным
 * «Импортом из сметы» в спецификации, никогда из автосохранения сметы.
 */
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
          catalogItem: { select: { id: true, name: true, itemKind: true } },
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
          zoneId: true,
          dayIndex: true,
        },
      },
    },
  });
  if (!quote) {
    return { create: [], deleteIds: [], watermarks: {} };
  }

  const specialties = await tx.specialty.findMany({
    select: {
      id: true,
      name: true,
      catalogItems: { select: { catalogItemId: true } },
    },
  });
  const linkRows: SpecialtyLinkRow[] = specialties.map((s) => ({
    id: s.id,
    name: s.name,
    catalogItemIds: s.catalogItems.map((c) => c.catalogItemId),
  }));
  const cache = new Map(linkRows.map((s) => [s.id, { id: s.id, name: s.name }]));

  const activeBlocks = blocksInActiveZones(quote.zones, quote.blocks);
  const requests = collectPersonnelSlotRequests(
    annotatePersonnelBlocks(
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
        catalogItemId: b.catalogItem?.id ?? null,
        zoneId: b.zoneId,
      })),
      linkRows,
    ),
  );

  const desiredParts: Array<{
    specialtyId: string;
    kind: AssignmentKindValue;
    qty: number;
    zoneId: string | null;
  }> = [];
  for (const req of requests) {
    const specialtyId =
      req.block.linkedSpecialtyId ||
      (await resolveSpecialtyId(tx, req.label, cache));
    if (!specialtyId) continue;
    desiredParts.push({
      specialtyId,
      kind: req.kind,
      qty: req.qty,
      zoneId: normZoneId(req.block.zoneId),
    });
  }
  const desired = groupDesiredQty(desiredParts);

  const existingRaw: SlotExisting[] = quote.assignments.map((a) => ({
    id: a.id,
    specialtyId: a.specialtyId,
    kind: (a.kind as AssignmentKindValue) || "EVENT",
    userId: a.userId,
    isFreelancer: a.isFreelancer,
    freelancerName: a.freelancerName,
    zoneId: a.zoneId,
    dayIndex: a.dayIndex,
  }));
  const existing = allocateZonesToSlots(existingRaw, desired);
  for (const slot of existing) {
    const orig = existingRaw.find((e) => e.id === slot.id);
    if (orig && normZoneId(orig.zoneId) !== normZoneId(slot.zoneId)) {
      await tx.quoteAssignment.update({
        where: { id: slot.id },
        data: { zoneId: slot.zoneId },
      });
    }
  }

  const prevWatermarks = parseSlotWatermarks(quote.assignmentImportWatermark);
  const plan = planSlotSync(
    existing,
    desired,
    prevWatermarks,
    quote.durationDays,
  );
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
        zoneId: normZoneId(c.zoneId),
        dayIndex: c.kind === "MOUNT" ? null : (c.dayIndex ?? null),
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

async function loadQuoteDesiredSlots(
  tx: Tx,
  quoteId: string,
): Promise<{
  desired: DesiredSlots[];
  existing: SlotExisting[];
} | null> {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    select: {
      zones: { select: { id: true, active: true } },
      blocks: {
        select: {
          type: true,
          name: true,
          title: true,
          qty: true,
          zoneId: true,
          catalogItem: { select: { id: true, name: true, itemKind: true } },
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
          zoneId: true,
          dayIndex: true,
        },
      },
    },
  });
  if (!quote) return null;
  const specialties = await tx.specialty.findMany({
    select: {
      id: true,
      name: true,
      catalogItems: { select: { catalogItemId: true } },
    },
  });
  const linkRows: SpecialtyLinkRow[] = specialties.map((s) => ({
    id: s.id,
    name: s.name,
    catalogItemIds: s.catalogItems.map((c) => c.catalogItemId),
  }));
  const activeBlocks = blocksInActiveZones(quote.zones, quote.blocks);
  const requests = collectPersonnelSlotRequests(
    annotatePersonnelBlocks(
      activeBlocks.map((b) => ({
        type: b.type,
        name: b.name,
        title: b.title,
        qty: b.qty,
        itemKind: b.catalogItem?.itemKind ?? null,
        catalogName: b.catalogItem?.name ?? null,
        catalogItemId: b.catalogItem?.id ?? null,
        zoneId: b.zoneId,
      })),
      linkRows,
    ),
  );
  const desiredParts: Array<{
    specialtyId: string;
    kind: AssignmentKindValue;
    qty: number;
    zoneId: string | null;
  }> = [];
  for (const req of requests) {
    const spec = req.block.linkedSpecialtyId
      ? linkRows.find((s) => s.id === req.block.linkedSpecialtyId)
      : findBestSpecialty(req.label, linkRows);
    if (!spec) continue;
    desiredParts.push({
      specialtyId: spec.id,
      kind: req.kind,
      qty: req.qty,
      zoneId: normZoneId(req.block.zoneId),
    });
  }
  return {
    desired: groupDesiredQty(desiredParts),
    existing: quote.assignments.map((a) => ({
      id: a.id,
      specialtyId: a.specialtyId,
      kind: (a.kind as AssignmentKindValue) || "EVENT",
      userId: a.userId,
      isFreelancer: a.isFreelancer,
      freelancerName: a.freelancerName,
      zoneId: a.zoneId,
      dayIndex: a.dayIndex,
    })),
  };
}

export async function inferAssignmentZoneId(
  tx: Tx,
  quoteId: string,
  specialtyId: string,
  kind: AssignmentKindValue,
): Promise<string | null> {
  const loaded = await loadQuoteDesiredSlots(tx, quoteId);
  if (!loaded) return null;
  return pickZoneForNewSlot({
    specialtyId,
    kind,
    desired: loaded.desired,
    existing: loaded.existing,
  });
}

export async function backfillAssignmentZones(
  tx: Tx,
  quoteId: string,
): Promise<void> {
  const loaded = await loadQuoteDesiredSlots(tx, quoteId);
  if (!loaded) return;
  const next = allocateZonesToSlots(loaded.existing, loaded.desired);
  for (const slot of next) {
    const orig = loaded.existing.find((e) => e.id === slot.id);
    if (
      orig &&
      slot.zoneId &&
      normZoneId(orig.zoneId) !== normZoneId(slot.zoneId)
    ) {
      await tx.quoteAssignment.update({
        where: { id: slot.id },
        data: { zoneId: slot.zoneId },
      });
    }
  }
}

export async function quoteZoneIdOrNull(
  tx: Tx,
  quoteId: string,
  zoneId?: string | null,
): Promise<string | null> {
  const id = normZoneId(zoneId);
  if (!id) return null;
  const zone = await tx.quoteZone.findFirst({
    where: { id, quoteId },
    select: { id: true },
  });
  return zone?.id ?? null;
}
