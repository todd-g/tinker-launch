/**
 * Color parsing and conversion utilities
 * Supports HSL, HSB/HSV, and Hex formats
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a color string and return RGB values (0-255 scale)
 * Supports:
 *   - HSL: "hsl(120, 50%, 10%)"
 *   - HSB/HSV: "hsb(120, 60%, 15%)" or "hsv(120, 60%, 15%)"
 *   - Hex: "#1a2e1a" or "#1a2"
 */
export function parseColor(color: string): RGB | null {
  const trimmed = color.trim().toLowerCase();

  // HSL format
  const hslMatch = trimmed.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1], 10);
    const s = parseInt(hslMatch[2], 10) / 100;
    const l = parseInt(hslMatch[3], 10) / 100;
    return hslToRgb(h, s, l);
  }

  // HSB/HSV format
  const hsbMatch = trimmed.match(/^hsb?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/) ||
                   trimmed.match(/^hsv\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/);
  if (hsbMatch) {
    const h = parseInt(hsbMatch[1], 10);
    const s = parseInt(hsbMatch[2], 10) / 100;
    const b = parseInt(hsbMatch[3], 10) / 100;
    return hsbToRgb(h, s, b);
  }

  // Hex format
  const hexMatch = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hexMatch) {
    return hexToRgb(hexMatch[1]);
  }

  return null;
}

/**
 * Convert HSL to RGB
 * h: 0-360, s: 0-1, l: 0-1
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  h = h % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Convert HSB/HSV to RGB
 * h: 0-360, s: 0-1, b: 0-1
 */
function hsbToRgb(h: number, s: number, b: number): RGB {
  h = h % 360;
  const c = b * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = b - c;

  let r = 0, g = 0, bl = 0;
  if (h < 60) { r = c; g = x; bl = 0; }
  else if (h < 120) { r = x; g = c; bl = 0; }
  else if (h < 180) { r = 0; g = c; bl = x; }
  else if (h < 240) { r = 0; g = x; bl = c; }
  else if (h < 300) { r = x; g = 0; bl = c; }
  else { r = c; g = 0; bl = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((bl + m) * 255),
  };
}

/**
 * Convert Hex to RGB
 */
function hexToRgb(hex: string): RGB {
  // Expand shorthand (#abc -> #aabbcc)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/**
 * Convert RGB (0-255) to Terminal.app scale (0-65535)
 */
export function rgbToTerminalScale(rgb: RGB): { r: number; g: number; b: number } {
  return {
    r: rgb.r * 257,
    g: rgb.g * 257,
    b: rgb.b * 257,
  };
}

/**
 * Convert RGB to CSS hex string
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert any supported color format to CSS hex
 */
export function colorToHex(color: string): string | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  return rgbToHex(rgb);
}

/**
 * Convert RGB to HSL
 * Returns { h: 0-360, s: 0-100, l: 0-100 }
 */
export function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Generate terminal background colors (light and dark) from a brand color
 * Takes any color format and returns HSL strings suitable for terminal backgrounds
 */
export function generateTerminalColors(brandColor: string): { dark: string; light: string } | null {
  const rgb = parseColor(brandColor);
  if (!rgb) return null;

  const hsl = rgbToHsl(rgb);

  // For dark mode: Keep hue, moderate saturation, very low lightness (8-15%)
  const darkL = Math.max(8, Math.min(15, hsl.l > 50 ? 12 : 10));
  const darkS = Math.max(30, Math.min(60, hsl.s));

  // For light mode: Keep hue, moderate saturation, medium lightness (65-72%)
  // More saturated/colorful, still readable with dark text
  const lightL = Math.max(65, Math.min(72, hsl.l < 50 ? 68 : 70));
  const lightS = Math.max(30, Math.min(60, hsl.s * 0.8));

  return {
    dark: `hsl(${hsl.h}, ${darkS}%, ${darkL}%)`,
    light: `hsl(${hsl.h}, ${Math.round(lightS)}%, ${lightL}%)`,
  };
}

/**
 * Determine if a color is "light" (would need dark text for contrast)
 * Uses relative luminance calculation
 */
export function isLightColor(color: string): boolean {
  const rgb = parseColor(color);
  if (!rgb) return false;

  // Calculate relative luminance using sRGB formula
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5;
}

/**
 * Parse Tailwind CSS color values
 * Handles: hex, rgb(), hsl(), and Tailwind's oklch() format
 */
export function parseTailwindColor(value: string): string | null {
  const trimmed = value.trim();

  // Already a standard format we can parse
  if (parseColor(trimmed)) {
    return trimmed;
  }

  // Handle oklch() - convert to approximate hex
  // oklch(0.7 0.15 200) -> approximate conversion
  const oklchMatch = trimmed.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (oklchMatch) {
    const l = parseFloat(oklchMatch[1]);
    const c = parseFloat(oklchMatch[2]);
    const h = parseFloat(oklchMatch[3]);
    // Simplified oklch to RGB approximation
    const rgb = oklchToRgbApprox(l, c, h);
    return rgbToHex(rgb);
  }

  return null;
}

/**
 * Approximate oklch to RGB conversion
 * This is a simplified conversion - not perfectly accurate but good enough for our purposes
 */
function oklchToRgbApprox(l: number, c: number, h: number): RGB {
  // Convert oklch to approximate RGB
  // L is lightness (0-1), C is chroma (0-0.4ish), H is hue (0-360)
  const hRad = (h * Math.PI) / 180;

  // Approximate conversion through Lab-like intermediate
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // Very simplified Lab to RGB (not accurate but gives reasonable results)
  let r = l + 0.3963377774 * a + 0.2158037573 * b;
  let g = l - 0.1055613458 * a - 0.0638541728 * b;
  let bl = l - 0.0894841775 * a - 1.2914855480 * b;

  // Gamma correction and clamp
  r = Math.max(0, Math.min(1, r)) ** 2.2;
  g = Math.max(0, Math.min(1, g)) ** 2.2;
  bl = Math.max(0, Math.min(1, bl)) ** 2.2;

  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255))),
    g: Math.round(Math.max(0, Math.min(255, g * 255))),
    b: Math.round(Math.max(0, Math.min(255, bl * 255))),
  };
}
