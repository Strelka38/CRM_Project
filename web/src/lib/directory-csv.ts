import type { CatalogOwner } from "@prisma/client";
import {
  csvBool,
  csvCell,
  csvHeaderIndex,
  csvNum,
  parseCsv,
} from "@/lib/csv";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import type { AppRole } from "@/lib/roles";
import { APP_ROLES } from "@/lib/roles";

function parseTable(text: string, required: string[]): {
  rows: string[][];
  map: Map<string, number>;
  errors: string[];
} {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], map: new Map(), errors: ["Файл пуст"] };
  }
  const headers = table[0].map((h) => h.trim());
  const map = csvHeaderIndex(headers);
  for (const name of required) {
    if (!map.has(name.toLowerCase())) {
      return {
        rows: [],
        map,
        errors: [`Нет колонки «${name}»`],
      };
    }
  }
  return { rows: table.slice(1), map, errors: [] };
}

const OWNER_ALIASES: Record<string, CatalogOwnerValue> = {
  SHOW_MASTER: "SHOW_MASTER",
  DIAKOM: "DIAKOM",
  NE_EVENT: "NE_EVENT",
  ШМ: "SHOW_MASTER",
  ДК: "DIAKOM",
  NE: "NE_EVENT",
  НЕИВЕНТ: "NE_EVENT",
  "ШОУ-МАСТЕР": "SHOW_MASTER",
  "ШОУ МАСТЕР": "SHOW_MASTER",
  ДИАКОМ: "DIAKOM",
};

const OWNER_SHORT: Record<string, string> = {
  SHOW_MASTER: "ШМ",
  DIAKOM: "ДК",
  NE_EVENT: "NE",
};

const ROLE_ALIASES: Record<string, AppRole> = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  EMPLOYEE: "EMPLOYEE",
  BRIGADIER: "BRIGADIER",
  АДМИН: "ADMIN",
  АДМИНИСТРАТОР: "ADMIN",
  МЕНЕДЖЕР: "MANAGER",
  СОТРУДНИК: "EMPLOYEE",
  БРИГАДИР: "BRIGADIER",
};

export function formatOwnersCsv(owners: CatalogOwner[] | CatalogOwnerValue[]) {
  return owners.map((o) => OWNER_SHORT[o] || o).join(";");
}

export function parseOwnersCsv(raw: string): CatalogOwnerValue[] {
  if (!raw.trim()) return [];
  const out: CatalogOwnerValue[] = [];
  for (const part of raw.split(/[;,+|]/)) {
    const key = part.trim().toUpperCase();
    if (!key) continue;
    const mapped = OWNER_ALIASES[key] || OWNER_ALIASES[part.trim()];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out.slice(0, 3);
}

export function parseOwnerCsv(raw: string): CatalogOwner | null {
  const list = parseOwnersCsv(raw);
  return list[0] ?? null;
}

export function parseRoleCsv(raw: string): AppRole | null {
  const key = raw.trim().toUpperCase();
  if (!key) return null;
  const mapped = ROLE_ALIASES[key];
  if (mapped && APP_ROLES.includes(mapped)) return mapped;
  return null;
}

export const CLIENT_CSV_HEADERS = [
  "ID",
  "Компания",
  "Контакт",
  "Телефон",
  "Email",
  "ИНН",
  "Юр.адрес",
  "Реквизиты",
  "Комментарий",
  "Активен",
] as const;

export type ClientCsvRow = {
  id: string | null;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  inn: string;
  legalAddress: string;
  legalDetails: string;
  comment: string;
  active: boolean;
};

export function clientToCsvCells(c: ClientCsvRow & { id: string }): string[] {
  return [
    c.id,
    c.companyName,
    c.contactName,
    c.phone,
    c.email,
    c.inn,
    c.legalAddress,
    c.legalDetails,
    c.comment,
    c.active ? "1" : "0",
  ];
}

export function parseClientCsv(text: string): {
  rows: ClientCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Компания"]);
  if (errors.length) return { rows: [], errors };
  const out: ClientCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const companyName = csvCell(map, line, "Компания", "companyName", "Name").trim();
    if (!companyName) {
      errors.push(`Строка ${lineNo}: пустое название компании`);
      return;
    }
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      companyName,
      contactName: csvCell(map, line, "Контакт", "contactName").trim(),
      phone: csvCell(map, line, "Телефон", "phone").trim(),
      email: csvCell(map, line, "Email", "email").trim(),
      inn: csvCell(map, line, "ИНН", "inn").trim(),
      legalAddress: csvCell(map, line, "Юр.адрес", "legalAddress").trim(),
      legalDetails: csvCell(map, line, "Реквизиты", "legalDetails").trim(),
      comment: csvCell(map, line, "Комментарий", "comment").trim(),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
    });
  });
  return { rows: out, errors };
}

