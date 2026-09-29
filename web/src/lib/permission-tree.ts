/**
 * Дерево прав: разделы меню и функции.
 * Href разделов совпадают с NAV_SECTIONS — меню, гейт пути и эта матрица
 * читают одни и те же адреса, без «случайных» переходов в чужой раздел.
 */
import type { AppRole } from "./roles";

export const PERMISSION_ROLES = [
  "ADMIN",
  "MANAGER",
  "BRIGADIER",
  "EMPLOYEE",
] as const;

export type PermissionRole = (typeof PERMISSION_ROLES)[number];

export type PermissionKind = "group" | "section" | "function";

export type PermissionId =
  | "group.calendar"
  | "section.calendar"
  | "fn.calendar.createProject"
  | "fn.calendar.createRental"
  | "fn.calendar.createTask"
  | "fn.calendar.createDayOff"
  | "fn.calendar.eventMenu"
  | "fn.calendar.copyEvent"
  | "fn.calendar.unschedule"
  | "group.accounting"
  | "section.quotes"
  | "fn.quotes.seeAll"
  | "fn.quotes.manage"
  | "fn.quotes.view"
  | "fn.quotes.editSpec"
  | "fn.quotes.editBrief"
  | "fn.quotes.editSchedule"
  | "fn.quotes.assignments"
  | "fn.quotes.attachments"
  | "fn.quotes.seePay"
  | "section.roster"
  | "section.payroll"
  | "section.payouts"
  | "section.unpaid"
  | "section.statistics"
  | "section.calculations"
  | "group.warehouse"
  | "section.catalog"
  | "section.repairs"
  | "fn.warehouse.sendRepair"
  | "section.kits"
  | "section.vehicles"
  | "section.equipment"
  | "group.database"
  | "section.clients"
  | "section.legalEntities"
  | "section.venues"
  | "section.freelancers"
  | "section.users"
  | "fn.users.assignStaff"
  | "fn.users.assignManagers"
  | "fn.users.resetPassword"
  | "section.rates"
  | "section.backup"
  | "group.settings"
  | "section.settingsAccess";

export type PermissionNode = {
  id: PermissionId;
  label: string;
  hint?: string;
  kind: PermissionKind;
  href?: string;
  /** Список /quotes, не редактор /quotes/[id] — его открывают из календаря. */
  exactPath?: boolean;
  defaultRoles: AppRole[];
  /** Роль всегда имеет доступ, чекбокс снять нельзя. */
  lockedRoles?: AppRole[];
  /** Нельзя выдать никому кроме админа. */
  grantable?: boolean;
  /** Не роль, а персональный флаг в карточке сотрудника. */
  perUser?: boolean;
  children?: PermissionNode[];
};

const MANAGER: AppRole[] = ["ADMIN", "MANAGER"];
const OPS: AppRole[] = ["ADMIN", "MANAGER", "BRIGADIER"];
const ALL: AppRole[] = ["ADMIN", "MANAGER", "BRIGADIER", "EMPLOYEE"];

