import { AT_ICON_128, AT_ICON_256, AT_ICON_FULL, AT_ICON_DARK_128, AT_ICON_DARK_64 } from "@/lib/logos";

interface TitanLogoProps {
  className?: string;
  /** Size in Tailwind class format, e.g. "h-8 w-8" */
  size?: "sm" | "md" | "lg" | "xl";
  /** Use dark background variant */
  dark?: boolean;
}

const sizeMap = {
  sm: "h-8 w-8",
  md: "h-14 w-14",
  lg: "h-20 w-20",
  xl: "h-32 w-32",
};

/**
 * Archibald Titan logo component — replaces the generic Lucide Bot icon
 * throughout the app with the actual AT branding.
 */
export function TitanLogo({ className, size = "md", dark = false }: TitanLogoProps) {
  const sizeClass = sizeMap[size];
  const src = dark
    ? size === "xl" || size === "lg" ? AT_ICON_DARK_128 : AT_ICON_DARK_64
    : size === "xl" || size === "lg" ? AT_ICON_FULL : AT_ICON_256;

  return (
    <img
      src={src}
      alt="Titan"
      loading="eager"
      className={`${sizeClass} object-contain ${className ?? ""}`}
    />
  );
}
