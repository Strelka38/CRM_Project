import type {
  AssignmentKind,
  BlockType,
  CalcLineMode,
  CatalogOwner,
  DayMode,
  PayMode,
  Prisma,
  QuoteLifecycle,
  SpecExtraType,
  SpecOverrideAction,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { isCatalogOwnerValue } from "@/lib/catalog-owner";
import { parseEventDate } from "@/lib/dates";
import {
  DATABASE_BACKUP_KIND,
  emptyBackupCounts,
  QUOTE_PACK_KIND,
  QUOTE_PACK_TABLES,
  QUOTE_PACK_VERSION,
  type DatabaseBackupCounts,
  type DatabaseBackupTables,
  type QuotePackFile,
  type QuotePackTables,
} from "@/lib/database-backup-format";
import { parseLifecycleStatus } from "@/lib/lifecycle";
import { DEFAULT_CASHLESS_PERCENT } from "@/lib/pricing";
import {
  defaultDemountDate,
  defaultMountDate,
} from "@/lib/quote-schedule";

type IdMap = Map<string, string>;

export type QuoteImportContext = {
  currentUserId: string;
  userIds: IdMap;
  itemIds: IdMap;
  kitIds: IdMap;
  specialtyIds: IdMap;
  venueIds: IdMap;
  clientIds: IdMap;
  writes: { created: number; updated: number };
};

const BLOCK_TYPES: BlockType[] = ["SECTION", "ITEM", "NOTE", "KIT_HEADER"];
const DAY_MODES: DayMode[] = ["HALF_EXTRA", "FULL_DAYS", "FIXED1", "FIXED2"];
const ASSIGNMENT_KINDS: AssignmentKind[] = ["EVENT", "MOUNT"];
const PAY_MODES: PayMode[] = ["SHIFT", "HOURLY"];
const CALC_LINE_MODES: CalcLineMode[] = ["SHARE", "AMOUNT"];
const SPEC_OVERRIDE_ACTIONS: SpecOverrideAction[] = [
  "HIDE",
  "SET_QTY",
  "RENAME",
  "SET_COMMENT",
  "REPLACE",
  "DELETE",
];
const SPEC_EXTRA_TYPES: SpecExtraType[] = ["SECTION", "ITEM"];

function asObj(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function int(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function bool(v: unknown, fallback = true): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function optStr(v: unknown): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : null;
}

function optNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): Date | undefined {
  if (v == null || v === "") return undefined;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function pickEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function ownersOf(v: unknown): CatalogOwner[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is CatalogOwner => isCatalogOwnerValue(x));
}

function notesOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function intList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
}

function asJson(
  v: unknown,
  fallback: Prisma.InputJsonValue = {},
): Prisma.InputJsonValue {
  if (v === undefined || v === null) return fallback;
  return v as Prisma.InputJsonValue;
}

function requireId(row: Record<string, unknown>): string | null {
  const id = str(row.id).trim();
  return id || null;
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asObj)
    .filter((row): row is Record<string, unknown> => !!row);
}

function mapped(
  map: IdMap,
  dumpId: string | null | undefined,
): string | null {
  if (!dumpId) return null;
  return map.get(dumpId) ?? null;
}

async function existingIds(
  tx: Prisma.TransactionClient,
  table:
    | "user"
    | "catalogItem"
    | "kit"
    | "specialty"
    | "venue"
    | "client",
  ids: string[],
): Promise<IdMap> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map: IdMap = new Map();
  if (unique.length === 0) return map;
  const query = { where: { id: { in: unique } }, select: { id: true as const } };
  let rows: Array<{ id: string }> = [];
  switch (table) {
    case "user":
      rows = await tx.user.findMany(query);
      break;
    case "catalogItem":
      rows = await tx.catalogItem.findMany(query);
      break;
    case "kit":
      rows = await tx.kit.findMany(query);
      break;
    case "specialty":
      rows = await tx.specialty.findMany(query);
      break;
    case "venue":
      rows = await tx.venue.findMany(query);
      break;
    case "client":
      rows = await tx.client.findMany(query);
      break;
  }
  for (const row of rows) map.set(row.id, row.id);
  return map;
}

