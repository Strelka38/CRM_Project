import { prisma } from "./db";
import { CURRENCIES, type CurrencyId, type DeficitScope } from "./org-prefs";
import { parseSpecPrint, type SpecPrintSettings } from "./spec-print";

export { CURRENCIES };
export type { CurrencyId, DeficitScope };

const KEY = {
  currency: "org.currency",
  showWhatsNew: "org.showWhatsNew",
  deficitScope: "org.deficitScope",
  specPrint: "org.specPrint",
  kpDefaultTemplateId: "org.kpDefaultTemplateId",
} as const;

export type OrgSettings = {
  currency: CurrencyId;
  showWhatsNew: boolean;
  deficitScope: DeficitScope;
  specPrint: SpecPrintSettings;
  kpDefaultTemplateId: string;
};

const DEFAULTS: OrgSettings = {
  currency: "RUB",
  showWhatsNew: true,
  deficitScope: "period",
  specPrint: parseSpecPrint(null),
  kpDefaultTemplateId: "standard",
};

function currencyOf(value: string | undefined): CurrencyId {
  return CURRENCIES.some((item) => item.id === value) ? (value as CurrencyId) : "RUB";
}

function scopeOf(value: string | undefined): DeficitScope {
  return value === "project" ? "project" : "period";
}

export function parseOrgSettings(
  rows: Array<{ key: string; value: string }>,
): OrgSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  let specPrint = DEFAULTS.specPrint;
  const rawPrint = map.get(KEY.specPrint);
  if (rawPrint) {
    try {
      specPrint = parseSpecPrint(JSON.parse(rawPrint));
    } catch {
      specPrint = parseSpecPrint(null);
    }
  }
  return {
    currency: currencyOf(map.get(KEY.currency)),
    showWhatsNew: map.get(KEY.showWhatsNew) !== "0",
    deficitScope: scopeOf(map.get(KEY.deficitScope)),
    specPrint,
    kpDefaultTemplateId: map.get(KEY.kpDefaultTemplateId)?.trim() || "standard",
  };
}

async function readRows() {
  return prisma.appSetting.findMany({
    where: { key: { in: Object.values(KEY) } },
  });
}

export async function getOrgSettings(): Promise<OrgSettings> {
  try {
    return parseOrgSettings(await readRows());
  } catch {
    return { ...DEFAULTS, specPrint: parseSpecPrint(null) };
  }
}

async function put(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function saveOrgSettings(patch: Partial<OrgSettings>): Promise<OrgSettings> {
  if (patch.currency) await put(KEY.currency, currencyOf(patch.currency));
  if (typeof patch.showWhatsNew === "boolean") {
    await put(KEY.showWhatsNew, patch.showWhatsNew ? "1" : "0");
  }
  if (patch.deficitScope) await put(KEY.deficitScope, scopeOf(patch.deficitScope));
  if (patch.specPrint) await put(KEY.specPrint, JSON.stringify(parseSpecPrint(patch.specPrint)));
  if (typeof patch.kpDefaultTemplateId === "string") {
    const id = patch.kpDefaultTemplateId.trim() || "standard";
    await put(KEY.kpDefaultTemplateId, id.slice(0, 80));
  }
  return getOrgSettings();
}
