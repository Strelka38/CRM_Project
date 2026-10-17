"use client";

import { useEffect, useState } from "react";
import { applyBrandIcon, BRAND_UPDATED } from "@/lib/brand-icon";
import { DEFAULT_PUBLIC_BRAND, type PublicBrand } from "@/lib/brand-public";

function isBrand(data: unknown): data is PublicBrand {
  if (!data || typeof data !== "object" || !("crmName" in data)) return false;
  return typeof data.crmName === "string";
}

export function useBrand(): PublicBrand {
  const [brand, setBrand] = useState<PublicBrand>(DEFAULT_PUBLIC_BRAND);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicBrand | null) => {
        if (cancel || !isBrand(data)) return;
        setBrand(data);
        applyBrandIcon(data.iconUrl);
      })
      .catch(() => {});
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PublicBrand>).detail;
      if (isBrand(detail)) setBrand(detail);
    };
    window.addEventListener(BRAND_UPDATED, onUpdate);
    return () => {
      cancel = true;
      window.removeEventListener(BRAND_UPDATED, onUpdate);
    };
  }, []);

  return brand;
}