function collectFieldIds(raw: unknown[], ...keys: string[]): string[] {
  const ids: string[] = [];
  for (const rec of rowsOf(raw)) {
    for (const key of keys) {
      const v = str(rec[key]).trim();
      if (v) ids.push(v);
    }
  }
  return ids;
}

export function emptyQuotePackTables(): QuotePackTables {
  return {
    quotes: [],
    quoteZones: [],
    quoteBlocks: [],
    quoteAssignments: [],
    quoteCalcShares: [],
    quoteCalcLineOverrides: [],
    quoteExtraExpenses: [],
    specOverrides: [],
    specExtras: [],
    quoteComments: [],
    quoteAttachments: [],
    quoteSnapshots: [],
    quoteAuditEvents: [],
    specRevisions: [],
  };
}

export function isQuotePack(raw: unknown): raw is QuotePackFile {
  const obj = asObj(raw);
  return !!obj && obj.kind === QUOTE_PACK_KIND;
}

export function isDatabaseBackupKind(raw: unknown): boolean {
  const obj = asObj(raw);
  return !!obj && obj.kind === DATABASE_BACKUP_KIND;
}

export function parseQuotePack(raw: unknown): QuotePackFile {
  const obj = asObj(raw);
  if (!obj) throw new Error("Файл пустой или повреждён");
  if (obj.kind !== QUOTE_PACK_KIND) {
    throw new Error("Это не файл экспорта смет");
  }
  const version = num(obj.version, 0);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Неизвестная версия файла смет");
  }
  if (version > QUOTE_PACK_VERSION) {
    throw new Error(
      `Файл версии ${version} новее, чем поддерживает эта CRM (${QUOTE_PACK_VERSION})`,
    );
  }
  const tables = asObj(obj.tables);
  if (!tables) throw new Error("В файле нет таблиц");
  const parsed = emptyQuotePackTables();
  for (const key of QUOTE_PACK_TABLES) {
    parsed[key] = rowsOf(tables[key]);
  }
  return {
    kind: QUOTE_PACK_KIND,
    version,
    exportedAt: str(obj.exportedAt, new Date().toISOString()),
    tables: parsed,
  };
}

