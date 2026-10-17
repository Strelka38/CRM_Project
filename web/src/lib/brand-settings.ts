import { prisma } from "./db";
import {
  DEFAULT_CRM_NAME,
  DEFAULT_KP_NAME,
  DEFAULT_KP_SITE,
  DEFAULT_LOGO_URL,
  DEFAULT_PUBLIC_BRAND,
  type BrandFileKind,
  type PublicBrand,
} from "./brand-public";

const KEY = {
  crmName: "brand.crmName",
  crmLogo: "brand.crmLogo",
  icon: "brand.icon",
  kpName: "brand.kpName",
  kpSite: "brand.kpSite",
  kpLogo: "brand.kpLogo",
  kpInvert: "brand.kpInvert",
  rev: "brand.rev",
} as const;

const LOGO_KEY: Record<BrandFileKind, string> = {
  crm: KEY.crmLogo,
  kp: KEY.kpLogo,
  icon: KEY.icon,
};

function mapOf(rows: Array<{ key: string; value: string }>) {
  return new Map(rows.map((r) => [r.key, r.value]));
}

export function toPublicBrand(
  values: Map<string, string>,
): PublicBrand {
  const rev = values.get(KEY.rev) || "0";
  const crmLogo = values.get(KEY.crmLogo)?.trim() || "";
  const icon = values.get(KEY.icon)?.trim() || "";
  const kpLogo = values.get(KEY.kpLogo)?.trim() || "";
  const crmName = values.get(KEY.crmName)?.trim() || DEFAULT_CRM_NAME;
  const kpName = values.get(KEY.kpName)?.trim() || DEFAULT_KP_NAME;
  const kpSite = values.get(KEY.kpSite)?.trim() || DEFAULT_KP_SITE;
  const kpLogoCustom = Boolean(kpLogo);
  const kpLogoInvert = kpLogoCustom
    ? values.get(KEY.kpInvert) === "1"
    : true;
  const crmLogoUrl = crmLogo ? `/api/brand/file/crm?v=${rev}` : DEFAULT_LOGO_URL;
  return {
    crmName,
    crmLogoCustom: Boolean(crmLogo),
    crmLogoUrl,
    iconCustom: Boolean(icon),
    iconUrl: icon ? `/api/brand/file/icon?v=${rev}` : crmLogoUrl,
    kpName,
    kpSite,
    kpLogoCustom,
    kpLogoInvert,
    kpLogoUrl: kpLogo ? `/api/brand/file/kp?v=${rev}` : DEFAULT_LOGO_URL,
  };
}

export async function getBrandSettings(): Promise<PublicBrand> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(KEY) } },
    });
    return toPublicBrand(mapOf(rows));
  } catch {
    return DEFAULT_PUBLIC_BRAND;
  }
}

export async function getBrandLogoPath(
  kind: BrandFileKind,
): Promise<string | null> {
  const key = LOGO_KEY[kind];
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const value = row?.value?.trim() || "";
    return value || null;
  } catch {
    return null;
  }
}

async function bumpRev() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY.rev } });
  const next = String((Number(row?.value) || 0) + 1);
  await prisma.appSetting.upsert({
    where: { key: KEY.rev },
    create: { key: KEY.rev, value: next },
    update: { value: next },
  });
}

async function put(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function saveBrandText(input: {
  crmName?: string;
  kpName?: string;
  kpSite?: string;
  kpLogoInvert?: boolean;
}) {
  if (input.crmName !== undefined) {
    await put(KEY.crmName, input.crmName.trim() || DEFAULT_CRM_NAME);
  }
  if (input.kpName !== undefined) {
    await put(KEY.kpName, input.kpName.trim() || DEFAULT_KP_NAME);
  }
  if (input.kpSite !== undefined) {
    const site = input.kpSite.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    await put(KEY.kpSite, site || DEFAULT_KP_SITE);
  }
  if (input.kpLogoInvert !== undefined) {
    await put(KEY.kpInvert, input.kpLogoInvert ? "1" : "0");
  }
  await bumpRev();
  return getBrandSettings();
}

export async function saveBrandLogoPath(kind: BrandFileKind, storagePath: string) {
  await put(LOGO_KEY[kind], storagePath);
  if (kind === "kp") await put(KEY.kpInvert, "0");
  await bumpRev();
  return getBrandSettings();
}

export async function clearBrandLogo(kind: BrandFileKind) {
  await put(LOGO_KEY[kind], "");
  if (kind === "kp") await put(KEY.kpInvert, "0");
  await bumpRev();
  return getBrandSettings();
}
