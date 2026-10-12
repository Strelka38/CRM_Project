"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PUBLIC_BRAND, type PublicBrand } from "@/lib/brand-public";

export function useBrand(): PublicBrand {
  const [brand, setBrand] = useState<PublicBrand>(DEFAULT_PUBLIC_BRAND);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/brand")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicBrand | null) => {
        if (!cancel && data && typeof data.crmName === "string") setBrand(data);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  return brand;
}
