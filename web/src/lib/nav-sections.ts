/**
 * Разделы приложения: меню и middleware читают один список.
 * Без React — можно импортировать из Edge middleware.
 */
import {
  canAccessDatabase,
  canAccessRoster,
  canAccessWorkloadStats,
  canBackupDatabase,
  isManager,
} from "./roles";

export type NavAccess =
  | "auth"
  | "database"
  | "roster"
  | "stats"
  | "manager"
  | "admin"
  | "payments";

export type NavGroup = "root" | "accounting" | "warehouse" | "database";

export type NavSection = {
  href: string;
  label: string;
  group: NavGroup;
  access: NavAccess;
  /** Подсветка только точного URL (список смет, не редактор /quotes/[id]). */
  exactActive?: boolean;
  /** Показывать в выпадающем меню. false — только гейт пути (например /equipment). */
  inMenu?: boolean;
  /** В ящике на телефоне. false — только верхнее меню десктопа. */
  inMobileMenu?: boolean;
};

export const NAV_SECTIONS: NavSection[] = [
  { href: "/calendar", label: "Календарь", group: "root", access: "auth" },
  {
    href: "/quotes",
    label: "Сметы",
    group: "accounting",
    access: "auth",
    exactActive: true,
  },
  { href: "/roster", label: "Срост", group: "accounting", access: "roster", inMobileMenu: false },
  { href: "/payroll", label: "Моя ЗП", group: "accounting", access: "auth" },
  {
    href: "/payouts",
    label: "Оплаты",
    group: "accounting",
    access: "payments",
  },
  {
    href: "/unpaid",
    label: "Неоплаченные",
    group: "accounting",
    access: "manager",
  },
  {
    href: "/statistics",
    label: "Статистика",
    group: "accounting",
    access: "stats",
  },
  {
    href: "/calculations",
    label: "Калькуляции",
    group: "accounting",
    access: "manager",
    inMobileMenu: false,
  },
  { href: "/catalog", label: "Каталог", group: "warehouse", access: "database" },
  { href: "/repairs", label: "Ремонт", group: "warehouse", access: "database" },
  { href: "/kits", label: "Комплекты", group: "warehouse", access: "database" },
  {
    href: "/vehicles",
    label: "Транспорт",
    group: "warehouse",
    access: "database",
  },
  {
    href: "/equipment",
    label: "Оборудование",
    group: "warehouse",
    access: "database",
    inMenu: false,
  },
  { href: "/clients", label: "Клиенты", group: "database", access: "database" },
  {
    href: "/legal-entities",
    label: "Юрлица",
    group: "database",
    access: "database",
  },
  { href: "/venues", label: "Площадки", group: "database", access: "database" },
  {
    href: "/freelancers",
    label: "Фрилансеры",
    group: "database",
    access: "database",
  },
  {
    href: "/users",
    label: "Пользователи",
    group: "database",
    access: "database",
  },
  { href: "/rates", label: "Ставки", group: "database", access: "database" },
  {
    href: "/backup",
    label: "Экспорт / импорт",
    group: "database",
    access: "admin",
    inMobileMenu: false,
  },
];

export function pathMatchesHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  if (exact) return pathname === href;
  return pathMatchesHref(pathname, href);
}

function visibleInGroup(
  s: NavSection,
  flags: { showBackup?: boolean; showPayouts?: boolean; mobile?: boolean },
  forMenu: boolean,
): boolean {
  if (forMenu && s.inMenu === false) return false;
  if (forMenu && flags.mobile && s.inMobileMenu === false) return false;
  if (s.access === "admin" && !flags.showBackup) return false;
  if (s.access === "payments" && !flags.showPayouts) return false;
  return true;
}

export function navMenuItems(
  group: NavGroup,
  flags: { showBackup?: boolean; showPayouts?: boolean; mobile?: boolean } = {},
): NavSection[] {
  return NAV_SECTIONS.filter(
    (s) => s.group === group && visibleInGroup(s, flags, true),
  );
}

/** Подсветка группы, включая пути вне меню (/equipment). */
export function navGroupIsActive(
  pathname: string,
  group: NavGroup,
  flags: { showBackup?: boolean; showPayouts?: boolean } = {},
): boolean {
  return NAV_SECTIONS.some(
    (s) =>
      s.group === group &&
      visibleInGroup(s, flags, false) &&
      isNavItemActive(pathname, s.href, s.exactActive),
  );
}

/** JWT не знает canAccessPayments — payments = любой залогиненный (страница проверяет БД). */
export function allowsNavGate(gate: NavAccess, role: string): boolean {
  switch (gate) {
    case "auth":
    case "payments":
      return true;
    case "database":
      return canAccessDatabase(role);
    case "roster":
      return canAccessRoster(role);
    case "stats":
      return canAccessWorkloadStats(role);
    case "manager":
      return isManager(role);
    case "admin":
      return canBackupDatabase(role);
  }
}

/** Самый длинный совпавший раздел — гейт для middleware. Нет в списке → null. */
export function navGateForPath(pathname: string): NavAccess | null {
  let best: NavSection | null = null;
  for (const s of NAV_SECTIONS) {
    if (!pathMatchesHref(pathname, s.href)) continue;
    if (!best || s.href.length > best.href.length) best = s;
  }
  return best?.access ?? null;
}
