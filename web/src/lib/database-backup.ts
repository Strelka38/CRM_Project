import type {
  CatalogOwner,
  CategoryKind,
  DayMode,
  ItemKind,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DATABASE_BACKUP_KIND,
  DATABASE_BACKUP_VERSION,
  emptyBackupCounts,
  type DatabaseBackupCounts,
  type DatabaseBackupFile,
  type DatabaseBackupTables,
} from "@/lib/database-backup-format";
import { newQrToken } from "@/lib/uploads";

export {
  DATABASE_BACKUP_KIND,
  DATABASE_BACKUP_VERSION,
  countBackupTables,
  type DatabaseBackupCounts,
  type DatabaseBackupFile,
  type DatabaseBackupTables,
} from "@/lib/database-backup-format";

const ROLES: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE", "BRIGADIER"];
const OWNERS: CatalogOwner[] = ["SHOW_MASTER", "DIAKOM", "NE_EVENT"];
const CATEGORY_KINDS: CategoryKind[] = ["EQUIPMENT", "PERSONNEL", "OTHER"];
const ITEM_KINDS: ItemKind[] = [
  "EQUIPMENT",
  "PERSONNEL",
  "SERVICE",
  "CONSUMABLE",
  "COMPONENT",
  "OTHER",
];
const DAY_MODES: DayMode[] = ["HALF_EXTRA", "FULL_DAYS", "FIXED1", "FIXED2"];

export type DatabaseBackupApplyResult = {
  counts: DatabaseBackupCounts;
  warnings: string[];
};

type IdMap = Map<string, string>;

function asRecord(value: unknown): Record<string, unknown> | null {
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

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function ownersOf(v: unknown): CatalogOwner[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is CatalogOwner =>
    OWNERS.includes(x as CatalogOwner),
  );
}

function notesOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asJson(v: unknown, fallback: Prisma.InputJsonValue = {}): Prisma.InputJsonValue {
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
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => !!row);
}

function sortByParent<T extends { id: string; parentId: string | null }>(
  rows: T[],
): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result: T[] = [];
  const seen = new Set<string>();

  function visit(row: T) {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    if (row.parentId && byId.has(row.parentId)) {
      visit(byId.get(row.parentId)!);
    }
    result.push(row);
  }

  for (const row of rows) visit(row);
  return result;
}

function mapped(
  map: IdMap,
  dumpId: string | null | undefined,
): string | null {
  if (!dumpId) return null;
  return map.get(dumpId) ?? null;
}