export const VENUE_CSV_HEADERS = [
  "ID",
  "Название",
  "Адрес",
  "Карта",
  "Комментарий",
  "Активен",
] as const;

export type VenueCsvRow = {
  id: string | null;
  name: string;
  address: string;
  mapUrl: string;
  comment: string;
  active: boolean;
};

export function venueToCsvCells(v: VenueCsvRow & { id: string }): string[] {
  return [v.id, v.name, v.address, v.mapUrl, v.comment, v.active ? "1" : "0"];
}

export function parseVenueCsv(text: string): {
  rows: VenueCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Название"]);
  if (errors.length) return { rows: [], errors };
  const out: VenueCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const name = csvCell(map, line, "Название", "name").trim();
    if (!name) {
      errors.push(`Строка ${lineNo}: пустое название`);
      return;
    }
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      name,
      address: csvCell(map, line, "Адрес", "address").trim(),
      mapUrl: csvCell(map, line, "Карта", "mapUrl", "Ссылка").trim(),
      comment: csvCell(map, line, "Комментарий", "comment").trim(),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
    });
  });
  return { rows: out, errors };
}

export type LegalAccountCsv = {
  label: string;
  bankName: string;
  account: string;
  corrAccount: string;
  bik: string;
  isDefault: boolean;
};

export const LEGAL_CSV_HEADERS = [
  "ID",
  "Краткое",
  "Полное",
  "ИНН",
  "ОГРНИП",
  "Юр.адрес",
  "Факт.адрес",
  "Телефон",
  "Email",
  "Склад",
  "Подписант",
  "Активен",
  "Счета",
] as const;

export type LegalCsvRow = {
  id: string | null;
  shortName: string;
  fullName: string;
  inn: string;
  ogrnip: string;
  legalAddress: string;
  actualAddress: string;
  phone: string;
  email: string;
  catalogOwner: CatalogOwner | null;
  signatoryName: string;
  active: boolean;
  accounts: LegalAccountCsv[];
};

export function formatLegalAccountsCsv(accounts: LegalAccountCsv[]): string {
  return accounts
    .map((a) =>
      [
        a.label,
        a.bankName,
        a.account,
        a.corrAccount,
        a.bik,
        a.isDefault ? "1" : "0",
      ]
        .map((p) => p.replace(/[|;]/g, "/"))
        .join("|"),
    )
    .join(";");
}

export function parseLegalAccountsCsv(raw: string): LegalAccountCsv[] {
  if (!raw.trim()) return [];
  return raw
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, i) => {
      const [label, bankName, account, corrAccount, bik, def] = chunk.split("|");
      return {
        label: (label || "").trim(),
        bankName: (bankName || "").trim(),
        account: (account || "").replace(/\D/g, ""),
        corrAccount: (corrAccount || "").replace(/\D/g, ""),
        bik: (bik || "").replace(/\D/g, ""),
        isDefault: def == null || def === "" ? i === 0 : csvBool(def, i === 0),
      };
    })
    .filter((a) => a.account.length > 0);
}

export function legalEntityToCsvCells(e: {
  id: string;
  shortName: string;
  fullName: string;
  inn: string;
  ogrnip: string;
  legalAddress: string;
  actualAddress: string;
  phone: string;
  email: string;
  catalogOwner: CatalogOwner | null;
  signatoryName: string;
  active: boolean;
  bankAccounts: LegalAccountCsv[];
}): string[] {
  return [
    e.id,
    e.shortName,
    e.fullName,
    e.inn,
    e.ogrnip,
    e.legalAddress,
    e.actualAddress,
    e.phone,
    e.email,
    e.catalogOwner ? OWNER_SHORT[e.catalogOwner] || e.catalogOwner : "",
    e.signatoryName,
    e.active ? "1" : "0",
    formatLegalAccountsCsv(e.bankAccounts),
  ];
}

