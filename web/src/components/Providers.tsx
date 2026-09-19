"use client";

import { SessionProvider } from "next-auth/react";
import { LayoutDensityProvider } from "@/components/LayoutDensityProvider";
import { StandaloneNavGuard } from "@/components/StandaloneNavGuard";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <LayoutDensityProvider>
          <StandaloneNavGuard />
          {children}
        </LayoutDensityProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