export async function collectDatabaseBackup(): Promise<DatabaseBackupFile> {
  const [
    specialties,
    users,
    userSpecialties,
    catalogCategories,
    catalogItems,
    kits,
    kitComponents,
    clients,
    venues,
    venuePhotos,
    vehicles,
    legalEntities,
    legalEntityBankAccounts,
    equipmentUnits,
    equipmentDocuments,
    quoteTemplates,
    quoteSnapshots,
    quoteAuditEvents,
    specRevisions,
  ] = await Promise.all([
    prisma.specialty.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.userSpecialty.findMany(),
    prisma.catalogCategory.findMany({ orderBy: { path: "asc" } }),
    prisma.catalogItem.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.kit.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.kitComponent.findMany(),
    prisma.client.findMany({ orderBy: { companyName: "asc" } }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    prisma.venuePhoto.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { plateNumber: "asc" } }),
    prisma.legalEntity.findMany({ orderBy: { shortName: "asc" } }),
    prisma.legalEntityBankAccount.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.equipmentUnit.findMany({ orderBy: { unitNumber: "asc" } }),
    prisma.equipmentDocument.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.quoteSnapshot.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quoteAuditEvent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.specRevision.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return {
    kind: DATABASE_BACKUP_KIND,
    version: DATABASE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: JSON.parse(
      JSON.stringify({
        specialties,
        users,
        userSpecialties,
        catalogCategories,
        catalogItems,
        kits,
        kitComponents,
        clients,
        venues,
        venuePhotos,
        vehicles,
        legalEntities,
        legalEntityBankAccounts,
        equipmentUnits,
        equipmentDocuments,
        quoteTemplates,
        quoteSnapshots,
        quoteAuditEvents,
        specRevisions,
      }),
    ) as DatabaseBackupTables,
  };
}

export function parseDatabaseBackup(raw: unknown): DatabaseBackupFile {
  const obj = asRecord(raw);
  if (!obj) {
    throw new Error("Файл пустой или повреждён");
  }
  if (obj.kind !== DATABASE_BACKUP_KIND) {
    throw new Error("Это не файл экспорта CRM");
  }
  const version = num(obj.version, 0);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Неизвестная версия файла экспорта");
  }
  if (version > DATABASE_BACKUP_VERSION) {
    throw new Error(
      `Файл версии ${version} новее, чем поддерживает эта CRM (${DATABASE_BACKUP_VERSION})`,
    );
  }
  const tables = asRecord(obj.tables);
  if (!tables) {
    throw new Error("В файле нет таблиц");
  }
  return {
    kind: DATABASE_BACKUP_KIND,
    version,
    exportedAt: str(obj.exportedAt, new Date().toISOString()),
    tables: {
      specialties: rowsOf(tables.specialties),
      users: rowsOf(tables.users),
      userSpecialties: rowsOf(tables.userSpecialties),
      catalogCategories: rowsOf(tables.catalogCategories),
      catalogItems: rowsOf(tables.catalogItems),
      kits: rowsOf(tables.kits),
      kitComponents: rowsOf(tables.kitComponents),
      clients: rowsOf(tables.clients),
      venues: rowsOf(tables.venues),
      venuePhotos: rowsOf(tables.venuePhotos),
      vehicles: rowsOf(tables.vehicles),
      legalEntities: rowsOf(tables.legalEntities),
      legalEntityBankAccounts: rowsOf(tables.legalEntityBankAccounts),
      equipmentUnits: rowsOf(tables.equipmentUnits),
      equipmentDocuments: rowsOf(tables.equipmentDocuments),
      quoteTemplates: rowsOf(tables.quoteTemplates),
      quoteSnapshots: rowsOf(tables.quoteSnapshots),
      quoteAuditEvents: rowsOf(tables.quoteAuditEvents),
      specRevisions: rowsOf(tables.specRevisions),
    },
  };
}

