"use client";

import { useEffect, useState } from "react";

const POLL_MS = 5000;

export function PublicQuoteView({ token }: { token: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = "";
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/kp/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (res.status === 404) {
        setDead(true);
        setHtml(null);
        return;
      }
      if (!res.ok) {
        if (!current) setFailed(true);
        return;
      }
      const next = await res.text();
      if (cancelled || next === current) return;
      current = next;
      setDead(false);
      setFailed(false);
      setHtml(next);
    }

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  if (dead) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-6 text-center text-[var(--ink)]">
        <div className="max-w-sm">
          <p className="text-lg font-medium">Ссылка больше не действует</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Мероприятие завершено или ссылку отозвали.
          </p>
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-6 text-center text-sm text-[var(--muted)]">
        {failed ? "Не удалось открыть предложение" : "Загрузка предложения…"}
      </div>
    );
  }

  return (
    <iframe
      title="Коммерческое предложение"
      srcDoc={html}
      className="block h-dvh w-full border-0 bg-[var(--bg)]"
    />
  );
}