export const PERMISSION_TREE: PermissionNode[] = [
  {
    id: "group.calendar",
    label: "Календарь",
    kind: "group",
    defaultRoles: ALL,
    children: [
      {
        id: "section.calendar",
        label: "Раздел «Календарь»",
        hint: "Домашняя страница. Скрыть нельзя — сюда возвращают без доступа.",
        kind: "section",
        href: "/calendar",
        defaultRoles: ALL,
        lockedRoles: ALL,
      },
      {
        id: "fn.calendar.createProject",
        label: "Создать проект",
        kind: "function",
        defaultRoles: MANAGER,
      },
      {
        id: "fn.calendar.createRental",
        label: "Создать аренду оборудования",
        kind: "function",
        defaultRoles: MANAGER,
      },
      {
        id: "fn.calendar.createTask",
        label: "Создать задачу",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.calendar.createDayOff",
        label: "Создать выходной",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.calendar.eventMenu",
        label: "Меню мероприятия (⋯)",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.calendar.copyEvent",
        label: "Копировать мероприятие",
        kind: "function",
        defaultRoles: MANAGER,
      },
      {
        id: "fn.calendar.unschedule",
        label: "Снять мероприятие с календаря",
        kind: "function",
        defaultRoles: MANAGER,
      },
    ],
  },
  {
    id: "group.accounting",
    label: "Учёт",
    kind: "group",
    defaultRoles: ALL,
    children: [
      {
        id: "section.quotes",
        label: "Сметы / Мероприятия",
        hint: "Список /quotes. Карточка мероприятия /quotes/[id] из календаря не зависит от этого пункта.",
        kind: "section",
        href: "/quotes",
        exactPath: true,
        defaultRoles: ALL,
      },
      {
        id: "fn.quotes.seeAll",
        label: "Видеть все мероприятия",
        hint: "Иначе только свои назначения.",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.manage",
        label: "Редактировать смету (деньги, блоки)",
        kind: "function",
        defaultRoles: MANAGER,
      },
      {
        id: "fn.quotes.view",
        label: "Открывать вкладку сметы",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.editSpec",
        label: "Редактировать спецификацию",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.editBrief",
        label: "Редактировать ТЗ / бриф",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.editSchedule",
        label: "Редактировать даты и монтаж",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.assignments",
        label: "Назначать сотрудников на смены",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.attachments",
        label: "Файлы мероприятия",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.quotes.seePay",
        label: "Видеть ставки и ФОТ",
        kind: "function",
        defaultRoles: MANAGER,
      },
      {
        id: "section.roster",
        label: "Срост",
        kind: "section",
        href: "/roster",
        defaultRoles: OPS,
      },
      {
        id: "section.payroll",
        label: "Моя ЗП",
        hint: "Личная зарплата. Есть в нижнем меню телефона.",
        kind: "section",
        href: "/payroll",
        defaultRoles: ALL,
        lockedRoles: ALL,
      },
      {
        id: "section.payouts",
        label: "Оплаты",
        hint: "Не роль: админ включает в карточке сотрудника.",
        kind: "section",
        href: "/payouts",
        defaultRoles: [],
        perUser: true,
      },
      {
        id: "section.unpaid",
        label: "Неоплаченные",
        kind: "section",
        href: "/unpaid",
        defaultRoles: MANAGER,
      },
      {
        id: "section.statistics",
        label: "Статистика",
        kind: "section",
        href: "/statistics",
        defaultRoles: OPS,
      },
      {
        id: "section.calculations",
        label: "Калькуляции",
        kind: "section",
        href: "/calculations",
        defaultRoles: MANAGER,
      },
    ],
  },
  {
    id: "group.warehouse",
    label: "Склад",
    kind: "group",
    defaultRoles: OPS,
    children: [
      {
        id: "section.catalog",
        label: "Каталог",
        kind: "section",
        href: "/catalog",
        defaultRoles: OPS,
      },
      {
        id: "section.repairs",
        label: "Ремонт",
        kind: "section",
        href: "/repairs",
        defaultRoles: OPS,
      },
      {
        id: "fn.warehouse.sendRepair",
        label: "Списать единицу в ремонт",
        kind: "function",
        defaultRoles: ALL,
      },
      {
        id: "section.kits",
        label: "Комплекты",
        kind: "section",
        href: "/kits",
        defaultRoles: OPS,
      },
      {
        id: "section.vehicles",
        label: "Транспорт",
        kind: "section",
        href: "/vehicles",
        defaultRoles: OPS,
      },
      {
        id: "section.equipment",
        label: "Карточка оборудования",
        hint: "Не пункт меню: /equipment ведёт в каталог. Гейт пути тот же, что у склада.",
        kind: "section",
        href: "/equipment",
        defaultRoles: OPS,
      },
    ],
  },
  {
    id: "group.database",
    label: "База данных",
    kind: "group",
    defaultRoles: OPS,
    children: [
      {
        id: "section.clients",
        label: "Клиенты",
        kind: "section",
        href: "/clients",
        defaultRoles: OPS,
      },
      {
        id: "section.legalEntities",
        label: "Юрлица",
        kind: "section",
        href: "/legal-entities",
        defaultRoles: OPS,
      },
      {
        id: "section.venues",
        label: "Площадки",
        kind: "section",
        href: "/venues",
        defaultRoles: OPS,
      },
      {
        id: "section.freelancers",
        label: "Фрилансеры",
        kind: "section",
        href: "/freelancers",
        defaultRoles: OPS,
      },
      {
        id: "section.users",
        label: "Пользователи",
        kind: "section",
        href: "/users",
        defaultRoles: OPS,
      },
      {
        id: "fn.users.assignStaff",
        label: "Назначать сотрудника и бригадира",
        kind: "function",
        defaultRoles: OPS,
      },
      {
        id: "fn.users.assignManagers",
        label: "Назначать менеджера и админа",
        hint: "Только суперадмин. Выдать нельзя — иначе можно забрать себе доступ.",
        kind: "function",
        defaultRoles: ["ADMIN"],
        grantable: false,
      },
      {
        id: "fn.users.resetPassword",
        label: "Сбрасывать чужой пароль",
        kind: "function",
        defaultRoles: ["ADMIN"],
      },
      {
        id: "section.rates",
        label: "Ставки",
        kind: "section",
        href: "/rates",
        defaultRoles: OPS,
      },
      {
        id: "section.backup",
        label: "Экспорт / импорт",
        kind: "section",
        href: "/backup",
        defaultRoles: ["ADMIN"],
      },
    ],
  },
  {
    id: "group.settings",
    label: "Настройки",
    kind: "group",
    defaultRoles: ["ADMIN"],
    children: [
      {
        id: "section.settingsAccess",
        label: "Права и доступы",
        hint: "Это дерево. Только суперадмин — иначе роль может закрыть всех, включая админа.",
        kind: "section",
        href: "/settings/access",
        defaultRoles: ["ADMIN"],
        grantable: false,
      },
    ],
  },
];