export async function applyDatabaseBackup(
  backup: DatabaseBackupFile,
  currentUserId: string,
): Promise<DatabaseBackupApplyResult> {
  const warnings: string[] = [];
  const counts = emptyBackupCounts();

  await prisma.$transaction(
    async (tx) => {
      const specialtyIds = await importSpecialties(
        tx,
        backup.tables.specialties,
        counts,
        warnings,
      );
      const userIds = await importUsers(
        tx,
        backup.tables.users,
        currentUserId,
        counts,
        warnings,
      );
      await importUserSpecialties(
        tx,
        backup.tables.userSpecialties,
        userIds,
        specialtyIds,
        counts,
        warnings,
      );
      const categoryIds = await importCategories(
        tx,
        backup.tables.catalogCategories,
        counts,
        warnings,
      );
      const itemIds = await importCatalogItems(
        tx,
        backup.tables.catalogItems,
        categoryIds,
        counts,
        warnings,
      );
      const kitIds = await importKits(
        tx,
        backup.tables.kits,
        categoryIds,
        counts,
        warnings,
      );
      await importKitComponents(
        tx,
        backup.tables.kitComponents,
        kitIds,
        itemIds,
        counts,
        warnings,
      );
      await importClients(tx, backup.tables.clients, counts, warnings);
      const venueIds = await importVenues(
        tx,
        backup.tables.venues,
        counts,
        warnings,
      );
      await importVenuePhotos(
        tx,
        backup.tables.venuePhotos,
        venueIds,
        counts,
        warnings,
      );
      await importVehicles(tx, backup.tables.vehicles, counts, warnings);
      const legalIds = await importLegalEntities(
        tx,
        backup.tables.legalEntities,
        counts,
        warnings,
      );
      await importLegalEntityAccounts(
        tx,
        backup.tables.legalEntityBankAccounts,
        legalIds,
        counts,
        warnings,
      );
      await importEquipmentUnits(
        tx,
        backup.tables.equipmentUnits,
        itemIds,
        counts,
        warnings,
      );
      await importEquipmentDocuments(
        tx,
        backup.tables.equipmentDocuments,
        itemIds,
        userIds,
        currentUserId,
        counts,
        warnings,
      );
      await importQuoteTemplates(
        tx,
        backup.tables.quoteTemplates,
        userIds,
        currentUserId,
        counts,
        warnings,
      );
      await importQuoteSnapshots(
        tx,
        backup.tables.quoteSnapshots,
        userIds,
        counts,
        warnings,
      );
      await importQuoteAuditEvents(
        tx,
        backup.tables.quoteAuditEvents,
        userIds,
        counts,
        warnings,
      );
      await importSpecRevisions(
        tx,
        backup.tables.specRevisions,
        userIds,
        counts,
        warnings,
      );
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  return { counts, warnings };
}

async function importSpecialties(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const name = str(rec.name).trim();
    if (!id || !name) {
      warnings.push("Пропущена специальность без id или названия");
      continue;
    }
    const data = {
      name,
      sortOrder: int(rec.sortOrder, 0),
      hourlyRate: num(rec.hourlyRate, 0),
      shiftRate: num(rec.shiftRate, 0),
      description: str(rec.description),
      active: bool(rec.active, true),
      createdAt: asDate(rec.createdAt),
    };
    const byId = await tx.specialty.findUnique({ where: { id } });
    const byName = byId
      ? null
      : await tx.specialty.findUnique({ where: { name } });
    const target = byId ?? byName;
    if (target) {
      map.set(id, target.id);
      await tx.specialty.update({
        where: { id: target.id },
        data: {
          name: data.name,
          sortOrder: data.sortOrder,
          hourlyRate: data.hourlyRate,
          shiftRate: data.shiftRate,
          description: data.description,
          active: data.active,
        },
      });
    } else {
      map.set(id, id);
      await tx.specialty.create({
        data: { id, ...data },
      });
    }
    counts.specialties += 1;
  }
  return map;
}

async function importUsers(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  currentUserId: string,
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const email = str(rec.email).trim().toLowerCase();
    if (!id || !email) {
      warnings.push("Пропущен пользователь без id или email");
      continue;
    }
    const passwordHash = str(rec.passwordHash);
    const byId = await tx.user.findUnique({ where: { id } });
    const byEmail = byId
      ? null
      : await tx.user.findUnique({ where: { email } });
    const target = byId ?? byEmail;
    const isCurrent = target?.id === currentUserId || id === currentUserId;
    const profile = {
      email,
      name: str(rec.name, email),
      firstName: str(rec.firstName),
      lastName: str(rec.lastName),
      patronymic: str(rec.patronymic),
      phone: str(rec.phone),
      comment: str(rec.comment),
      role: pickEnum(rec.role, ROLES, "EMPLOYEE" as Role),
      active: bool(rec.active, true),
      monthlySalary: num(rec.monthlySalary, 0),
      agencyPercent: num(rec.agencyPercent, 5),
      owners: ownersOf(rec.owners),
      timezone: str(rec.timezone, "Asia/Irkutsk") || "Asia/Irkutsk",
      weatherPlace: pickEnum(
        rec.weatherPlace,
        ["IRKUTSK", "IRKUTSK_OBLAST"] as const,
        "IRKUTSK" as const,
      ),
    };

    if (target) {
      map.set(id, target.id);
      const data: Prisma.UserUpdateInput = {
        name: profile.name,
        firstName: profile.firstName,
        lastName: profile.lastName,
        patronymic: profile.patronymic,
        phone: profile.phone,
        comment: profile.comment,
        monthlySalary: profile.monthlySalary,
        agencyPercent: profile.agencyPercent,
        owners: profile.owners,
        timezone: profile.timezone,
        weatherPlace: profile.weatherPlace,
      };
      if (!isCurrent) {
        data.email = profile.email;
        data.role = profile.role;
        data.active = profile.active;
        if (passwordHash) data.passwordHash = passwordHash;
      } else {
        data.active = true;
      }
      await tx.user.update({
        where: { id: target.id },
        data,
      });
    } else {
      if (!passwordHash) {
        warnings.push(`Пользователь ${email}: нет пароля, пропущен`);
        continue;
      }
      map.set(id, id);
      await tx.user.create({
        data: {
          id,
          passwordHash,
          createdAt: asDate(rec.createdAt),
          ...profile,
        },
      });
    }
    counts.users += 1;
  }
  return map;
}