export async function collectQuoteTables(): Promise<QuotePackTables> {
  const [
    quotes,
    quoteZones,
    quoteBlocks,
    quoteAssignments,
    quoteCalcShares,
    quoteCalcLineOverrides,
    quoteExtraExpenses,
    specOverrides,
    specExtras,
    quoteComments,
    quoteAttachments,
    quoteSnapshots,
    quoteAuditEvents,
    specRevisions,
  ] = await Promise.all([
    prisma.quote.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteZone.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.quoteBlock.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.quoteAssignment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteCalcShare.findMany(),
    prisma.quoteCalcLineOverride.findMany(),
    prisma.quoteExtraExpense.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.specOverride.findMany(),
    prisma.specExtraBlock.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.quoteComment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteAttachment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteSnapshot.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteAuditEvent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.specRevision.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return JSON.parse(
    JSON.stringify({
      quotes,
      quoteZones,
      quoteBlocks,
      quoteAssignments,
      quoteCalcShares,
      quoteCalcLineOverrides,
      quoteExtraExpenses,
      specOverrides,
      specExtras,
      quoteComments,
      quoteAttachments,
      quoteSnapshots,
      quoteAuditEvents,
      specRevisions,
    }),
  ) as QuotePackTables;
}

export async function collectQuotePack(): Promise<QuotePackFile> {
  return {
    kind: QUOTE_PACK_KIND,
    version: QUOTE_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    tables: await collectQuoteTables(),
  };
}

async function clearQuoteBody(
  tx: Prisma.TransactionClient,
  quoteId: string,
) {
  await tx.quoteAssignment.deleteMany({ where: { quoteId } });
  await tx.quoteBlock.deleteMany({ where: { quoteId } });
  await tx.quoteCalcShare.deleteMany({ where: { quoteId } });
  await tx.quoteCalcLineOverride.deleteMany({ where: { quoteId } });
  await tx.quoteExtraExpense.deleteMany({ where: { quoteId } });
  await tx.specOverride.deleteMany({ where: { quoteId } });
  await tx.specExtraBlock.deleteMany({ where: { quoteId } });
  await tx.quoteComment.deleteMany({ where: { quoteId } });
  await tx.quoteAttachment.deleteMany({ where: { quoteId } });
  await tx.quoteZone.deleteMany({ where: { quoteId } });
}

async function importQuotes(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  ctx: QuoteImportContext,
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const proposalNumber = str(rec.proposalNumber).trim();
    if (!id) {
      warnings.push("Пропущена смета без id");
      continue;
    }
    const byId = await tx.quote.findUnique({
      where: { id },
      select: { id: true },
    });
    const byNumber =
      !byId && proposalNumber
        ? await tx.quote.findFirst({
            where: { proposalNumber },
            select: { id: true },
          })
        : null;
    const targetId = byId?.id || byNumber?.id || id;
    const ownerId =
      mapped(ctx.userIds, str(rec.ownerId)) || ctx.currentUserId;
    const date = str(rec.date);
    const durationDays = Math.max(1, int(rec.durationDays, 1));
    const data = {
      proposalNumber: proposalNumber || id.slice(-6),
      eventName: str(rec.eventName),
      date,
      eventDate: asDate(rec.eventDate) ?? parseEventDate(date) ?? null,
      mountDate: str(rec.mountDate) || (date ? defaultMountDate(date) : ""),
      mountDurationDays: Math.max(1, int(rec.mountDurationDays, 1)),
      demountDate:
        str(rec.demountDate) ||
        (date ? defaultDemountDate(date, durationDays) : ""),
      demountDurationDays: Math.max(1, int(rec.demountDurationDays, 1)),
      time: str(rec.time),
      place: str(rec.place),
      venueId: mapped(ctx.venueIds, str(rec.venueId)),
      client: str(rec.client),
      clientId: mapped(ctx.clientIds, str(rec.clientId)),
      requestContact: str(rec.requestContact),
      managerName: str(rec.managerName),
      cashless: bool(rec.cashless, true),
      cashlessPercent: num(rec.cashlessPercent, DEFAULT_CASHLESS_PERCENT),
      durationDays,
      notes: notesOf(rec.notes),
      brief: str(rec.brief),
      discountPercent: num(rec.discountPercent, 0),
      lifecycle: parseLifecycleStatus(
        str(rec.lifecycle),
        "CALCULATED",
      ) as QuoteLifecycle,
      invoiceRequired: bool(rec.invoiceRequired, false),
      invoiceSent: bool(rec.invoiceSent, false),
      paid: bool(rec.paid, false),
      paymentComment: str(rec.paymentComment),
      sharesCustom: bool(rec.sharesCustom, false),
      assignmentImportWatermark: asJson(rec.assignmentImportWatermark),
      ownerId,
      specLineOrder: notesOf(rec.specLineOrder),
    };

    const existing = await tx.quote.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (existing) {
      map.set(id, existing.id);
      ctx.writes.updated += 1;
      await clearQuoteBody(tx, existing.id);
      await tx.quote.update({
        where: { id: existing.id },
        data: {
          ...data,
          ...(asDate(rec.createdAt)
            ? { createdAt: asDate(rec.createdAt) }
            : {}),
        },
      });
    } else {
      map.set(id, id);
      ctx.writes.created += 1;
      await tx.quote.create({
        data: {
          id,
          ...data,
          createdAt: asDate(rec.createdAt),
        },
      });
    }
    counts.quotes += 1;
  }
  return map;
}

async function importQuoteZones(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  const rows: Prisma.QuoteZoneCreateManyInput[] = [];
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущена зона сметы без сметы");
      continue;
    }
    map.set(id, id);
    rows.push({
      id,
      quoteId,
      name: str(rec.name, "Зона"),
      sortOrder: int(rec.sortOrder, 0),
      active: bool(rec.active, true),
      workingDayIndexes: intList(rec.workingDayIndexes),
      createdAt: asDate(rec.createdAt),
    });
  }
  if (rows.length) await tx.quoteZone.createMany({ data: rows });
  counts.quoteZones += rows.length;
  return map;
}

