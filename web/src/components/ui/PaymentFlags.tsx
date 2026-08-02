"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type PaymentStatus = "unpaid" | "invoice_sent" | "paid";

export function paymentStatus(q: {
  paid: boolean;
  invoiceSent: boolean;
}): PaymentStatus {
  if (q.paid) return "paid";
  if (q.invoiceSent) return "invoice_sent";
  return "unpaid";
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Не оплачено",
  invoice_sent: "Счёт отправлен",
  paid: "Оплачено",
};

type PaymentPatch = {
  invoiceSent: boolean;
  paid: boolean;
  paymentComment?: string;
};

const FLAGS: {
  status: PaymentStatus;
  color: string;
  activeClass: string;
  title: string;
}[] = [
  {
    status: "unpaid",
    color: "bg-[var(--danger)]",
    activeClass:
      "ring-2 ring-[var(--danger)] ring-offset-2 ring-offset-[var(--panel)]",
    title: "Не оплачено",
  },
  {
    status: "invoice_sent",
    color: "bg-[var(--warning)]",
    activeClass:
      "ring-2 ring-[var(--warning)] ring-offset-2 ring-offset-[var(--panel)]",
    title: "Счёт отправлен",
  },
  {
    status: "paid",
    color: "bg-[var(--success)]",
    activeClass:
      "ring-2 ring-[var(--success)] ring-offset-2 ring-offset-[var(--panel)]",
    title: "Оплачено",
  },
];

export function PaymentFlags({
  invoiceSent,
  paid,
  paymentComment = "",
  disabled,
  onChange,
  className,
}: {
  invoiceSent: boolean;
  paid: boolean;
  paymentComment?: string;
  disabled?: boolean;
  onChange: (patch: PaymentPatch) => void | Promise<void>;
  className?: string;
}) {
  const current = paymentStatus({ invoiceSent, paid });
  const [payOpen, setPayOpen] = useState(false);
  const [comment, setComment] = useState(paymentComment);
  const [saving, setSaving] = useState(false);

  async function apply(status: PaymentStatus, nextComment = "") {
    const patch: PaymentPatch =
      status === "paid"
        ? { invoiceSent: true, paid: true, paymentComment: nextComment }
        : status === "invoice_sent"
          ? { invoiceSent: true, paid: false, paymentComment: "" }
          : { invoiceSent: false, paid: false, paymentComment: "" };
    setSaving(true);
    try {
      await onChange(patch);
    } finally {
      setSaving(false);
    }
  }

  function handleFlag(status: PaymentStatus) {
    if (disabled || saving) return;
    if (status === current && status !== "paid") return;
    if (status === "paid") {
      setComment(paymentComment);
      setPayOpen(true);
      return;
    }
    void apply(status);
  }

  async function confirmPaid() {
    await apply("paid", comment.trim());
    setPayOpen(false);
  }

  return (
    <>
      <div className={cn("inline-flex items-center gap-2", className)}>
        {FLAGS.map((f) => {
          const active = current === f.status;
          return (
            <button
              key={f.status}
              type="button"
              title={f.title}
              aria-label={f.title}
              aria-pressed={active}
              disabled={disabled || saving}
              onClick={() => handleFlag(f.status)}
              className={cn(
                "h-5 w-5 rounded-full transition-transform disabled:cursor-not-allowed disabled:opacity-40",
                f.color,
                active
                  ? cn("scale-110", f.activeClass)
                  : "opacity-35 hover:opacity-80",
              )}
            />
          );
        })}
        <span className="ml-1 text-xs text-[var(--muted)]">
          {PAYMENT_STATUS_LABELS[current]}
          {paid && paymentComment ? ` · ${paymentComment}` : ""}
        </span>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Отметить оплату"
      >
        <p className="mt-2 text-sm text-[var(--muted)]">
          Если оплата наличными — укажите это в комментарии.
        </p>
        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Комментарий</span>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="например: наличкой"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmPaid();
            }}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPayOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => void confirmPaid()}
          >
            Оплачено
          </Button>
        </div>
      </Modal>
    </>
  );
}