async function importUserSpecialties(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  userIds: IdMap,
  specialtyIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const userId = mapped(userIds, str(rec.userId));
    const specialtyId = mapped(specialtyIds, str(rec.specialtyId));
    if (!userId || !specialtyId) {
      warnings.push("Пропущена ставка сотрудника: нет пользователя или специальности");
      continue;
    }
    const data = {
      hourlyRate: num(rec.hourlyRate, 0),
      shiftRate: num(rec.shiftRate, 0),
    };
    await tx.userSpecialty.upsert({
      where: { userId_specialtyId: { userId, specialtyId } },
      create: {
        userId,
        specialtyId,
        ...data,
        createdAt: asDate(rec.createdAt),
      },
      update: data,
    });
    counts.userSpecialties += 1;
  }
}

async function importCategories(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const parsed = rowsOf(raw)
    .map((rec) => {
      const id = requireId(rec);
      const name = str(rec.name).trim();
      const path = str(rec.path).trim();
      if (!id || !name || !path) return null;
      return {
        id,
        name,
        path,
        parentId: optStr(rec.parentId),
        kind: pickEnum(rec.kind, CATEGORY_KINDS, "EQUIPMENT" as CategoryKind),
        subtotalLabel: str(rec.subtotalLabel),
        sortOrder: int(rec.sortOrder, 0),
        active: bool(rec.active, true),
        createdAt: asDate(rec.createdAt),
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  const map: IdMap = new Map();
  for (const row of sortByParent(parsed)) {
    const byId = await tx.catalogCategory.findUnique({ where: { id: row.id } });
    const byPath = byId
      ? null
      : await tx.catalogCategory.findUnique({ where: { path: row.path } });
    const target = byId ?? byPath;
    const parentId = row.parentId ? mapped(map, row.parentId) : null;
    const data = {
      name: row.name,
      path: row.path,
      parentId,
      kind: row.kind,
      subtotalLabel: row.subtotalLabel,
      sortOrder: row.sortOrder,
      active: row.active,
    };
    if (target) {
      map.set(row.id, target.id);
      await tx.catalogCategory.update({
        where: { id: target.id },
        data,
      });
    } else {
      map.set(row.id, row.id);
      await tx.catalogCategory.create({
        data: { id: row.id, ...data, createdAt: row.createdAt },
      });
    }
    counts.catalogCategories += 1;
  }
  if (parsed.length !== rowsOf(raw).length) {
    warnings.push("Часть категорий пропущена: нет id, названия или пути");
  }
  return map;
}

async function importCatalogItems(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  categoryIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const name = str(rec.name).trim();
    const categoryId = mapped(categoryIds, str(rec.categoryId));
    if (!id || !name || !categoryId) {
      warnings.push(
        `Позиция каталога «${name || id || "?"}»: нет категории, пропущена`,
      );
      continue;
    }
    let equipmentCode = optNum(rec.equipmentCode);
    if (equipmentCode != null) equipmentCode = Math.trunc(equipmentCode);

    const byId = await tx.catalogItem.findUnique({ where: { id } });
    const byCode =
      !byId && equipmentCode != null
        ? await tx.catalogItem.findFirst({ where: { equipmentCode } })
        : null;
    const target = byId ?? byCode;
    const targetId = target?.id ?? id;

    if (equipmentCode != null) {
      const clash = await tx.catalogItem.findFirst({
        where: { equipmentCode, NOT: { id: targetId } },
        select: { id: true },
      });
      if (clash) equipmentCode = null;
    }

    const data = {
      categoryId,
      name,
      model: optStr(rec.model),
      manufacturer: optStr(rec.manufacturer),
      basePrice: num(rec.basePrice, 0),
      cashlessOverride: optNum(rec.cashlessOverride),
      estimatedValue: optNum(rec.estimatedValue),
      costPrice: optNum(rec.costPrice),
      stockQty: int(rec.stockQty, 0),
      width: optNum(rec.width),
      height: optNum(rec.height),
      depth: optNum(rec.depth),
      power: optNum(rec.power),
      weight: optNum(rec.weight),
      comment: optStr(rec.comment),
      photoPath: optStr(rec.photoPath),
      equipmentCode,
      owners: ownersOf(rec.owners),
      dayMode: pickEnum(rec.dayMode, DAY_MODES, "HALF_EXTRA" as DayMode),
      itemKind: pickEnum(rec.itemKind, ITEM_KINDS, "EQUIPMENT" as ItemKind),
      active: bool(rec.active, true),
      showInCatalog: bool(rec.showInCatalog, true),
      sortOrder: int(rec.sortOrder, 0),
    };

    if (target) {
      map.set(id, target.id);
      await tx.catalogItem.update({ where: { id: target.id }, data });
    } else {
      map.set(id, id);
      await tx.catalogItem.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.catalogItems += 1;
  }
  return map;
}

async function importKits(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  categoryIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const name = str(rec.name).trim();
    if (!id || !name) {
      warnings.push("Пропущен комплект без id или названия");
      continue;
    }
    const dumpCategoryId = optStr(rec.categoryId);
    const categoryId = dumpCategoryId
      ? mapped(categoryIds, dumpCategoryId)
      : null;
    const data = {
      name,
      description: optStr(rec.description),
      categoryId,
      basePrice: optNum(rec.basePrice),
      active: bool(rec.active, true),
      sortOrder: int(rec.sortOrder, 0),
    };
    const existing = await tx.kit.findUnique({ where: { id } });
    if (existing) {
      map.set(id, existing.id);
      await tx.kit.update({ where: { id: existing.id }, data });
    } else {
      map.set(id, id);
      await tx.kit.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.kits += 1;
  }
  return map;
}

async function importKitComponents(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  kitIds: IdMap,
  itemIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const kitId = mapped(kitIds, str(rec.kitId));
    const catalogItemId = mapped(itemIds, str(rec.catalogItemId));
    if (!kitId || !catalogItemId) {
      warnings.push("Пропущен состав комплекта: нет комплекта или позиции");
      continue;
    }
    await tx.kitComponent.upsert({
      where: { kitId_catalogItemId: { kitId, catalogItemId } },
      create: {
        kitId,
        catalogItemId,
        qty: num(rec.qty, 1),
      },
      update: { qty: num(rec.qty, 1) },
    });
    counts.kitComponents += 1;
  }
}

async function importClients(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const companyName = str(rec.companyName).trim();
    if (!id || !companyName) {
      warnings.push("Пропущен клиент без id или названия");
      continue;
    }
    const data = {
      companyName,
      contactName: str(rec.contactName),
      phone: str(rec.phone),
      email: str(rec.email),
      comment: str(rec.comment),
      inn: str(rec.inn),
      legalAddress: str(rec.legalAddress),
      legalDetails: str(rec.legalDetails),
      active: bool(rec.active, true),
    };
    const existing = await tx.client.findUnique({ where: { id } });
    if (existing) {
      await tx.client.update({ where: { id }, data });
    } else {
      await tx.client.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.clients += 1;
  }
}

async function importVenues(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const name = str(rec.name).trim();
    if (!id || !name) {
      warnings.push("Пропущена площадка без id или названия");
      continue;
    }
    const data = {
      name,
      address: str(rec.address),
      mapUrl: str(rec.mapUrl),
      comment: str(rec.comment),
      active: bool(rec.active, true),
    };
    const existing = await tx.venue.findUnique({ where: { id } });
    if (existing) {
      map.set(id, existing.id);
      await tx.venue.update({ where: { id }, data });
    } else {
      map.set(id, id);
      await tx.venue.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.venues += 1;
  }
  return map;
}

async function importVenuePhotos(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  venueIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const venueId = mapped(venueIds, str(rec.venueId));
    if (!id || !venueId) {
      warnings.push("Пропущено фото площадки: нет площадки");
      continue;
    }
    const data = {
      venueId,
      filename: str(rec.filename, "photo"),
      mimeType: str(rec.mimeType, "image/jpeg"),
      size: int(rec.size, 0),
      storagePath: str(rec.storagePath),
      sortOrder: int(rec.sortOrder, 0),
    };
    if (!data.storagePath) {
      warnings.push(`Фото площадки ${id}: нет пути к файлу`);
      continue;
    }
    const existing = await tx.venuePhoto.findUnique({ where: { id } });
    if (existing) {
      await tx.venuePhoto.update({ where: { id }, data });
    } else {
      await tx.venuePhoto.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.venuePhotos += 1;
  }
}

async function importVehicles(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const plateNumber = str(rec.plateNumber).trim();
    if (!id || !plateNumber) {
      warnings.push("Пропущен транспорт без id или номера");
      continue;
    }
    const data = {
      plateNumber,
      make: str(rec.make),
      model: str(rec.model),
      series: str(rec.series),
      certificateNumber: str(rec.certificateNumber),
      fuelConsumption: num(rec.fuelConsumption, 0),
      mileage: num(rec.mileage, 0),
      operatingRules: str(rec.operatingRules),
      comment: str(rec.comment),
      active: bool(rec.active, true),
    };
    const byId = await tx.vehicle.findUnique({ where: { id } });
    const byPlate = byId
      ? null
      : await tx.vehicle.findUnique({ where: { plateNumber } });
    const target = byId ?? byPlate;
    if (target) {
      const clash = await tx.vehicle.findFirst({
        where: { plateNumber, NOT: { id: target.id } },
        select: { id: true },
      });
      await tx.vehicle.update({
        where: { id: target.id },
        data: clash ? { ...data, plateNumber: undefined } : data,
      });
    } else {
      await tx.vehicle.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.vehicles += 1;
  }
}

async function importLegalEntities(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  counts: DatabaseBackupCounts,
  warnings: string[],
): Promise<IdMap> {
  const map: IdMap = new Map();
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const inn = str(rec.inn).replace(/\D/g, "");
    const shortName = str(rec.shortName).trim();
    if (!id || !inn || !shortName) {
      warnings.push("Пропущено юрлицо без id, ИНН или названия");
      continue;
    }
    const catalogOwnerRaw = rec.catalogOwner;
    const catalogOwner =
      typeof catalogOwnerRaw === "string" && OWNERS.includes(catalogOwnerRaw as CatalogOwner)
        ? (catalogOwnerRaw as CatalogOwner)
        : null;
    const data = {
      shortName,
      fullName: str(rec.fullName),
      inn,
      ogrnip: str(rec.ogrnip),
      legalAddress: str(rec.legalAddress),
      actualAddress: str(rec.actualAddress),
      phone: str(rec.phone),
      email: str(rec.email),
      catalogOwner,
      signatoryName: str(rec.signatoryName),
      sealPath: optStr(rec.sealPath),
      signaturePath: optStr(rec.signaturePath),
      active: bool(rec.active, true),
    };
    const byId = await tx.legalEntity.findUnique({ where: { id } });
    const byInn = byId
      ? null
      : await tx.legalEntity.findUnique({ where: { inn } });
    const target = byId ?? byInn;
    if (target) {
      map.set(id, target.id);
      await tx.legalEntity.update({ where: { id: target.id }, data });
    } else {
      map.set(id, id);
      await tx.legalEntity.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.legalEntities += 1;
  }
  return map;
}

async function importLegalEntityAccounts(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  legalIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const legalEntityId = mapped(legalIds, str(rec.legalEntityId));
    const account = str(rec.account).replace(/\D/g, "");
    if (!id || !legalEntityId || !account) {
      warnings.push("Пропущен счёт юрлица: нет юрлица или р/с");
      continue;
    }
    const data = {
      label: str(rec.label),
      bankName: str(rec.bankName),
      account,
      corrAccount: str(rec.corrAccount),
      bik: str(rec.bik),
      isDefault: bool(rec.isDefault, false),
      sortOrder: int(rec.sortOrder, 0),
    };
    const byId = await tx.legalEntityBankAccount.findUnique({ where: { id } });
    const byPair = byId
      ? null
      : await tx.legalEntityBankAccount.findUnique({
          where: { legalEntityId_account: { legalEntityId, account } },
        });
    const target = byId ?? byPair;
    if (target) {
      await tx.legalEntityBankAccount.update({
        where: { id: target.id },
        data: { ...data, legalEntityId },
      });
    } else {
      await tx.legalEntityBankAccount.create({
        data: {
          id,
          legalEntityId,
          ...data,
          createdAt: asDate(rec.createdAt),
        },
      });
    }
    counts.legalEntityBankAccounts += 1;
  }
}

async function importEquipmentUnits(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  itemIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const catalogItemId = mapped(itemIds, str(rec.catalogItemId));
    const unitNumber = int(rec.unitNumber, 0);
    if (!id || !catalogItemId || unitNumber < 1) {
      warnings.push("Пропущена единица оборудования: нет позиции или номера");
      continue;
    }
    let qrToken = str(rec.qrToken).trim();
    const byId = await tx.equipmentUnit.findUnique({ where: { id } });
    const byPair = byId
      ? null
      : await tx.equipmentUnit.findUnique({
          where: { catalogItemId_unitNumber: { catalogItemId, unitNumber } },
        });
    const target = byId ?? byPair;
    const targetId = target?.id ?? id;

    if (qrToken) {
      const clash = await tx.equipmentUnit.findFirst({
        where: { qrToken, NOT: { id: targetId } },
        select: { id: true },
      });
      if (clash) qrToken = newQrToken();
    } else {
      qrToken = newQrToken();
    }

    const data = {
      catalogItemId,
      unitNumber,
      qrToken,
      label: optStr(rec.label),
      active: bool(rec.active, true),
      inRepair: bool(rec.inRepair, false),
    };
    if (target) {
      await tx.equipmentUnit.update({ where: { id: target.id }, data });
    } else {
      await tx.equipmentUnit.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.equipmentUnits += 1;
  }
}

async function importEquipmentDocuments(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  itemIds: IdMap,
  userIds: IdMap,
  currentUserId: string,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const catalogItemId = mapped(itemIds, str(rec.catalogItemId));
    const uploaderId =
      mapped(userIds, str(rec.uploaderId)) || currentUserId;
    if (!id || !catalogItemId) {
      warnings.push("Пропущен документ оборудования: нет позиции");
      continue;
    }
    const storagePath = str(rec.storagePath);
    if (!storagePath) {
      warnings.push(`Документ оборудования ${id}: нет пути к файлу`);
      continue;
    }
    const data = {
      catalogItemId,
      uploaderId,
      filename: str(rec.filename, "file"),
      mimeType: str(rec.mimeType, "application/octet-stream"),
      size: int(rec.size, 0),
      storagePath,
      description: optStr(rec.description),
    };
    const existing = await tx.equipmentDocument.findUnique({ where: { id } });
    if (existing) {
      await tx.equipmentDocument.update({ where: { id }, data });
    } else {
      await tx.equipmentDocument.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.equipmentDocuments += 1;
  }
}

async function importQuoteTemplates(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  userIds: IdMap,
  currentUserId: string,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const name = str(rec.name).trim();
    if (!id || !name) {
      warnings.push("Пропущен шаблон сметы без id или названия");
      continue;
    }
    const ownerId = mapped(userIds, str(rec.ownerId)) || currentUserId;
    const data = {
      name,
      ownerId,
      discountPercent: num(rec.discountPercent, 0),
      cashless: bool(rec.cashless, true),
      cashlessPercent: num(rec.cashlessPercent, 10),
      notes: notesOf(rec.notes),
      payload: (rec.payload ?? {}) as Prisma.InputJsonValue,
    };
    const existing = await tx.quoteTemplate.findUnique({ where: { id } });
    if (existing) {
      await tx.quoteTemplate.update({ where: { id }, data });
    } else {
      await tx.quoteTemplate.create({
        data: { id, ...data, createdAt: asDate(rec.createdAt) },
      });
    }
    counts.quoteTemplates += 1;
  }
}

