export type LayoutDensity = "auto" | "desktop" | "mobile";

export const LAYOUT_STORAGE_KEY = "bs-crm-layout";
export const LAYOUT_COOKIE = "bs-crm-layout";
export const DESKTOP_VIEWPORT = "width=1280";
export const MOBILE_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover";

export function isLayoutDensity(value: unknown): value is LayoutDensity {
  return value === "auto" || value === "desktop" || value === "mobile";
}

export function readStoredLayoutDensity(): LayoutDensity {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (isLayoutDensity(raw)) return raw;
  } catch {
    /* ignore */
  }
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${LAYOUT_COOKIE}=([^;]*)`),
    );
    const raw = match ? decodeURIComponent(match[1]) : "";
    if (isLayoutDensity(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function applyLayoutDensity(mode: LayoutDensity) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "auto") {
    delete root.dataset.layout;
  } else {
    root.dataset.layout = mode;
  }
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute(
      "content",
      mode === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT,
    );
  }
}

export function persistLayoutDensity(mode: LayoutDensity) {
  try {
    if (mode === "auto") {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } else {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    }
  } catch {
    /* ignore */
  }
  try {
    if (mode === "auto") {
      document.cookie = `${LAYOUT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    } else {
      document.cookie = `${LAYOUT_COOKIE}=${encodeURIComponent(mode)}; path=/; max-age=31536000; SameSite=Lax`;
    }
  } catch {
    /* ignore */
  }
  applyLayoutDensity(mode);
}

/** Inline script for <head> — applies stored layout before paint. */
export const LAYOUT_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(LAYOUT_STORAGE_KEY)};var c=${JSON.stringify(LAYOUT_COOKIE)};var t="";try{t=localStorage.getItem(k)||""}catch(e){}if(t!=="desktop"&&t!=="mobile"){var m=document.cookie.match(new RegExp("(?:^|; )"+c+"=([^;]*)"));t=m?decodeURIComponent(m[1]):""}if(t==="desktop"||t==="mobile"){document.documentElement.dataset.layout=t;if(t==="desktop"){var v=document.querySelector('meta[name="viewport"]');if(v)v.setAttribute("content",${JSON.stringify(DESKTOP_VIEWPORT)})}}}catch(e){}})();`;
