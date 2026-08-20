import { Suspense } from "react";
import { CatalogPrintQrClient } from "@/components/CatalogPrintQrClient";

export default function CatalogPrintQrPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-[var(--muted)]">Загрузка…</p>
      }
    >
      <CatalogPrintQrClient />
    </Suspense>
  );
}
