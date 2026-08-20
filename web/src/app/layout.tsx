import type { Metadata, Viewport } from "next";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto/cyrillic-300.css";
import "@fontsource/roboto/cyrillic-400.css";
import "@fontsource/roboto/cyrillic-500.css";
import "@fontsource/roboto/cyrillic-700.css";
import { Providers } from "@/components/Providers";
import { LAYOUT_BOOT_SCRIPT } from "@/lib/layout-density";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "BaikalStageGroup CRM",
  description: "Сметы и каталог проката ивент-оборудования",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      <body className="min-h-full font-light antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
