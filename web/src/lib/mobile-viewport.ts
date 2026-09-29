"use client";

import { useEffect } from "react";

const NARROW_MQ = "(max-width: 767px)";

export function mobileChromeActive(): boolean {
  if (typeof document === "undefined") return false;
  const layout = document.documentElement.dataset.layout;
  if (layout === "desktop") return false;
  if (layout === "mobile") return true;
  return window.matchMedia(NARROW_MQ).matches;
}

export function isTextEntry(el: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  if (el.isContentEditable) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return ![
    "button",
    "submit",
    "reset",
    "checkbox",
    "radio",
    "file",
    "hidden",
    "range",
    "color",
  ].includes(el.type);
}

function applyLock() {
  const root = document.documentElement;
  if (!mobileChromeActive()) {
    root.classList.remove("app-vv-lock", "app-keyboard-open");
    root.style.removeProperty("--app-bottom-inset");
    return;
  }
  root.classList.add("app-vv-lock");
  root.classList.toggle("app-keyboard-open", isTextEntry(document.activeElement));
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);

  const bar = document.querySelector(".app-bottombar");
  if (bar instanceof HTMLElement) {
    root.style.setProperty("--app-bottom-inset", `${Math.round(bar.offsetHeight)}px`);
  }
}

const PIN_DELAYS = [50, 180, 400, 700];

/**
 * Нижнее меню — position:fixed к низу экрана.
 * document-scroll после клавиатуры/шаринга сбрасываем.
 * Пока фокус в поле — бар прячем: на iOS он иначе садится на клавиатуру.
 */
export function useMobileViewportLock() {
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const timers: number[] = [];

    function pin() {
      applyLock();
    }

    function pinSoon() {
      pin();
      requestAnimationFrame(pin);
      for (const id of timers) window.clearTimeout(id);
      timers.length = 0;
      for (const ms of PIN_DELAYS) {
        timers.push(window.setTimeout(pin, ms));
      }
    }

    const vv = window.visualViewport;
    vv?.addEventListener("resize", pinSoon);
    vv?.addEventListener("scroll", pinSoon);
    window.addEventListener("resize", pinSoon);
    window.addEventListener("orientationchange", pinSoon);
    window.addEventListener("focusin", pinSoon);
    window.addEventListener("focusout", pinSoon);
    document.addEventListener("focusin", pinSoon);
    document.addEventListener("focusout", pinSoon);
    window.addEventListener("pageshow", pinSoon);
    window.addEventListener("focus", pinSoon);
    window.addEventListener("bs-crm-viewport-pin", pinSoon);
    document.addEventListener("visibilitychange", pinSoon);
    mq.addEventListener("change", pinSoon);
    const mo = new MutationObserver(pinSoon);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-layout"],
    });
    pin();

    return () => {
      vv?.removeEventListener("resize", pinSoon);
      vv?.removeEventListener("scroll", pinSoon);
      window.removeEventListener("resize", pinSoon);
      window.removeEventListener("orientationchange", pinSoon);
      window.removeEventListener("focusin", pinSoon);
      window.removeEventListener("focusout", pinSoon);
      document.removeEventListener("focusin", pinSoon);
      document.removeEventListener("focusout", pinSoon);
      window.removeEventListener("pageshow", pinSoon);
      window.removeEventListener("focus", pinSoon);
      window.removeEventListener("bs-crm-viewport-pin", pinSoon);
      document.removeEventListener("visibilitychange", pinSoon);
      mq.removeEventListener("change", pinSoon);
      mo.disconnect();
      for (const id of timers) window.clearTimeout(id);
      document.documentElement.classList.remove("app-vv-lock", "app-keyboard-open");
      document.documentElement.style.removeProperty("--app-bottom-inset");
    };
  }, []);
}
