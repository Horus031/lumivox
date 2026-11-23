import Image from "next/image";

import { cn } from "@/lib/utils";

const artwork = {
  mark: { light: "/logo-new.webp", dark: "/logo-new-white.webp", ratio: 1 },
  wordmark: { light: "/logo-text.webp", dark: "/logo-text-white.webp", ratio: 3 },
};

type BrandLogoProps = {
  variant: keyof typeof artwork;
  width: number;
  alt?: string;
  className?: string;
};

export function BrandLogo({ variant, width, alt = "", className }: BrandLogoProps) {
  const { light, dark, ratio } = artwork[variant];
  const height = width / ratio;

  return (
    <span className={cn("inline-block shrink-0", className)}>
      <Image src={light} alt={alt} width={width} height={height} className="block dark:hidden" />
      <Image src={dark} alt={alt} width={width} height={height} className="hidden dark:block" />
    </span>
  );
}
