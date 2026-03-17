import { existsSync } from "fs";
import path from "path";

/** Standard favicon search locations across all project types */
export const FAVICON_LOCATIONS = [
  // Next.js / React
  "public/favicon.ico",
  "public/favicon.png",
  "public/favicon.svg",
  "app/favicon.ico",
  "src/app/favicon.ico",
  "app/icon.png",
  "src/app/icon.png",
  "app/icon.svg",
  "src/app/icon.svg",
  // Django / Python backends
  "static/favicon.ico",
  "backend/static/favicon.ico",
  "backend/staticfiles/favicon.ico",
  // Other common locations
  "assets/favicon.ico",
  "assets/images/favicon.ico",
  "favicon.ico",
];

/** Find a favicon file in a project directory, returns absolute path or null */
export function findProjectFavicon(projectDir: string): string | null {
  for (const loc of FAVICON_LOCATIONS) {
    const p = path.join(projectDir, loc);
    if (existsSync(p)) return p;
  }
  return null;
}
