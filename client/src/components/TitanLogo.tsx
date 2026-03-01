import { AT_ICON_64, AT_ICON_128, AT_ICON_256, AT_ICON_FULL } from "@/lib/logos";

interface TitanLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  dark?: boolean;
}

/**
 * Size → pixel dimensions and optimal image source.
 * Uses the real Archibald Titan logo (transparent PNG).
 */
const sizeMap: Record<string, { container: string; imgClass: string; src: string }> = {
  sm: { container: "h-8 w-8", imgClass: "h-7 w-7", src: AT_ICON_64 },
  md: { container: "h-14 w-14", imgClass: "h-12 w-12", src: AT_ICON_128 },
  lg: { container: "h-20 w-20", imgClass: "h-18 w-18", src: AT_ICON_256 },
  xl: { container: "h-32 w-32", imgClass: "h-28 w-28", src: AT_ICON_FULL },
};

/**
 * Archibald Titan logo component — renders the real brand logo.
 * Uses the Titan Assistant icon (robot warrior with blue lightning).
 * Transparent PNG, works on both light and dark backgrounds.
 */
export function TitanLogo({ className, size = "md" }: TitanLogoProps) {
  const { container, imgClass, src } = sizeMap[size] || sizeMap.md;

  return (
    <div className={`${container} flex items-center justify-center shrink-0 ${className ?? ""}`}>
      <img
        loading="eager"
        src={src}
        alt="Archibald Titan"
        className={`${imgClass} object-contain`}
        draggable={false}
      />
    </div>
  );
}
