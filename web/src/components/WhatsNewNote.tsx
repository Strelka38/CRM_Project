"use client";

import { useEffect, useState } from "react";
import { WHATS_NEW } from "@/lib/whats-new";

const DISMISS_KEY = "org.whatsNew.dismissed";

export function WhatsNewNote() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;
    void fetch("/api/settings")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data: { showWhatsNew?: boolean } | null) => {
        if (data?.showWhatsNew) setOpen(true);
      })
      .catch(() => {});
  }, []);

  if (!open) return null;

  return (
    <aside className="border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Что нового</p>
          <ul className="mt-1 list-disc pl-4 text-[var(--muted)]">
            {WHATS_NEW.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          className="shrink-0 text-[var(--muted)] hover:text-[var(--ink)]"
          onClick={() => {
            window.sessionStorage.setItem(DISMISS_KEY, "1");
            setOpen(false);
          }}
        >
          Скрыть
        </button>
      </div>
    </aside>
  );
}
