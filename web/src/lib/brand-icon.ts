import type { PublicBrand } from "./brand-public";

export const BRAND_UPDATED = "crm-brand-updated";

/** Point the browser tab at the current mini icon without a reload. */
export function applyBrandIcon(href: string) {
  if (typeof document === "undefined" || !href) return;
  for (const rel of ["icon", "apple-touch-icon"] as const) {
    const selector = `link[data-brand-icon="${rel}"]`;
    let link = document.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      link.dataset.brandIcon = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  }
}

export function publishBrand(brand: PublicBrand) {
  applyBrandIcon(brand.iconUrl);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BRAND_UPDATED, { detail: brand }));
}
