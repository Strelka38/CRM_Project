/** Defaults shared by the app chrome and the commercial proposal. */

export const DEFAULT_CRM_NAME = "BaikalStageGroup";
export const DEFAULT_KP_NAME = "Байкал Стейдж Групп";
export const DEFAULT_KP_SITE = "baikalstagegroup.ru";
export const DEFAULT_LOGO_URL = "/brand/bsg-logo.png";

export const BRAND_FILE_KINDS = ["crm", "kp", "icon"] as const;
export type BrandFileKind = (typeof BRAND_FILE_KINDS)[number];

export function isBrandFileKind(value: unknown): value is BrandFileKind {
  return value === "crm" || value === "kp" || value === "icon";
}

export type PublicBrand = {
  crmName: string;
  crmLogoUrl: string;
  crmLogoCustom: boolean;
  /** Browser-tab mark. Falls back to the site logo. */
  iconUrl: string;
  iconCustom: boolean;
  kpName: string;
  kpSite: string;
  kpLogoUrl: string;
  kpLogoCustom: boolean;
  /** White mark on a transparent field: invert it onto white paper. */
  kpLogoInvert: boolean;
};

export const DEFAULT_PUBLIC_BRAND: PublicBrand = {
  crmName: DEFAULT_CRM_NAME,
  crmLogoUrl: DEFAULT_LOGO_URL,
  crmLogoCustom: false,
  iconUrl: DEFAULT_LOGO_URL,
  iconCustom: false,
  kpName: DEFAULT_KP_NAME,
  kpSite: DEFAULT_KP_SITE,
  kpLogoUrl: DEFAULT_LOGO_URL,
  kpLogoCustom: false,
  kpLogoInvert: true,
};
