"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import type { QuoteImportSource } from "@/lib/quote-excel-import";

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (choice: { source: QuoteImportSource; cashless: boolean }) => void;
};

function Choice({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-9 flex-1 rounded-[var(--radius-sm)] px-3 text-sm",
        pressed
          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
          : "text-[var(--muted)] hover:text-[var(--ink)]",
      )}
    >
      {label}
    </button>
  );
}

export function QuoteImportModal({ open, busy, onClose, onConfirm }: Props) {
  const [source, setSource] = useState<QuoteImportSource>("excel");
  const [cashless, setCashless] = useState(true);

  return (
    <Modal open={open} onClose={onClose} title="Импорт сметы" className="max-w-md">
      <p className="text-sm text-[var(--muted)]">
        Цена из файла записывается в выбранном режиме. Переключатель «Безнал»
        в смете потом пересчитает строки так же, как у собранной вручную.
      </p>

      <fieldset className="mt-4">
        <legend className="text-caption text-[var(--muted)]">Источник</legend>
        <div className="mt-1.5 flex rounded-[var(--radius-sm)] border border-[var(--line)] p-0.5">
          <Choice
            label="Из Головы"
            pressed={source === "golova"}
            onClick={() => setSource("golova")}
          />
          <Choice
            label="Из Excel"
            pressed={source === "excel"}
            onClick={() => setSource("excel")}
          />
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-caption text-[var(--muted)]">Расчёт</legend>
        <div className="mt-1.5 flex rounded-[var(--radius-sm)] border border-[var(--line)] p-0.5">
          <Choice
            label="Нал"
            pressed={!cashless}
            onClick={() => setCashless(false)}
          />
          <Choice
            label="Безнал"
            pressed={cashless}
            onClick={() => setCashless(true)}
          />
        </div>
      </fieldset>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onConfirm({ source, cashless })}
        >
          Выбрать файл
        </Button>
      </div>
    </Modal>
  );
}
