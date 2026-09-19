"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function internalPath(anchor: HTMLAnchorElement): string | null {
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * iOS home-screen web app opens Safari on `<a href>`. Block the native jump
 * and route inside the web app. Next.js Link skips the click if default is
 * already prevented, so we push ourselves.
 */
export function StandaloneNavGuard() {
  const router = useRouter();

  useEffect(() => {
    if (!isStandaloneApp()) return;

    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const next = internalPath(anchor);
      if (!next) return;
      e.preventDefault();
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) router.push(next);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
