export const SPEC_FONTS = ["Times New Roman", "Arial", "Roboto", "Noto Sans"] as const;

export type SpecFont = (typeof SPEC_FONTS)[number];

export const SPEC_HEADER_FIELDS = [
  ["project", "Проект"],
  ["title", "Название"],
  ["date", "Дата"],
  ["venue", "Площадка"],
  ["venueContacts", "Контакты площадки"],
  ["client", "Клиент"],
  ["clientContacts", "Контакты клиента"],
  ["manager", "Менеджер"],
  ["managerContacts", "Контакты менеджера"],
  ["brigadier", "Бригадир"],
  ["brigadierContacts", "Контакты бригадира"],
  ["extra", "Дополнительная информация"],
  ["logo", "Логотип"],
  ["warehouses", "Склад(ы)"],
  ["statuses", "Статус(ы)"],
] as const;

export const SPEC_TABLE_FIELDS = [
  ["sectionHeader", "Показывать заголовок раздела"],
  ["subsectionHeader", "Показывать заголовок подраздела"],
  ["groupBySheets", "Группировать по листам"],
  ["pageBreak", "Разбивать по страницам"],
  ["kits", "Показывать комплекты"],
  ["articles", "Показывать артикулы"],
  ["warehouse", "Показывать склад"],
  ["slot", "Показывать ряд/место"],
  ["extraColumns", "Показывать дополнительные столбцы"],
  ["subrentInList", "Показывать субаренду в общем списке"],
  ["subrentSheet", "Показывать субаренду на отдельном листе"],
  ["groupSubrent", "Сгруппировать субаренду"],
  ["comments", "Показывать комментарии"],
  ["dimensions", "Показывать габариты/объем"],
  ["power", "Показывать мощность/вес"],
] as const;

export type SpecHeaderKey = (typeof SPEC_HEADER_FIELDS)[number][0];
export type SpecTableKey = (typeof SPEC_TABLE_FIELDS)[number][0];

export type SpecPrintSettings = {
  fontFamily: SpecFont;
  fontSize: number;
  orientation: "portrait" | "landscape";
  header: Record<SpecHeaderKey, boolean>;
  table: Record<SpecTableKey, boolean>;
  emptyRows: number;
};

function headerDefaults(): Record<SpecHeaderKey, boolean> {
  return {
    project: true,
    title: true,
    date: true,
    venue: true,
    venueContacts: true,
    client: true,
    clientContacts: true,
    manager: true,
    managerContacts: true,
    brigadier: true,
    brigadierContacts: true,
    extra: true,
    logo: true,
    warehouses: true,
    statuses: true,
  };
}

function tableDefaults(): Record<SpecTableKey, boolean> {
  return {
    sectionHeader: true,
    subsectionHeader: true,
    groupBySheets: false,
    pageBreak: false,
    kits: true,
    articles: false,
    warehouse: false,
    slot: false,
    extraColumns: false,
    subrentInList: true,
    subrentSheet: false,
    groupSubrent: false,
    comments: true,
    dimensions: false,
    power: false,
  };
}

export const DEFAULT_SPEC_PRINT: SpecPrintSettings = {
  fontFamily: "Times New Roman",
  fontSize: 0,
  orientation: "portrait",
  header: headerDefaults(),
  table: tableDefaults(),
  emptyRows: 0,
};

function flag(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseSpecPrint(raw: unknown): SpecPrintSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const headerSrc =
    src.header && typeof src.header === "object"
      ? (src.header as Record<string, unknown>)
      : {};
  const tableSrc =
    src.table && typeof src.table === "object"
      ? (src.table as Record<string, unknown>)
      : {};
  const header = headerDefaults();
  for (const [key] of SPEC_HEADER_FIELDS) header[key] = flag(headerSrc[key], header[key]);
  const table = tableDefaults();
  for (const [key] of SPEC_TABLE_FIELDS) table[key] = flag(tableSrc[key], table[key]);
  const font = SPEC_FONTS.find((item) => item === src.fontFamily) ?? DEFAULT_SPEC_PRINT.fontFamily;
  const fontSize = Number(src.fontSize);
  const emptyRows = Number(src.emptyRows);
  return {
    fontFamily: font,
    fontSize: Number.isFinite(fontSize) ? Math.min(72, Math.max(0, Math.round(fontSize))) : 0,
    orientation: src.orientation === "landscape" ? "landscape" : "portrait",
    header,
    table,
    emptyRows: Number.isFinite(emptyRows) ? Math.min(40, Math.max(0, Math.round(emptyRows))) : 0,
  };
}
