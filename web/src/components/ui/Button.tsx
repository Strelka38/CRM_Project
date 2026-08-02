import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "rounded-full bg-cta text-white shadow-lg shadow-[#009ee3]/20 hover:scale-[1.02] hover:shadow-[#009ee3]/35",
        secondary:
          "rounded-full border border-[var(--accent-glow)] bg-transparent text-[var(--accent-deep)] hover:bg-subtle",
        ghost:
          "rounded-md text-[var(--muted)] hover:bg-white/10 hover:text-[var(--ink)]",
        outline:
          "rounded-md border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:bg-white/10",
        danger: "rounded-full bg-[var(--danger)] text-white hover:bg-red-600",
        "danger-ghost": "rounded-md text-[var(--danger)] hover:bg-red-500/150/15",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-2.5 text-sm",
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
