import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium transition-[background-color,border-color,color,opacity,transform] duration-150 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-deep)]",
        secondary:
          "rounded-[var(--radius-sm)] border border-[var(--hairline-strong)] bg-transparent text-[var(--ink)] hover:border-[var(--ink)] hover:bg-[var(--panel-muted)]",
        ghost:
          "rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)]",
        outline:
          "rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--panel-muted)]",
        icon: "rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--btn-icon-bg)] text-[var(--ink)] hover:bg-[var(--btn-icon-hover)] shrink-0",
        danger:
          "rounded-[var(--radius-sm)] bg-[var(--danger)] text-white hover:opacity-90",
        "danger-ghost":
          "rounded-[var(--radius-sm)] text-[var(--danger)] hover:bg-[var(--danger)]/15",
      },
      size: {
        sm: "h-8 min-h-[max(2rem,var(--tap-min))] px-3 text-xs",
        md: "h-10 min-h-[max(2.5rem,var(--tap-min))] px-4 text-sm",
        lg: "h-12 min-h-[max(3rem,var(--tap-min))] px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
