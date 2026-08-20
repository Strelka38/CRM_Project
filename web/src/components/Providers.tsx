"use client";

import { SessionProvider } from "next-auth/react";
import { LayoutDensityProvider } from "@/components/LayoutDensityProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <LayoutDensityProvider>{children}</LayoutDensityProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