export function parseLegalCsv(text: string): {
  rows: LegalCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["ИНН"]);
  if (errors.length) return { rows: [], errors };
  const out: LegalCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const inn = csvCell(map, line, "ИНН", "inn").replace(/\D/g, "");
    const shortName = csvCell(map, line, "Краткое", "shortName", "Наименование").trim();
    if (inn.length !== 10 && inn.length !== 12) {
      errors.push(`Строка ${lineNo}: ИНН должен быть 10 или 12 цифр`);
      return;
    }
    if (!shortName) {
      errors.push(`Строка ${lineNo}: пустое наименование`);
      return;
    }
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      shortName,
      fullName: csvCell(map, line, "Полное", "fullName").trim(),
      inn,
      ogrnip: csvCell(map, line, "ОГРНИП", "ogrnip").replace(/\D/g, ""),
      legalAddress: csvCell(map, line, "Юр.адрес", "legalAddress").trim(),
      actualAddress: csvCell(map, line, "Факт.адрес", "actualAddress").trim(),
      phone: csvCell(map, line, "Телефон", "phone").trim(),
      email: csvCell(map, line, "Email", "email").trim(),
      catalogOwner: parseOwnerCsv(csvCell(map, line, "Склад", "catalogOwner")),
      signatoryName: csvCell(map, line, "Подписант", "signatoryName").trim(),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
      accounts: parseLegalAccountsCsv(csvCell(map, line, "Счета", "accounts")),
    });
  });
  return { rows: out, errors };
}

export const USER_CSV_HEADERS = [
  "ID",
  "Email",
  "ФИО",
  "Фамилия",
  "Имя",
  "Отчество",
  "Телефон",
  "Роль",
  "Оклад",
  "Агентство %",
  "Фирмы",
  "Комментарий",
  "Активен",
  "Специальности",
  "Пароль",
] as const;

export type UserCsvRow = {
  id: string | null;
  email: string;
  name: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  phone: string;
  role: AppRole | null;
  monthlySalary: number;
  agencyPercent: number;
  owners: CatalogOwnerValue[];
  comment: string;
  active: boolean;
  specialties: string[];
  password: string | null;
};

export function userToCsvCells(u: {
  id: string;
  email: string;
  name: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  phone: string;
  role: AppRole;
  monthlySalary: number;
  agencyPercent?: number;
  owners: CatalogOwnerValue[];
  comment?: string;
  active: boolean;
  specialties: Array<{ specialty: { name: string } }>;
}): string[] {
  return [
    u.id,
    u.email,
    u.name,
    u.lastName,
    u.firstName,
    u.patronymic,
    u.phone,
    u.role,
    String(u.monthlySalary ?? 0),
    String(u.agencyPercent ?? 5),
    formatOwnersCsv(u.owners),
    u.comment ?? "",
    u.active ? "1" : "0",
    u.specialties.map((s) => s.specialty.name).join(";"),
    "",
  ];
}

export function parseUserCsv(text: string): {
  rows: UserCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Email"]);
  if (errors.length) return { rows: [], errors };
  const out: UserCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const email = csvCell(map, line, "Email", "email").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      errors.push(`Строка ${lineNo}: некорректный email`);
      return;
    }
    const lastName = csvCell(map, line, "Фамилия", "lastName").trim();
    const firstName = csvCell(map, line, "Имя", "firstName").trim();
    const patronymic = csvCell(map, line, "Отчество", "patronymic").trim();
    const fio = csvCell(map, line, "ФИО", "name").trim();
    const name =
      [lastName, firstName, patronymic].filter(Boolean).join(" ") || fio || email;
    const specs = csvCell(map, line, "Специальности", "specialties")
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const password = csvCell(map, line, "Пароль", "password").trim() || null;
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      email,
      name,
      lastName,
      firstName,
      patronymic,
      phone: csvCell(map, line, "Телефон", "phone").trim(),
      role: parseRoleCsv(csvCell(map, line, "Роль", "role")),
      monthlySalary: Math.max(0, csvNum(csvCell(map, line, "Оклад", "monthlySalary")) ?? 0),
      agencyPercent: Math.min(
        100,
        Math.max(0, csvNum(csvCell(map, line, "Агентство %", "agencyPercent")) ?? 5),
      ),
      owners: parseOwnersCsv(csvCell(map, line, "Фирмы", "owners")),
      comment: csvCell(map, line, "Комментарий", "comment").trim(),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
      specialties: specs,
      password,
    });
  });
  return { rows: out, errors };
}

export const RATE_CSV_HEADERS = [
  "ID",
  "Название",
  "Порядок",
  "Час",
  "Смена",
  "Описание",
  "Активен",
] as const;

export type RateCsvRow = {
  id: string | null;
  name: string;
  sortOrder: number;
  hourlyRate: number;
  shiftRate: number;
  description: string;
  active: boolean;
};

