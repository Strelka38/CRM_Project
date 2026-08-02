import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { Providers } from "@/components/Providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const body = Roboto({
  weight: ["300", "400", "500", "700"],
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "BaikalStageGroup CRM",
  description: "Сметы и каталог проката ивент-оборудования",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${body.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full font-light antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
