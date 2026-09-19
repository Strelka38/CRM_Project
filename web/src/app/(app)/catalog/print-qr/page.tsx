import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogPrintQrClient } from "@/components/CatalogPrintQrClient";

export const metadata: Metadata = {
  title: "QR",
  robots: { index: false, follow: false },
};

export default function CatalogPrintQrPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-neutral-600">Загрузка…</p>
      }
    >
      <CatalogPrintQrClient />
    </Suspense>
  );
}
