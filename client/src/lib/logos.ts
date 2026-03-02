/**
 * Centralized logo paths for Archibald Titan branding.
 *
 * Uses Vite asset imports so logos are bundled into the JS output
 * with content hashes (served from /assets/ instead of /logos/).
 * This ensures logos load correctly regardless of domain or CDN config.
 *
 * Small files (<4KB) are automatically inlined as base64 data URIs.
 * Larger files get content-hashed filenames in the /assets/ directory.
 */

// AT icon/monogram (transparent background) — Titan Assistant logo
import atIcon32 from "@/assets/logos/at-icon-64.png";   // 32px uses 64px source (downscaled)
import atIcon64 from "@/assets/logos/at-icon-64.png";
import atIcon128 from "@/assets/logos/at-icon-128.png";
import atIcon256 from "@/assets/logos/at-icon-256.png";
import atIconFull from "@/assets/logos/at-icon-full.png";

// Full Archibald Titan logo with text (for login page, onboarding)
import fullLogo256 from "@/assets/logos/full-logo-256.png";
import fullLogo512 from "@/assets/logos/full-logo-512.png";
import fullLogoOriginal from "@/assets/logos/full-logo-original.png";

export const AT_ICON_32 = atIcon32;
export const AT_ICON_64 = atIcon64;
export const AT_ICON_128 = atIcon128;
export const AT_ICON_256 = atIcon256;
export const AT_ICON_FULL = atIconFull;

// AT icon on dark background — same logo works on both (transparent bg)
export const AT_ICON_DARK_64 = atIcon64;
export const AT_ICON_DARK_128 = atIcon128;

// Full logo exports
export const FULL_LOGO_256 = fullLogo256;
export const FULL_LOGO_512 = fullLogo512;
export const FULL_LOGO_DARK_256 = fullLogo256;
export const FULL_LOGO_DARK_512 = fullLogo512;
export const FULL_LOGO_ORIGINAL = fullLogoOriginal;

// Tech Bazaar marketplace logo — keep as public path (non-critical)
export const BAZAAR_LOGO_64 = "/logos/bazaar-logo-64.png";
export const BAZAAR_LOGO_128 = "/logos/bazaar-logo-128.png";
export const BAZAAR_LOGO_256 = "/logos/bazaar-logo-256.png";
export const BAZAAR_LOGO_FULL = "/logos/bazaar-logo-full.png";

// Tier membership logos (256x256, transparent) — keep as public path (non-critical)
export const TIER_LOGOS: Record<string, string> = {
  free: "/logos/tiers/free.png",
  pro: "/logos/tiers/pro.png",
  enterprise: "/logos/tiers/enterprise.png",
  cyber: "/logos/tiers/cyber.png",
  cyber_plus: "/logos/tiers/cyber_plus.png",
  titan: "/logos/tiers/titan.png",
};

// Favicon
export const FAVICON_URL = atIcon32;
