import { cn } from "@/lib/cn";

type Props = {
  size?: number;
  className?: string;
  /** Invert to black when light theme is active. */
  invertOnLight?: boolean;
};

export function BrandLogo({
  size = 32,
  className,
  invertOnLight = true,
}: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/bsg-logo.png"
      alt="BaikalStageGroup"
      width={size}
      height={size}
      draggable={false}
      className={cn(
        "brand-logo block object-contain",
        invertOnLight && "brand-logo-invert",
        className,
      )}
    />
  );
}
