import type { Metadata, Viewport } from "next";
// Вариативный Golos Text: ось веса 400–900, латиница и кириллица в одном импорте.
import "@fontsource-variable/golos-text";
import { Providers } from "@/components/Providers";
import { LAYOUT_BOOT_SCRIPT } from "@/lib/layout-density";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "BaikalStageGroup CRM",
  description: "Сметы и каталог проката ивент-оборудования",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CRM",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
