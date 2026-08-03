import {
  PrismaClient,
  CategoryKind,
  DayMode,
  ItemKind,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import path from "node:path";
import { inferCatalogOwners } from "../src/lib/catalog-owner";

const prisma = new PrismaClient();

const XLSX =
  process.env.CATALOG_XLSX ||
  path.resolve(
    process.cwd(),
    "../Пример исходников/Каталог выгрузка с golova.xlsx",
  );

function mapItemKind(typeRaw: string): ItemKind {
  const t = typeRaw.toLowerCase().trim();
  if (t.includes("услуг")) return ItemKind.SERVICE;
  if (t.includes("расход")) return ItemKind.CONSUMABLE;
  if (t.includes("комплект")) return ItemKind.COMPONENT;
  if (t.includes("персонал")) return ItemKind.PERSONNEL;
  return ItemKind.EQUIPMENT;
}

function mapCategoryKind(top: string, itemKind: ItemKind): CategoryKind {
  if (itemKind === ItemKind.PERSONNEL || top === "Услуги") {
    return CategoryKind.PERSONNEL;
  }
  if (top === "Разное") return CategoryKind.OTHER;
  return CategoryKind.EQUIPMENT;
}

function defaultDayMode(itemKind: ItemKind): DayMode {
  return itemKind === ItemKind.PERSONNEL || itemKind === ItemKind.SERVICE
    ? DayMode.FULL_DAYS
    : DayMode.HALF_EXTRA;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DEFAULT_SPECIALTIES: Array<{
  name: string;
  hourlyRate: number;
  shiftRate: number;
}> = [
  { name: "Видеоинженер", hourlyRate: 1800, shiftRate: 15000 },
  { name: "Видеорежиссёр эфира", hourlyRate: 2000, shiftRate: 16000 },
  { name: "Звукооператор", hourlyRate: 1500, shiftRate: 12000 },
  { name: "Звукорежиссёр эфира", hourlyRate: 1800, shiftRate: 14000 },
  { name: "Звукомонтажёр", hourlyRate: 1400, shiftRate: 11000 },
  { name: "Звукотехник", hourlyRate: 1200, shiftRate: 10000 },
];

async function ensureSpecialties() {
  for (let i = 0; i < DEFAULT_SPECIALTIES.length; i++) {
    const s = DEFAULT_SPECIALTIES[i];
    await prisma.specialty.upsert({
      where: { name: s.name },
      update: {
        sortOrder: i,
        active: true,
        hourlyRate: s.hourlyRate,
        shiftRate: s.shiftRate,
      },
      create: {
        name: s.name,
        sortOrder: i,
        hourlyRate: s.hourlyRate,
        shiftRate: s.shiftRate,
      },
    });
  }
}

async function ensureManager() {
  const email = process.env.BOOTSTRAP_MANAGER_EMAIL || "manager@local.test";
  const password = process.env.BOOTSTRAP_MANAGER_PASSWORD || "manager123";
  const name = process.env.BOOTSTRAP_MANAGER_NAME || "Стрельченко Артем";
  const passwordHash = await bcrypt.hash(password, 10);
  const useDemoProfile = email === "manager@local.test";
  await prisma.user.upsert({
    where: { email },
    update: useDemoProfile
      ? {
          name,
          firstName: "Артем",
          lastName: "Стрельченко",
          patronymic: "Романович",
          passwordHash,
        }
      : { name, passwordHash },
    create: {
      email,
      name,
      passwordHash,
      role: Role.MANAGER,
      ...(useDemoProfile
        ? {
            firstName: "Артем",
            lastName: "Стрельченко",
            patronymic: "Романович",
          }
        : {}),
    },
  });
  console.log(`Manager: ${email}`);
}

async function ensureSpecialtiesAndEmployee() {
  await ensureSpecialties();

  const email = "employee@local.test";
  const password = "employee123";
  const employee = await prisma.user.upsert({
    where: { email },
    update: {
      firstName: "Иван",
      lastName: "Петров",
      patronymic: "Сергеевич",
      phone: "+79001234567",
    },
    create: {
      email,
      name: "Петров Иван Сергеевич",
      firstName: "Иван",
      lastName: "Петров",
      patronymic: "Сергеевич",
      phone: "+79001234567",
      passwordHash: await bcrypt.hash(password, 10),
      role: Role.EMPLOYEE,
    },
  });

  const sound = await prisma.specialty.findUnique({
    where: { name: "Звукооператор" },
  });
  const video = await prisma.specialty.findUnique({
    where: { name: "Видеоинженер" },
  });
  if (sound) {
    await prisma.userSpecialty.upsert({
      where: {
        userId_specialtyId: {
          userId: employee.id,
          specialtyId: sound.id,
        },
      },
      update: { hourlyRate: 1500, shiftRate: 12000 },
      create: {
        userId: employee.id,
        specialtyId: sound.id,
        hourlyRate: 1500,
        shiftRate: 12000,
      },
    });
  }
  if (video) {
    await prisma.userSpecialty.upsert({
      where: {
        userId_specialtyId: {
          userId: employee.id,
          specialtyId: video.id,
        },
      },
      update: { hourlyRate: 1800, shiftRate: 15000 },
      create: {
        userId: employee.id,
        specialtyId: video.id,
        hourlyRate: 1800,
        shiftRate: 15000,
      },
    });
  }

  console.log(`Employee: ${email} / ${password}`);

  const brigEmail = "brigadier@local.test";
  const brigPassword = "brigadier123";
  await prisma.user.upsert({
    where: { email: brigEmail },
    update: {
      firstName: "Алексей",
      lastName: "Сидоров",
      patronymic: "Игоревич",
      role: Role.BRIGADIER,
    },
    create: {
      email: brigEmail,
      name: "Сидоров Алексей Игоревич",
      firstName: "Алексей",
      lastName: "Сидоров",
      patronymic: "Игоревич",
      passwordHash: await bcrypt.hash(brigPassword, 10),
      role: Role.BRIGADIER,
    },
  });
  console.log(`Brigadier: ${brigEmail} / ${brigPassword}`);
}

async function clearCatalog() {
  await prisma.notification.deleteMany();
  await prisma.quoteAssignment.deleteMany();
  await prisma.quoteBlock.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.kitComponent.deleteMany();
  await prisma.kit.deleteMany();
  await prisma.catalogItem.deleteMany();
  await prisma.catalogCategory.deleteMany();
  console.log("Cleared catalog, kits, quotes, notifications");
}

async function ensureCategoryPath(
  fullPath: string,
  cache: Map<string, string>,
  defaultKind: CategoryKind,
): Promise<string> {
  const parts = fullPath
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  let parentId: string | null = null;
  let built = "";

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    built = built ? `${built}/${name}` : name;
    if (cache.has(built)) {
      parentId = cache.get(built)!;
      continue;
    }
    const kind =
      i === 0
        ? mapCategoryKind(name, ItemKind.EQUIPMENT)
        : defaultKind;
    const created = await prisma.catalogCategory.create({
      data: {
        name,
        path: built,
        parentId,
        kind,
        subtotalLabel: `Итого ${name}:`,
        sortOrder: cache.size,
      },
    });
    cache.set(built, created.id);
    parentId = created.id;
  }
  return parentId!;
}

async function importCatalog() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No sheet in ${XLSX}`);

  const categoryCache = new Map<string, string>();
  let created = 0;
  let sort = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    // queue via sync collect first
  });

  const rows: Array<{
    type: string;
    name: string;
    model: string | null;
    manufacturer: string | null;
    catalogPath: string;
    price: number;
    estimated: number | null;
    stock: number;
    width: number | null;
    height: number | null;
    depth: number | null;
    power: number | null;
    weight: number | null;
    comment: string | null;
  }> = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const type = String(row.getCell(1).value ?? "").trim();
    const name = String(row.getCell(2).value ?? "").trim();
    const catalogPath = String(row.getCell(5).value ?? "").trim();
    if (!name || !catalogPath) return;
    rows.push({
      type,
      name,
      model: row.getCell(3).value
        ? String(row.getCell(3).value).trim()
        : null,
      manufacturer: row.getCell(4).value
        ? String(row.getCell(4).value).trim()
        : null,
      catalogPath,
      // Columns: 1 Тип, 2 Товар, 3 Модель, 4 Производитель, 5 Путь,
      // 6 Цена аренды, 7 Оценочная стоимость, 8 Кол-во, 9 Склад, 10 Ед.изм,
      // 11 Ширина, 12 Высота, 13 Глубина, 14 Мощность, 15 Вес, 16 Ток, 17 Комментарий
      price: num(row.getCell(6).value) ?? 0,
      estimated: num(row.getCell(7).value),
      stock: Math.max(0, Math.round(num(row.getCell(8).value) ?? 0)),
      width: num(row.getCell(11).value),
      height: num(row.getCell(12).value),
      depth: num(row.getCell(13).value),
      power: num(row.getCell(14).value),
      weight: num(row.getCell(15).value),
      comment: row.getCell(17).value
        ? String(row.getCell(17).value).trim()
        : null,
    });
  });

  for (const r of rows) {
    const itemKind = mapItemKind(r.type);
    const top = r.catalogPath.split("/")[0]?.trim() || "Разное";
    const kind = mapCategoryKind(top, itemKind);
    const categoryId = await ensureCategoryPath(
      r.catalogPath,
      categoryCache,
      kind,
    );
    await prisma.catalogItem.create({
      data: {
        categoryId,
        name: r.name,
        model: r.model,
        manufacturer: r.manufacturer,
        basePrice: r.price,
        estimatedValue: r.estimated,
        stockQty: r.stock,
        width: r.width,
        height: r.height,
        depth: r.depth,
        power: r.power,
        weight: r.weight,
        comment: r.comment,
        owners: inferCatalogOwners(r.catalogPath, r.name),
        itemKind,
        dayMode: defaultDayMode(itemKind),
        sortOrder: sort++,
      },
    });
    created += 1;
    if (created % 100 === 0) console.log(`… ${created} items`);
  }

  console.log(
    `Imported ${created} items into ${categoryCache.size} category paths`,
  );
}

async function main() {
  // Docker/prod install: create admin + specialties + catalog once, never wipe data.
  if (process.env.BOOTSTRAP_MODE === "prod") {
    const users = await prisma.user.count();
    const items = await prisma.catalogItem.count();
    if (users > 0 && items > 0) {
      console.log("Already initialized — skip bootstrap");
      return;
    }
    if (users === 0) {
      await ensureManager();
    }
    await ensureSpecialties();
    if (items === 0) {
      await importCatalog();
    }
    console.log("Production bootstrap complete");
    return;
  }

  await ensureManager();
  await ensureSpecialtiesAndEmployee();
  await clearCatalog();
  await importCatalog();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
