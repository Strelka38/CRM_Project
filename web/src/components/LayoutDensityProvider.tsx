"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyLayoutDensity,
  persistLayoutDensity,
  readStoredLayoutDensity,
  type LayoutDensity,
} from "@/lib/layout-density";

type LayoutDensityContextValue = {
  mode: LayoutDensity;
  showingDesktop: boolean;
  setMode: (mode: LayoutDensity) => void;
};

const LayoutDensityContext = createContext<LayoutDensityContextValue | null>(
  null,
);

const WIDE_MQ = "(min-width: 768px)";

export function LayoutDensityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<LayoutDensity>("auto");
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const stored = readStoredLayoutDensity();
    setModeState(stored);
    applyLayoutDensity(stored);
    const mq = window.matchMedia(WIDE_MQ);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const setMode = useCallback((next: LayoutDensity) => {
    setModeState(next);
    persistLayoutDensity(next);
  }, []);

  const showingDesktop = mode === "desktop" || (mode === "auto" && wide);

  const value = useMemo(
    () => ({ mode, showingDesktop, setMode }),
    [mode, showingDesktop, setMode],
  );

  return (
    <LayoutDensityContext.Provider value={value}>
      {children}
    </LayoutDensityContext.Provider>
  );
}

export function useLayoutDensity() {
  const ctx = useContext(LayoutDensityContext);
  if (!ctx) {
    throw new Error("useLayoutDensity must be used within LayoutDensityProvider");
  }
  return ctx;
}