async function importQuoteBlocks(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  zoneIds: IdMap,
  itemIds: IdMap,
  kitIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  const rows: Prisma.QuoteBlockCreateManyInput[] = [];
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущен блок сметы без сметы");
      continue;
    }
    const catalogDump = str(rec.catalogItemId).trim();
    const kitDump = str(rec.kitId).trim();
    rows.push({
      id,
      quoteId,
      zoneId: mapped(zoneIds, str(rec.zoneId)),
      type: pickEnum(rec.type, BLOCK_TYPES, "ITEM"),
      sortOrder: int(rec.sortOrder, 0),
      title: optStr(rec.title),
      name: optStr(rec.name),
      qty: num(rec.qty, 0),
      unitPrice: num(rec.unitPrice, 0),
      cashlessOverride: optNum(rec.cashlessOverride),
      dayMode: pickEnum(rec.dayMode, DAY_MODES, "HALF_EXTRA"),
      dayCoefOverride: optNum(rec.dayCoefOverride),
      catalogItemId: catalogDump ? mapped(itemIds, catalogDump) : null,
      kitId: kitDump ? mapped(kitIds, kitDump) : null,
      createdAt: asDate(rec.createdAt),
    });
  }
  if (rows.length) await tx.quoteBlock.createMany({ data: rows });
  counts.quoteBlocks += rows.length;
}

async function importQuoteAssignments(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  zoneIds: IdMap,
  userIds: IdMap,
  specialtyIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  const rows: Prisma.QuoteAssignmentCreateManyInput[] = [];
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    const specialtyId = mapped(specialtyIds, str(rec.specialtyId));
    if (!id || !quoteId) {
      warnings.push("Пропущен запрос на персонал без сметы");
      continue;
    }
    if (!specialtyId) {
      warnings.push(`Назначение ${id}: специальность не найдена`);
      continue;
    }
    rows.push({
      id,
      quoteId,
      userId: mapped(userIds, str(rec.userId)),
      specialtyId,
      payMode: pickEnum(rec.payMode, PAY_MODES, "SHIFT"),
      hours: optNum(rec.hours),
      rateOverride: optNum(rec.rateOverride),
      bonus: num(rec.bonus, 0),
      montageAmount: num(rec.montageAmount, 0),
      isFreelancer: bool(rec.isFreelancer, false),
      freelancerName: str(rec.freelancerName),
      owners: ownersOf(rec.owners),
      kind: pickEnum(rec.kind, ASSIGNMENT_KINDS, "EVENT"),
      zoneId: mapped(zoneIds, str(rec.zoneId)),
      dayIndex: rec.dayIndex == null ? null : int(rec.dayIndex, 1),
      onMount: bool(rec.onMount, true),
      onDemount: bool(rec.onDemount, true),
      createdAt: asDate(rec.createdAt),
    });
  }
  if (rows.length) await tx.quoteAssignment.createMany({ data: rows });
  counts.quoteAssignments += rows.length;
}

