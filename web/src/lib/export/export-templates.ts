import { STANDARD_PRINT_OPTIONS, type QuotePrintOptions } from "./print-options";

export const EXPORT_TEMPLATES_KEY = "exportTemplates";

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
    out.push({ id, name: name.slice(0, 80), settings });
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