export type RolePermissionOverrides = Partial<
  Record<PermissionId, Partial<Record<AppRole, boolean>>>
>;

const TOGGLEABLE = new Map<PermissionId, PermissionNode>();

function indexNodes(nodes: PermissionNode[]) {
  for (const node of nodes) {
    if (node.kind !== "group") TOGGLEABLE.set(node.id, node);
    if (node.children) indexNodes(node.children);
  }
}

indexNodes(PERMISSION_TREE);

export function permissionNode(id: PermissionId): PermissionNode | undefined {
  return TOGGLEABLE.get(id);
}

export function toggleablePermissions(): PermissionNode[] {
  return [...TOGGLEABLE.values()];
}

export function walkPermissionTree(
  visit: (node: PermissionNode, depth: number) => void,
  nodes: PermissionNode[] = PERMISSION_TREE,
  depth = 0,
) {
  for (const node of nodes) {
    visit(node, depth);
    if (node.children) walkPermissionTree(visit, node.children, depth + 1);
  }
}

export function isPermissionRole(role: string | null | undefined): role is AppRole {
  return (
    role === "ADMIN" ||
    role === "MANAGER" ||
    role === "BRIGADIER" ||
    role === "EMPLOYEE"
  );
}

export function defaultAllows(node: PermissionNode, role: AppRole): boolean {
  if (node.perUser) return false;
  if (role === "ADMIN") return true;
  if (node.grantable === false) return false;
  if (node.lockedRoles?.includes(role)) return true;
  return node.defaultRoles.includes(role);
}

export function roleHasPermission(
  role: string | null | undefined,
  id: PermissionId,
  overrides?: RolePermissionOverrides,
): boolean {
  if (!isPermissionRole(role)) return false;
  const node = TOGGLEABLE.get(id);
  if (!node) return false;
  if (node.perUser) return false;
  if (role === "ADMIN") return true;
  if (node.grantable === false) return false;
  if (node.lockedRoles?.includes(role)) return true;
  const over = overrides?.[id]?.[role];
  if (typeof over === "boolean") return over;
  return node.defaultRoles.includes(role);
}

export type PermissionCell = {
  allowed: boolean;
  locked: boolean;
  reason?: "admin" | "home" | "not-grantable" | "per-user";
};

