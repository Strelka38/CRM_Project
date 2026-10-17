import { STANDARD_PRINT_OPTIONS, type QuotePrintOptions } from "./print-options";

export const EXPORT_TEMPLATES_KEY = "exportTemplates";
export const LAST_EXPORT_TEMPLATE_KEY = "export.lastTemplateId";
export const STANDARD_TEMPLATE_ID = "standard";

/** Значение пункта «Создать новый» в списке шаблонов. */
export const NEW_TEMPLATE_VALUE = "__new__";

export type ExportTemplateSettings = {
  includeSummary: boolean;
  allTabsOneSheet: boolean;
  showEquipmentPrice: boolean;
  showConsumablePrice: boolean;
  showServicePrice: boolean;
  print: QuotePrintOptions;
};

export type ExportTemplate = {
  id: string;
  name: string;
  comment: string;
  /** Примечание под итогом сметы. Пусто — стандартная формулировка. */
  note: string;
  settings: ExportTemplateSettings;
};

const PRINT_KEYS = Object.keys(STANDARD_PRINT_OPTIONS) as Array<
  keyof QuotePrintOptions
>;

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Настройки печати без зон. Недостающие флаги берутся из стандартного шаблона. */
export function parseExportTemplateSettings(raw: unknown): ExportTemplateSettings {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const printSrc =
    src.print && typeof src.print === "object"
      ? (src.print as Record<string, unknown>)
      : {};
  const print: QuotePrintOptions = { ...STANDARD_PRINT_OPTIONS };
  for (const key of PRINT_KEYS) {
    if (typeof printSrc[key] === "boolean") print[key] = printSrc[key];
  }
  return {
    includeSummary: flag(src.includeSummary, false),
    allTabsOneSheet: flag(src.allTabsOneSheet, true),
    showEquipmentPrice: flag(src.showEquipmentPrice, true),
    showConsumablePrice: flag(src.showConsumablePrice, true),
    showServicePrice: flag(src.showServicePrice, true),
    print,
  };
}

export function readLastExportTemplateId(): string {
  if (typeof window === "undefined") return STANDARD_TEMPLATE_ID;
  try {
    const raw = localStorage.getItem(LAST_EXPORT_TEMPLATE_KEY)?.trim() ?? "";
    return raw || STANDARD_TEMPLATE_ID;
  } catch {
    return STANDARD_TEMPLATE_ID;
  }
}

export function writeLastExportTemplateId(id: string) {
  if (typeof window === "undefined") return;
  const next = id.trim();
  if (!next || next === NEW_TEMPLATE_VALUE) return;
  try {
    localStorage.setItem(LAST_EXPORT_TEMPLATE_KEY, next);
  } catch {
    /* quota / private mode */
  }
}

export function resolveExportTemplateId(
  saved: string,
  templates: readonly { id: string }[],
): string {
  const id = saved.trim();
  if (!id || id === NEW_TEMPLATE_VALUE) return STANDARD_TEMPLATE_ID;
  if (id === STANDARD_TEMPLATE_ID) return STANDARD_TEMPLATE_ID;
  if (templates.some((item) => item.id === id)) return id;
  return STANDARD_TEMPLATE_ID;
}

/** Примечание шаблона с именем «Базовый». Пустая строка — стандартная формулировка. */
export function baseTemplateNote(
  templates: readonly { name: string; note: string }[],
): string {
  const found = templates.find((item) => item.name.trim().toLowerCase() === "базовый");
  return found?.note.trim() || "";
}

export function parseExportTemplates(raw: unknown): ExportTemplate[] {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: ExportTemplate[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!id || !name) continue;
    const settings = parseExportTemplateSettings(
      rec.settings && typeof rec.settings === "object" ? rec.settings : rec,
    );
    const comment = typeof rec.comment === "string" ? rec.comment.trim().slice(0, 200) : "";
    const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 4000) : "";
    out.push({ id, name: name.slice(0, 80), comment, note, settings });
  }
  return out;
}

const RESERVED = new Set(["стандартный шаблон", "создать новый"]);

export function templateNameError(
  name: string,
  existing: readonly { name: string }[],
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Укажите название";
  if (trimmed.length > 80) return "Слишком длинное название";
  const key = trimmed.toLocaleLowerCase("ru");
  if (RESERVED.has(key)) return "Это название занято";
  if (existing.some((item) => item.name.trim().toLocaleLowerCase("ru") === key)) {
    return "Такой шаблон уже есть";
  }
  return null;
}
