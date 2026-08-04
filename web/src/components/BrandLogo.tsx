import Image from "next/image";
import { cn } from "@/lib/cn";

type Props = {
  size?: number;
  className?: string;
  /** Invert colors when site theme is light (black rings on light). */
  invertOnLight?: boolean;
};

export function BrandLogo({
  size = 32,
  className,
  invertOnLight = true,
}: Props) {
  return (
    <Image
      src="/brand/bsg-logo.png"
      alt="BaikalStageGroup"
      width={size}
      height={size}
      priority
      className={cn(
        "brand-logo object-contain",
        invertOnLight && "brand-logo-invert",
        className,
      )}
    />
  );
}