export function permissionCell(
  id: PermissionId,
  role: AppRole,
  overrides?: RolePermissionOverrides,
): PermissionCell {
  const node = TOGGLEABLE.get(id);
  if (!node) return { allowed: false, locked: true };
  if (node.perUser) {
    return { allowed: false, locked: true, reason: "per-user" };
  }
  if (role === "ADMIN") {
    return { allowed: true, locked: true, reason: "admin" };
  }
  if (node.grantable === false) {
    return { allowed: false, locked: true, reason: "not-grantable" };
  }
  if (node.lockedRoles?.includes(role)) {
    return { allowed: true, locked: true, reason: "home" };
  }
  return {
    allowed: roleHasPermission(role, id, overrides),
    locked: false,
  };
}

export function compactPermissionOverrides(
  input: RolePermissionOverrides,
): RolePermissionOverrides {
  const out: RolePermissionOverrides = {};
  for (const node of TOGGLEABLE.values()) {
    if (node.perUser || node.grantable === false) continue;
    const row = input[node.id];
    if (!row) continue;
    for (const role of PERMISSION_ROLES) {
      if (role === "ADMIN") continue;
      if (node.lockedRoles?.includes(role)) continue;
      const value = row[role];
      if (typeof value !== "boolean") continue;
      if (value === node.defaultRoles.includes(role)) continue;
      const next = out[node.id] ?? {};
      next[role] = value;
      out[node.id] = next;
    }
  }
  return out;
}

export function parsePermissionOverrides(raw: unknown): RolePermissionOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: RolePermissionOverrides = {};
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    if (!TOGGLEABLE.has(id as PermissionId)) continue;
    if (!row || typeof row !== "object") continue;
    const parsed: Partial<Record<AppRole, boolean>> = {};
    for (const role of PERMISSION_ROLES) {
      const value = (row as Record<string, unknown>)[role];
      if (typeof value === "boolean") parsed[role] = value;
    }
    if (Object.keys(parsed).length) out[id as PermissionId] = parsed;
  }
  return compactPermissionOverrides(out);
}

const DATABASE_SECTION_IDS: PermissionId[] = [
  "section.catalog",
  "section.repairs",
  "section.kits",
  "section.vehicles",
  "section.equipment",
  "section.clients",
  "section.legalEntities",
  "section.venues",
  "section.freelancers",
  "section.users",
  "section.rates",
];

export function roleHasDatabaseAccess(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return DATABASE_SECTION_IDS.some((id) => roleHasPermission(role, id, overrides));
}

export function allowedNavHrefs(
  role: string | null | undefined,
  overrides: RolePermissionOverrides | undefined,
  flags: { payoutsAccess?: boolean } = {},
): string[] {
  const hrefs: string[] = [];
  for (const node of TOGGLEABLE.values()) {
    if (node.kind !== "section" || !node.href) continue;
    if (node.perUser) {
      if (flags.payoutsAccess) hrefs.push(node.href);
      continue;
    }
    if (roleHasPermission(role, node.id, overrides)) hrefs.push(node.href);
  }
  return hrefs;
}

/** Самый длинный префикс; exactPath (/quotes) не перехватывает /quotes/[id]. */
export function sectionNodeForPath(pathname: string): PermissionNode | null {
  let best: PermissionNode | null = null;
  for (const node of TOGGLEABLE.values()) {
    if (node.kind !== "section" || !node.href) continue;
    if (node.exactPath) {
      if (pathname === node.href) return node;
      continue;
    }
    if (pathname !== node.href && !pathname.startsWith(`${node.href}/`)) {
      continue;
    }
    if (!best || node.href.length > (best.href?.length ?? 0)) best = node;
  }
  return best;
}

export function navPathBlocked(
  pathname: string,
  role: string | null | undefined,
  overrides: RolePermissionOverrides | undefined,
  flags: { payoutsAccess?: boolean } = {},
): boolean {
  const node = sectionNodeForPath(pathname);
  if (!node || !node.href) return false;
  if (node.perUser) return !flags.payoutsAccess;
  return !roleHasPermission(role, node.id, overrides);
}

export const SECTION_HREF_TO_ID: Record<string, PermissionId> = Object.fromEntries(
  toggleablePermissions()
    .filter((n) => n.kind === "section" && n.href)
    .map((n) => [n.href!, n.id]),
);
