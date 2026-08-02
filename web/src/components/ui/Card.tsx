import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