export function rateToCsvCells(s: RateCsvRow & { id: string }): string[] {
  return [
    s.id,
    s.name,
    String(s.sortOrder),
    String(s.hourlyRate),
    String(s.shiftRate),
    s.description,
    s.active ? "1" : "0",
  ];
}

export function parseRateCsv(text: string): {
  rows: RateCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Название"]);
  if (errors.length) return { rows: [], errors };
  const out: RateCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const name = csvCell(map, line, "Название", "name", "Специальность").trim();
    if (!name) {
      errors.push(`Строка ${lineNo}: пустое название`);
      return;
    }
    const hourly = csvNum(csvCell(map, line, "Час", "hourlyRate"));
    const shift = csvNum(csvCell(map, line, "Смена", "shiftRate"));
    if (hourly != null && hourly < 0) {
      errors.push(`Строка ${lineNo}: ставка час не может быть отрицательной`);
      return;
    }
    if (shift != null && shift < 0) {
      errors.push(`Строка ${lineNo}: ставка смена не может быть отрицательной`);
      return;
    }
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      name,
      sortOrder: Math.floor(csvNum(csvCell(map, line, "Порядок", "sortOrder")) ?? 0),
      hourlyRate: hourly ?? 0,
      shiftRate: shift ?? 0,
      description: csvCell(map, line, "Описание", "description").trim(),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
    });
  });
  return { rows: out, errors };
}

export const VEHICLE_CSV_HEADERS = [
  "ID",
  "Номер",
  "Марка",
  "Модель",
  "Серия",
  "Свидетельство",
  "Расход",
  "Пробег",
  "Правила",
  "Комментарий",
  "Активен",
] as const;

export type VehicleCsvRow = {
  id: string | null;
  plateNumber: string;
  make: string;
  model: string;
  series: string;
  certificateNumber: string;
  fuelConsumption: number;
  mileage: number;
  operatingRules: string;
  comment: string;
  active: boolean;
};

export function vehicleToCsvCells(v: VehicleCsvRow & { id: string }): string[] {
  return [
    v.id,
    v.plateNumber,
    v.make,
    v.model,
    v.series,
    v.certificateNumber,
    String(v.fuelConsumption),
    String(v.mileage),
    v.operatingRules,
    v.comment,
    v.active ? "1" : "0",
  ];
}

export function parseVehicleCsv(text: string): {
  rows: VehicleCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Номер"]);
  if (errors.length) return { rows: [], errors };
  const out: VehicleCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const plateNumber = csvCell(map, line, "Номер", "plateNumber").trim().toUpperCase();
    if (!plateNumber) {
      errors.push(`Строка ${lineNo}: пустой госномер`);
      return;
    }
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      plateNumber,
      make: csvCell(map, line, "Марка", "make").trim(),
      model: csvCell(map, line, "Модель", "model").trim(),
      series: csvCell(map, line, "Серия", "series").trim(),
      certificateNumber: csvCell(map, line, "Свидетельство", "certificateNumber").trim(),
      fuelConsumption: Math.max(0, csvNum(csvCell(map, line, "Расход", "fuelConsumption")) ?? 0),
      mileage: Math.max(0, csvNum(csvCell(map, line, "Пробег", "mileage")) ?? 0),
      operatingRules: csvCell(map, line, "Правила", "operatingRules").trim(),
      comment: csvCell(map, line, "Комментарий", "comment").trim(),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
    });
  });
  return { rows: out, errors };
}

export type KitComponentCsv = { catalogItemId: string; qty: number; name: string };

export const KIT_CSV_HEADERS = [
  "ID",
  "Название",
  "Описание",
  "Путь",
  "Порядок",
  "Активен",
  "Состав",
] as const;

export type KitCsvRow = {
  id: string | null;
  name: string;
  description: string;
  categoryPath: string;
  sortOrder: number;
  active: boolean;
  components: KitComponentCsv[];
};

export function formatKitComponentsCsv(components: KitComponentCsv[]): string {
  return components
    .map((c) => `${c.qty}|${c.catalogItemId}|${(c.name || "").replace(/[|;]/g, "/")}`)
    .join(";");
}

export function parseKitComponentsCsv(raw: string): KitComponentCsv[] {
  if (!raw.trim()) return [];
  return raw
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [qtyRaw, id, ...nameParts] = chunk.split("|");
      const qty = Number(String(qtyRaw || "1").replace(",", "."));
      return {
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        catalogItemId: (id || "").trim(),
        name: nameParts.join("|").trim(),
      };
    })
    .filter((c) => c.catalogItemId);
}