async function importQuoteCalcShares(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    const company = isCatalogOwnerValue(rec.company) ? rec.company : null;
    if (!id || !quoteId || !company) {
      warnings.push("Пропущена доля калькуляции без сметы или фирмы");
      continue;
    }
    await tx.quoteCalcShare.create({
      data: {
        id,
        quoteId,
        company,
        percent: num(rec.percent, 0),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.quoteCalcShares += 1;
  }
}

async function importQuoteCalcLineOverrides(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    const blockId = str(rec.blockId).trim();
    if (!id || !quoteId || !blockId) {
      warnings.push("Пропущено переопределение строки калькуляции");
      continue;
    }
    await tx.quoteCalcLineOverride.create({
      data: {
        id,
        quoteId,
        blockId,
        mode: pickEnum(rec.mode, CALC_LINE_MODES, "SHARE"),
        ownersCustom: bool(rec.ownersCustom, false),
        owners: ownersOf(rec.owners),
        amountShowMaster: num(rec.amountShowMaster, 0),
        amountDiakom: num(rec.amountDiakom, 0),
        amountNeEvent: num(rec.amountNeEvent, 0),
        costOverride: optNum(rec.costOverride),
        montageAmount: num(rec.montageAmount, 0),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.quoteCalcLineOverrides += 1;
  }
}

async function importQuoteExtraExpenses(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущен доп. расход без сметы");
      continue;
    }
    await tx.quoteExtraExpense.create({
      data: {
        id,
        quoteId,
        name: str(rec.name),
        amount: num(rec.amount, 0),
        mode: pickEnum(rec.mode, CALC_LINE_MODES, "SHARE"),
        company: isCatalogOwnerValue(rec.company) ? rec.company : null,
        owners: ownersOf(rec.owners),
        amountShowMaster: num(rec.amountShowMaster, 0),
        amountDiakom: num(rec.amountDiakom, 0),
        amountNeEvent: num(rec.amountNeEvent, 0),
        sortOrder: int(rec.sortOrder, 0),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.quoteExtraExpenses += 1;
  }
}

async function importSpecOverrides(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  itemIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущена правка спецификации без сметы");
      continue;
    }
    await tx.specOverride.create({
      data: {
        id,
        quoteId,
        deriveKey: str(rec.deriveKey),
        action: pickEnum(rec.action, SPEC_OVERRIDE_ACTIONS, "HIDE"),
        qty: optNum(rec.qty),
        name: optStr(rec.name),
        catalogItemId: mapped(itemIds, str(rec.catalogItemId)),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.specOverrides += 1;
  }
}

async function importSpecExtras(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  itemIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущена доп. строка спецификации без сметы");
      continue;
    }
    await tx.specExtraBlock.create({
      data: {
        id,
        quoteId,
        type: pickEnum(rec.type, SPEC_EXTRA_TYPES, "ITEM"),
        sortOrder: int(rec.sortOrder, 0),
        title: optStr(rec.title),
        name: optStr(rec.name),
        qty: num(rec.qty, 0),
        comment: str(rec.comment),
        hidden: bool(rec.hidden, false),
        catalogItemId: mapped(itemIds, str(rec.catalogItemId)),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.specExtras += 1;
  }
}

async function importQuoteComments(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  userIds: IdMap,
  currentUserId: string,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    const authorId =
      mapped(userIds, str(rec.authorId)) || currentUserId;
    if (!id || !quoteId) {
      warnings.push("Пропущен комментарий сметы без сметы");
      continue;
    }
    await tx.quoteComment.create({
      data: {
        id,
        quoteId,
        authorId,
        body: str(rec.body),
        imagePath: optStr(rec.imagePath),
        imageMime: optStr(rec.imageMime),
        imageName: optStr(rec.imageName),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.quoteComments += 1;
  }
}

async function importQuoteAttachments(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  userIds: IdMap,
  currentUserId: string,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    const uploaderId =
      mapped(userIds, str(rec.uploaderId)) || currentUserId;
    const storagePath = str(rec.storagePath);
    if (!id || !quoteId || !storagePath) {
      warnings.push("Пропущено вложение сметы без файла");
      continue;
    }
    await tx.quoteAttachment.create({
      data: {
        id,
        quoteId,
        uploaderId,
        filename: str(rec.filename, "file"),
        mimeType: str(rec.mimeType, "application/octet-stream"),
        size: int(rec.size, 0),
        storagePath,
        invoiceSent: bool(rec.invoiceSent, false),
        createdAt: asDate(rec.createdAt),
      },
    });
    counts.quoteAttachments += 1;
  }
}

export async function applyQuoteTables(
  tx: Prisma.TransactionClient,
  tables: Partial<DatabaseBackupTables> | QuotePackTables,
  ctx: QuoteImportContext,
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const quoteRows = rowsOf(tables.quotes);
  if (quoteRows.length === 0) return new Map();

  const quoteIds = await importQuotes(tx, quoteRows, ctx, counts, warnings);
  const zoneIds = await importQuoteZones(
    tx,
    rowsOf(tables.quoteZones),
    quoteIds,
    counts,
    warnings,
  );
  await importQuoteBlocks(
    tx,
    rowsOf(tables.quoteBlocks),
    quoteIds,
    zoneIds,
    ctx.itemIds,
    ctx.kitIds,
    counts,
    warnings,
  );
  await importQuoteAssignments(
    tx,
    rowsOf(tables.quoteAssignments),
    quoteIds,
    zoneIds,
    ctx.userIds,
    ctx.specialtyIds,
    counts,
    warnings,
  );
  await importQuoteCalcShares(
    tx,
    rowsOf(tables.quoteCalcShares),
    quoteIds,
    counts,
    warnings,
  );
  await importQuoteCalcLineOverrides(
    tx,
    rowsOf(tables.quoteCalcLineOverrides),
    quoteIds,
    counts,
    warnings,
  );
  await importQuoteExtraExpenses(
    tx,
    rowsOf(tables.quoteExtraExpenses),
    quoteIds,
    counts,
    warnings,
  );
  await importSpecOverrides(
    tx,
    rowsOf(tables.specOverrides),
    quoteIds,
    ctx.itemIds,
    counts,
    warnings,
  );
  await importSpecExtras(
    tx,
    rowsOf(tables.specExtras),
    quoteIds,
    ctx.itemIds,
    counts,
    warnings,
  );
  await importQuoteComments(
    tx,
    rowsOf(tables.quoteComments),
    quoteIds,
    ctx.userIds,
    ctx.currentUserId,
    counts,
    warnings,
  );
  await importQuoteAttachments(
    tx,
    rowsOf(tables.quoteAttachments),
    quoteIds,
    ctx.userIds,
    ctx.currentUserId,
    counts,
    warnings,
  );
  await importQuoteSnapshots(
    tx,
    rowsOf(tables.quoteSnapshots),
    quoteIds,
    ctx.userIds,
    counts,
    warnings,
  );
  await importQuoteAuditEvents(
    tx,
    rowsOf(tables.quoteAuditEvents),
    quoteIds,
    ctx.userIds,
    counts,
    warnings,
  );
  await importSpecRevisions(
    tx,
    rowsOf(tables.specRevisions),
    quoteIds,
    ctx.userIds,
    counts,
    warnings,
  );
  return quoteIds;
}

export async function liveQuoteImportContext(
  tx: Prisma.TransactionClient,
  tables: QuotePackTables,
  currentUserId: string,
): Promise<QuoteImportContext> {
  const userIds = await existingIds(
    tx,
    "user",
    [
      ...collectFieldIds(tables.quotes, "ownerId"),
      ...collectFieldIds(tables.quoteAssignments, "userId"),
      ...collectFieldIds(tables.quoteComments, "authorId"),
      ...collectFieldIds(tables.quoteAttachments, "uploaderId"),
      ...collectFieldIds(tables.quoteSnapshots, "createdById"),
      ...collectFieldIds(tables.quoteAuditEvents, "actorId"),
      ...collectFieldIds(tables.specRevisions, "createdById"),
      currentUserId,
    ],
  );
  const itemIds = await existingIds(
    tx,
    "catalogItem",
    [
      ...collectFieldIds(tables.quoteBlocks, "catalogItemId"),
      ...collectFieldIds(tables.specOverrides, "catalogItemId"),
      ...collectFieldIds(tables.specExtras, "catalogItemId"),
    ],
  );
  const kitIds = await existingIds(
    tx,
    "kit",
    collectFieldIds(tables.quoteBlocks, "kitId"),
  );
  const specialtyIds = await existingIds(
    tx,
    "specialty",
    collectFieldIds(tables.quoteAssignments, "specialtyId"),
  );
  const venueIds = await existingIds(
    tx,
    "venue",
    collectFieldIds(tables.quotes, "venueId"),
  );
  const clientIds = await existingIds(
    tx,
    "client",
    collectFieldIds(tables.quotes, "clientId"),
  );
  return {
    currentUserId,
    userIds,
    itemIds,
    kitIds,
    specialtyIds,
    venueIds,
    clientIds,
    writes: { created: 0, updated: 0 },
  };
}

async function importQuoteSnapshots(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  userIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущен снимок сметы без сметы");
      continue;
    }
    const existing = await tx.quoteSnapshot.findUnique({ where: { id } });
    const data = {
      quoteId,
      title: str(rec.title),
      payload: asJson(rec.payload),
      createdById: mapped(userIds, str(rec.createdById)),
    };
    if (existing) {
      await tx.quoteSnapshot.update({ where: { id }, data });
    } else {
      await tx.quoteSnapshot.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.quoteSnapshots += 1;
  }
}

async function importQuoteAuditEvents(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  userIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущено событие журнала сметы без сметы");
      continue;
    }
    const existing = await tx.quoteAuditEvent.findUnique({ where: { id } });
    const data = {
      quoteId,
      actorId: mapped(userIds, str(rec.actorId)),
      action: str(rec.action, "PATCH"),
      summary: str(rec.summary),
      diff: rec.diff == null ? undefined : asJson(rec.diff),
    };
    if (existing) {
      await tx.quoteAuditEvent.update({ where: { id }, data });
    } else {
      await tx.quoteAuditEvent.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.quoteAuditEvents += 1;
  }
}

async function importSpecRevisions(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  quoteIds: IdMap,
  userIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = mapped(quoteIds, str(rec.quoteId));
    if (!id || !quoteId) {
      warnings.push("Пропущен снимок спецификации без сметы");
      continue;
    }
    const existing = await tx.specRevision.findUnique({ where: { id } });
    const data = {
      quoteId,
      title: str(rec.title),
      lines: asJson(rec.lines, []),
      note: optStr(rec.note),
      createdById: mapped(userIds, str(rec.createdById)),
    };
    if (existing) {
      await tx.specRevision.update({ where: { id }, data });
    } else {
      await tx.specRevision.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.specRevisions += 1;
  }
}

const TX_MS = 300_000;

export async function applyQuotePack(
  pack: QuotePackFile,
  currentUserId: string,
): Promise<{
  counts: DatabaseBackupCounts;
  warnings: string[];
  created: number;
  updated: number;
}> {
  const warnings: string[] = [];
  const counts = emptyBackupCounts();
  let created = 0;
  let updated = 0;
  await prisma.$transaction(
    async (tx) => {
      const ctx = await liveQuoteImportContext(
        tx,
        pack.tables,
        currentUserId,
      );
      await applyQuoteTables(tx, pack.tables, ctx, counts, warnings);
      created = ctx.writes.created;
      updated = ctx.writes.updated;
    },
    { timeout: TX_MS, maxWait: 20_000 },
  );
  return { counts, warnings, created, updated };
}