async function quoteExists(
  tx: Prisma.TransactionClient,
  quoteId: string,
): Promise<boolean> {
  if (!quoteId) return false;
  const row = await tx.quote.findUnique({
    where: { id: quoteId },
    select: { id: true },
  });
  return Boolean(row);
}

async function importQuoteSnapshots(
  tx: Prisma.TransactionClient,
  raw: unknown[],
  userIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = str(rec.quoteId).trim();
    if (!id || !quoteId) {
      warnings.push("Пропущен снимок сметы без id или quoteId");
      continue;
    }
    if (!(await quoteExists(tx, quoteId))) {
      warnings.push(`Снимок сметы ${id}: смета ${quoteId} не найдена`);
      continue;
    }
    const createdById = mapped(userIds, str(rec.createdById));
    const data = {
      quoteId,
      title: str(rec.title),
      payload: asJson(rec.payload),
      createdById,
    };
    const existing = await tx.quoteSnapshot.findUnique({ where: { id } });
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
  userIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = str(rec.quoteId).trim();
    if (!id || !quoteId) {
      warnings.push("Пропущено событие журнала сметы без id или quoteId");
      continue;
    }
    if (!(await quoteExists(tx, quoteId))) {
      warnings.push(`Журнал сметы ${id}: смета ${quoteId} не найдена`);
      continue;
    }
    const actorId = mapped(userIds, str(rec.actorId));
    const data = {
      quoteId,
      actorId,
      action: str(rec.action, "PATCH"),
      summary: str(rec.summary),
      diff: rec.diff == null ? undefined : asJson(rec.diff),
    };
    const existing = await tx.quoteAuditEvent.findUnique({ where: { id } });
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
  userIds: IdMap,
  counts: DatabaseBackupCounts,
  warnings: string[],
) {
  for (const rec of rowsOf(raw)) {
    const id = requireId(rec);
    const quoteId = str(rec.quoteId).trim();
    if (!id || !quoteId) {
      warnings.push("Пропущен снимок спецификации без id или quoteId");
      continue;
    }
    if (!(await quoteExists(tx, quoteId))) {
      warnings.push(`Снимок спецификации ${id}: смета ${quoteId} не найдена`);
      continue;
    }
    const createdById = mapped(userIds, str(rec.createdById));
    const data = {
      quoteId,
      title: str(rec.title),
      lines: asJson(rec.lines, []),
      note: optStr(rec.note),
      createdById,
    };
    const existing = await tx.specRevision.findUnique({ where: { id } });
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