export function kitToCsvCells(k: {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  category: { path: string } | null;
  components: Array<{ qty: number; catalogItemId: string; catalogItem?: { name: string } }>;
}): string[] {
  return [
    k.id,
    k.name,
    k.description ?? "",
    k.category?.path ?? "",
    String(k.sortOrder),
    k.active ? "1" : "0",
    formatKitComponentsCsv(
      k.components.map((c) => ({
        qty: c.qty,
        catalogItemId: c.catalogItemId,
        name: c.catalogItem?.name ?? "",
      })),
    ),
  ];
}

export function parseKitCsv(text: string): {
  rows: KitCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Название"]);
  if (errors.length) return { rows: [], errors };
  const out: KitCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const name = csvCell(map, line, "Название", "name").trim();
    if (!name) {
      errors.push(`Строка ${lineNo}: пустое название`);
      return;
    }
    const components = parseKitComponentsCsv(csvCell(map, line, "Состав", "components"));
    if (components.length === 0) {
      errors.push(`Строка ${lineNo}: пустой состав комплекта`);
      return;
    }
    out.push({
      id: csvCell(map, line, "ID", "id").trim() || null,
      name,
      description: csvCell(map, line, "Описание", "description").trim(),
      categoryPath: csvCell(map, line, "Путь", "categoryPath", "path").trim(),
      sortOrder: Math.floor(csvNum(csvCell(map, line, "Порядок", "sortOrder")) ?? 0),
      active: csvBool(csvCell(map, line, "Активен", "active"), true),
      components,
    });
  });
  return { rows: out, errors };
}

export const QUOTE_CSV_HEADERS = [
  "ID",
  "№",
  "Мероприятие",
  "Дата",
  "Дней",
  "Клиент",
  "Место",
  "Статус",
  "Автор",
  "Менеджер",
  "Счёт",
  "Оплачено",
  "Комментарий оплаты",
] as const;

export type QuoteCsvRow = {
  id: string | null;
  proposalNumber: string;
  eventName: string;
  date: string;
  durationDays: number;
  client: string;
  place: string;
  lifecycle: string;
  ownerName: string;
  managerName: string;
  invoiceSent: boolean;
  paid: boolean;
  paymentComment: string;
};

export function quoteToCsvCells(q: {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  durationDays: number;
  client: string;
  place: string;
  lifecycle: string;
  owner?: { name: string } | null;
  managerName: string;
  invoiceSent: boolean;
  paid: boolean;
  paymentComment: string;
}): string[] {
  return [
    q.id,
    q.proposalNumber,
    q.eventName,
    q.date,
    String(q.durationDays ?? 1),
    q.client,
    q.place,
    q.lifecycle,
    q.owner?.name ?? "",
    q.managerName,
    q.invoiceSent ? "1" : "0",
    q.paid ? "1" : "0",
    q.paymentComment,
  ];
}

export function parseQuoteCsv(text: string): {
  rows: QuoteCsvRow[];
  errors: string[];
} {
  const { rows, map, errors } = parseTable(text, ["Мероприятие"]);
  if (errors.length) return { rows: [], errors };
  const out: QuoteCsvRow[] = [];
  rows.forEach((line, i) => {
    const lineNo = i + 2;
    const eventName = csvCell(map, line, "Мероприятие", "eventName").trim();
    const id = csvCell(map, line, "ID", "id").trim() || null;
    const proposalNumber = csvCell(map, line, "№", "proposalNumber", "Номер").trim();
    if (!eventName && !id && !proposalNumber) {
      errors.push(`Строка ${lineNo}: нет названия или номера`);
      return;
    }
    out.push({
      id,
      proposalNumber,
      eventName,
      date: csvCell(map, line, "Дата", "date").trim(),
      durationDays: Math.max(1, Math.floor(csvNum(csvCell(map, line, "Дней", "durationDays")) ?? 1)),
      client: csvCell(map, line, "Клиент", "client").trim(),
      place: csvCell(map, line, "Место", "place").trim(),
      lifecycle: csvCell(map, line, "Статус", "lifecycle").trim().toUpperCase(),
      ownerName: csvCell(map, line, "Автор", "owner").trim(),
      managerName: csvCell(map, line, "Менеджер", "managerName").trim(),
      invoiceSent: csvBool(csvCell(map, line, "Счёт", "invoiceSent"), false),
      paid: csvBool(csvCell(map, line, "Оплачено", "paid"), false),
      paymentComment: csvCell(map, line, "Комментарий оплаты", "paymentComment").trim(),
    });
  });
  return { rows: out, errors };
}
