import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, readdir } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { findProjectFavicon } from "@/lib/favicon";
import {
  parseColor,
  rgbToTerminalScale,
  rgbToHex,
  generateTerminalColors,
  parseTailwindColor,
} from "@/lib/colors";

const execAsync = promisify(exec);

interface PortEntry {
  port: number;
  name?: string;
  path?: string;
}

interface TerminalConfig {
  background?: string;     // Legacy: single color
  dark?: string;           // Dark mode terminal background
  light?: string;          // Light mode terminal background
}

interface TinkerConfig {
  name?: string;
  description?: string;
  port?: number;           // Single port (simple projects)
  ports?: PortEntry[];     // Multiple ports (complex projects)
  org?: string;
  repo?: string;
  terminal?: TerminalConfig;
  terminalColorHex?: string; // Computed: normalized hex color for UI (based on current appearance)
  favicon?: string;          // Path to favicon if found
  projectPath?: string;      // Path to the project directory
}

interface PortInfo {
  port: number;
  pid: number;
  command: string;
  cwd?: string;
  project?: TinkerConfig;
  portName?: string;  // Specific name for this port (from ports array)
}

export async function GET() {
  try {
    // Get current appearance mode for color selection
    const appearance = await getMacOSAppearance();

    // Build port registry from all .tinker.yaml files (fallback lookup)
    const portRegistry = await buildPortRegistry(appearance);

    // Scan common dev server port ranges
    const ranges = [
      [3000, 3100],  // Next.js, Vite, etc.
      [4000, 4100],  // Various dev servers
      [5000, 5200],  // Vite, Flask, etc.
      [8000, 8100],  // Python, PHP, etc.
    ];

    const allPorts = await Promise.all(
      ranges.map(([start, end]) => scanPorts(start, end, portRegistry, appearance))
    );

    // Dedupe by port (IPv4/IPv6 can create duplicates)
    const seenPorts = new Set<number>();
    const ports = allPorts
      .flat()
      .filter((p) => {
        if (seenPorts.has(p.port)) return false;
        seenPorts.add(p.port);
        return true;
      })
      .sort((a, b) => a.port - b.port);

    // Sync terminal colors in the background (don't block the response)
    syncTerminalColors().catch((err) => {
      console.error("Terminal color sync error:", err);
    });

    return NextResponse.json({ success: true, ports });
  } catch (error) {
    console.error("Port scan error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to scan ports" },
      { status: 500 }
    );
  }
}

async function scanPorts(
  startPort: number,
  endPort: number,
  portRegistry: Map<number, TinkerConfig>,
  appearance: "dark" | "light"
): Promise<PortInfo[]> {
  const results: PortInfo[] = [];

  try {
    // Use lsof to find all listening TCP ports, then filter by range in code
    // The -sTCP:LISTEN flag already filters for listening ports
    const { stdout } = await execAsync(
      `lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`
    );

    if (!stdout.trim()) {
      return results;
    }

    const lines = stdout.trim().split("\n");
    // Skip header row (COMMAND PID USER...)
    const dataLines = lines.slice(1);

    for (const line of dataLines) {
      const parsed = parseLsofLine(line);
      // Filter by port range in code (much faster than regex with 101 alternatives)
      if (parsed && parsed.port >= startPort && parsed.port <= endPort) {
        // Try to get the working directory for this process
        const cwd = await getProcessCwd(parsed.pid);
        // Try to read .tinker.yaml from the project directory (primary source)
        let project = cwd ? await readTinkerConfig(cwd, appearance) : undefined;

        // Fallback: if no project found from cwd, check the port registry
        if (!project && portRegistry.has(parsed.port)) {
          project = portRegistry.get(parsed.port);
        }

        // Find favicon if we have a project directory
        if (project && cwd) {
          const favicon = await findProjectFavicon(cwd);
          if (favicon) {
            project.favicon = favicon;
            project.projectPath = cwd;
          }
        }

        // Check if this port has a specific name in the ports array
        let portName: string | undefined;
        if (project?.ports) {
          const portEntry = project.ports.find((p) => p.port === parsed.port);
          portName = portEntry?.name;
        }

        results.push({ ...parsed, cwd, project, portName });
      }
    }
  } catch {
    // If lsof approach fails, fall back to checking individual ports
    for (let port = startPort; port <= endPort; port++) {
      const info = await checkSinglePort(port, portRegistry, appearance);
      if (info) {
        results.push(info);
      }
    }
  }

  return results.sort((a, b) => a.port - b.port);
}

function parseLsofLine(line: string): { port: number; pid: number; command: string } | null {
  // lsof output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME (STATE)
  // Example: node 21661 username 16u IPv6 0x... 0t0 TCP *:3000 (LISTEN)
  const parts = line.trim().split(/\s+/);
  if (parts.length < 9) return null;

  const command = parts[0];
  const pid = parseInt(parts[1], 10);
  // NAME is second-to-last (e.g., "*:3000"), STATE is last (e.g., "(LISTEN)")
  const name = parts[parts.length - 2];

  const portMatch = name.match(/:(\d+)$/);
  if (!portMatch) return null;

  const port = parseInt(portMatch[1], 10);
  return { port, pid, command };
}

async function checkSinglePort(
  port: number,
  portRegistry: Map<number, TinkerConfig>,
  appearance: "dark" | "light"
): Promise<PortInfo | null> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -t -sTCP:LISTEN 2>/dev/null`);
    const pid = parseInt(stdout.trim().split("\n")[0], 10);
    if (isNaN(pid)) return null;

    // Get command name
    const { stdout: psOut } = await execAsync(`ps -p ${pid} -o comm= 2>/dev/null`);
    const command = psOut.trim();

    const cwd = await getProcessCwd(pid);
    // Try to read .tinker.yaml from the project directory (primary source)
    let project = cwd ? await readTinkerConfig(cwd, appearance) : undefined;

    // Fallback: if no project found from cwd, check the port registry
    if (!project && portRegistry.has(port)) {
      project = portRegistry.get(port);
    }

    // Find favicon if we have a project directory
    if (project && cwd) {
      const favicon = await findProjectFavicon(cwd);
      if (favicon) {
        project.favicon = favicon;
        project.projectPath = cwd;
      }
    }

    // Check if this port has a specific name in the ports array
    let portName: string | undefined;
    if (project?.ports) {
      const portEntry = project.ports.find((p) => p.port === port);
      portName = portEntry?.name;
    }

    return { port, pid, command, cwd, project, portName };
  } catch {
    return null;
  }
}

async function getProcessCwd(pid: number): Promise<string | undefined> {
  try {
    // macOS: use lsof with -a (AND) and -d cwd to get only the cwd file descriptor
    // This is much faster than the previous approach which returned all file descriptors
    const { stdout } = await execAsync(`lsof -a -p ${pid} -d cwd 2>/dev/null | tail -1`);
    // Output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 9) {
      // NAME is the last column (could contain spaces, so join from index 8)
      return parts.slice(8).join(" ");
    }
    return undefined;
  } catch {
    // Alternative: try pwdx on Linux
    try {
      const { stdout } = await execAsync(`pwdx ${pid} 2>/dev/null`);
      const match = stdout.match(/^\d+:\s*(.+)$/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Read and parse .tinker.yaml from a project directory
 * Checks multiple possible filenames and parent directories for flexibility
 * @param appearance - Current macOS appearance mode, used to select dark/light terminal color
 */
async function readTinkerConfig(
  projectDir: string,
  appearance?: "dark" | "light"
): Promise<TinkerConfig | undefined> {
  // Check multiple possible filenames
  const possibleNames = [
    ".tinker.yaml",
    ".tinker-launch.yaml",
    "tinker.yaml",
    "tinker-launch.yaml",
  ];

  // Check current dir and up to 2 parent directories (for monorepos)
  const dirsToCheck = [projectDir];
  let parent = path.dirname(projectDir);
  for (let i = 0; i < 2 && parent !== "/" && parent !== projectDir; i++) {
    dirsToCheck.push(parent);
    parent = path.dirname(parent);
  }

  let configPath: string | undefined;
  outer: for (const dir of dirsToCheck) {
    for (const name of possibleNames) {
      const testPath = path.join(dir, name);
      if (existsSync(testPath)) {
        configPath = testPath;
        break outer;
      }
    }
  }

  if (!configPath) {
    return undefined;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const config: TinkerConfig = {};
    const lines = content.split("\n");
    let inPortsArray = false;
    let inTerminalSection = false;
    let currentPortEntry: Partial<PortEntry> = {};

    // Simple YAML parser for our format
    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Check for section starts
      if (trimmed === "ports:") {
        inPortsArray = true;
        inTerminalSection = false;
        config.ports = [];
        continue;
      }
      if (trimmed === "terminal:") {
        inTerminalSection = true;
        inPortsArray = false;
        config.terminal = {};
        continue;
      }

      // Handle ports array entries
      if (inPortsArray) {
        // New array item (starts with -)
        if (trimmed.startsWith("- ")) {
          // Save previous entry if exists
          if (currentPortEntry.port) {
            config.ports!.push(currentPortEntry as PortEntry);
          }
          currentPortEntry = {};

          // Check if it's a simple "- 3000" or "- port: 3000"
          const simplePort = trimmed.match(/^-\s*(\d+)$/);
          if (simplePort) {
            currentPortEntry.port = parseInt(simplePort[1], 10);
          } else {
            const portMatch = trimmed.match(/^-\s*port:\s*(\d+)$/);
            if (portMatch) {
              currentPortEntry.port = parseInt(portMatch[1], 10);
            }
          }
        } else if (trimmed.match(/^\w+:/)) {
          // Sub-properties of current port entry
          const match = trimmed.match(/^(\w+):\s*(.+)$/);
          if (match) {
            const [, key, value] = match;
            if (key === "port") currentPortEntry.port = parseInt(value, 10);
            else if (key === "name") currentPortEntry.name = value;
            else if (key === "path") currentPortEntry.path = value;
          }
        } else {
          // End of ports array
          if (currentPortEntry.port) {
            config.ports!.push(currentPortEntry as PortEntry);
            currentPortEntry = {};
          }
          inPortsArray = false;
        }
      }

      // Handle terminal section properties
      if (inTerminalSection) {
        // Match: key: "value" or key: value (with optional comment)
        const match = trimmed.match(/^(\w+):\s*"([^"]+)"|^(\w+):\s*([^#\s]+)/);
        if (match) {
          const key = match[1] || match[3];
          const value = match[2] || match[4];
          if (value) {
            if (key === "background") config.terminal!.background = value;
            else if (key === "dark") config.terminal!.dark = value;
            else if (key === "light") config.terminal!.light = value;
          }
        }
        // Check if we've hit a new top-level section (non-indented key)
        if (trimmed.match(/^\w+:$/) || (trimmed.match(/^\w+:\s+\S/) && !["background", "dark", "light"].some(k => trimmed.startsWith(k)))) {
          inTerminalSection = false;
        }
      }

      // Handle top-level properties (not in nested sections)
      if (!inPortsArray && !inTerminalSection) {
        const match = trimmed.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          switch (key) {
            case "name":
              config.name = value;
              break;
            case "description":
              config.description = value;
              break;
            case "port":
              config.port = parseInt(value, 10);
              break;
            case "org":
              config.org = value;
              break;
            case "repo":
              config.repo = value;
              break;
          }
        }
      }
    }

    // Don't forget last port entry
    if (currentPortEntry.port && config.ports) {
      config.ports.push(currentPortEntry as PortEntry);
    }

    // Convert terminal color to hex for UI consumption
    // Priority: dark/light based on appearance, then fallback to background
    const terminalColor = appearance === "light"
      ? (config.terminal?.light || config.terminal?.background)
      : (config.terminal?.dark || config.terminal?.background);

    if (terminalColor) {
      const rgb = parseColor(terminalColor);
      if (rgb) {
        config.terminalColorHex = rgbToHex(rgb);
      }
    }

    // Only return if we found at least a name
    return config.name ? config : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sync terminal colors based on .tinker.yaml files
 * Gets all Terminal.app tabs, reads their working directories,
 * and sets background colors based on project configs
 * Uses macOS appearance mode to select dark/light terminal colors
 */
async function syncTerminalColors(): Promise<void> {
  try {
    // Get current appearance mode
    const appearance = await getMacOSAppearance();

    // Get window count
    const { stdout: countOut } = await execAsync(
      `osascript -e 'tell application "Terminal" to count of windows'`
    );
    const windowCount = parseInt(countOut.trim(), 10);
    if (!windowCount || windowCount === 0) return;

    // Process each window individually (more robust than nested loops)
    for (let w = 1; w <= Math.min(windowCount, 50); w++) {
      try {
        // Get tab count for this window
        const { stdout: tabCountOut } = await execAsync(
          `osascript -e 'tell application "Terminal" to count of tabs of window ${w}'`
        );
        const tabCount = parseInt(tabCountOut.trim(), 10);
        if (!tabCount) continue;

        for (let t = 1; t <= tabCount; t++) {
          try {
            // Get TTY for this tab
            const { stdout: ttyOut } = await execAsync(
              `osascript -e 'tell application "Terminal" to tty of tab ${t} of window ${w}'`
            );
            const tty = ttyOut.trim();
            if (!tty) continue;

            // Get PIDs for this TTY
            const { stdout: pidsOut } = await execAsync(`lsof -t ${tty} 2>/dev/null || true`);
            const pids = pidsOut.trim().split("\n").filter(Boolean);

            let cwd: string | undefined;
            for (const pid of pids) {
              const { stdout: cwdOut } = await execAsync(
                `lsof -a -p ${pid} -d cwd -Fn 2>/dev/null || true`
              );
              for (const line of cwdOut.split("\n")) {
                if (line.startsWith("n") && line.length > 1) {
                  cwd = line.slice(1);
                  break;
                }
              }
              if (cwd) break;
            }

            if (!cwd) continue;

            // Read .tinker.yaml from this directory (with appearance for color selection)
            const config = await readTinkerConfig(cwd, appearance);

            // Select the appropriate color based on appearance mode
            const colorStr = appearance === "light"
              ? (config?.terminal?.light || config?.terminal?.background)
              : (config?.terminal?.dark || config?.terminal?.background);

            if (!colorStr) continue;

            // Parse the color
            const rgb = parseColor(colorStr);
            if (!rgb) continue;

            // Convert to Terminal.app scale (0-65535)
            const termRgb = rgbToTerminalScale(rgb);

            // Set the background color
            await execAsync(
              `osascript -e 'tell application "Terminal" to set background color of tab ${t} of window ${w} to {${termRgb.r}, ${termRgb.g}, ${termRgb.b}}'`
            );
            console.log(`Set terminal color for window ${w}, tab ${t}: ${colorStr} (${appearance} mode)`);
          } catch {
            // Silently skip tabs we can't process
          }
        }
      } catch {
        // Silently skip windows we can't process
      }
    }
  } catch (err) {
    console.error("Failed to sync terminal colors:", err);
  }
}

/**
 * Scan known project directories for .tinker.yaml files
 * Build a map of port -> project config for fallback lookup
 */
async function buildPortRegistry(
  appearance: "dark" | "light"
): Promise<Map<number, TinkerConfig>> {
  const registry = new Map<number, TinkerConfig>();

  // Directories to scan for projects
  const projectDirs = [
    ...(process.env.PROJECTS_DIR ? [process.env.PROJECTS_DIR] : []),
    path.join(process.env.HOME || "", "Documents/GitHub"),
    path.join(process.env.HOME || "", "Projects"),
    path.join(process.env.HOME || "", "Code"),
  ];

  for (const baseDir of projectDirs) {
    if (!existsSync(baseDir)) continue;

    try {
      // List immediate subdirectories (project folders)
      const { stdout } = await execAsync(`ls -d "${baseDir}"/*/ 2>/dev/null || true`);
      const dirs = stdout.trim().split("\n").filter(Boolean);

      for (const dir of dirs) {
        const projectDir = dir.replace(/\/$/, "");

        // Auto-update yaml with detected colors if needed
        await autoUpdateTinkerYaml(projectDir);

        // Read the (possibly updated) config
        const config = await readTinkerConfig(projectDir, appearance);

        // Find favicon
        const favicon = await findProjectFavicon(projectDir);
        if (favicon && config) {
          config.favicon = favicon;
          config.projectPath = projectDir;
        }

        if (config?.port && !registry.has(config.port)) {
          registry.set(config.port, config);
        }
        // Also register any ports from the ports array
        if (config?.ports) {
          for (const portEntry of config.ports) {
            if (!registry.has(portEntry.port)) {
              registry.set(portEntry.port, config);
            }
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  return registry;
}

/**
 * Detect macOS appearance mode (light or dark)
 * Returns "dark" or "light"
 */
async function getMacOSAppearance(): Promise<"dark" | "light"> {
  try {
    const { stdout } = await execAsync(
      "defaults read -g AppleInterfaceStyle 2>/dev/null || echo 'Light'"
    );
    return stdout.trim().toLowerCase() === "dark" ? "dark" : "light";
  } catch {
    return "light"; // Default to light mode
  }
}

/**
 * Find and extract brand/primary color from Tailwind config
 */
async function findTailwindBrandColor(projectDir: string): Promise<string | null> {
  const configFiles = [
    "tailwind.config.js",
    "tailwind.config.ts",
    "tailwind.config.mjs",
  ];

  // First, try to extract color from Tailwind config files (v3 and earlier)
  for (const configFile of configFiles) {
    const configPath = path.join(projectDir, configFile);
    if (!existsSync(configPath)) continue;

    try {
      const content = await readFile(configPath, "utf-8");

      // Look for primary/brand color definitions
      // Common patterns: primary: '#xxx', primary: { DEFAULT: '#xxx' }, brand: '#xxx'
      const patterns = [
        /primary\s*:\s*['"]([#\w().,\s]+)['"]/,
        /primary\s*:\s*\{\s*DEFAULT\s*:\s*['"]([#\w().,\s]+)['"]/,
        /brand\s*:\s*['"]([#\w().,\s]+)['"]/,
        /accent\s*:\s*['"]([#\w().,\s]+)['"]/,
        /["']--primary["']\s*:\s*['"]([#\w().,\s]+)['"]/,
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const color = parseTailwindColor(match[1]);
          if (color) return color;
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback: check CSS globals for CSS variable definitions (Tailwind v4+)
  const cssRelPaths = [
    "src/app/globals.css",
    "app/globals.css",
    "styles/globals.css",
  ];

  const color = await findBrandColorInCssPaths(projectDir, cssRelPaths);
  if (color) return color;

  // Final fallback: search one level of subdirectories for projects
  // where the web app lives in a nested folder (e.g., spikes/video-sync/)
  try {
    const entries = await readdir(projectDir);
    for (const entry of entries) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const subDir = path.join(projectDir, entry);
      try {
        if (!statSync(subDir).isDirectory()) continue;
      } catch { continue; }

      // Check if this subdir has a package.json (is an app)
      if (!existsSync(path.join(subDir, "package.json"))) {
        // Also check one more level deep (e.g., spikes/video-sync/)
        try {
          const innerEntries = await readdir(subDir);
          for (const inner of innerEntries) {
            if (inner === "node_modules") continue;
            const innerDir = path.join(subDir, inner);
            try {
              if (!statSync(innerDir).isDirectory()) continue;
            } catch { continue; }
            if (existsSync(path.join(innerDir, "package.json"))) {
              const innerColor = await findBrandColorInCssPaths(innerDir, cssRelPaths);
              if (innerColor) return innerColor;
            }
          }
        } catch { /* skip */ }
        continue;
      }

      const subColor = await findBrandColorInCssPaths(subDir, cssRelPaths);
      if (subColor) return subColor;
    }
  } catch { /* skip */ }

  return null;
}

async function findBrandColorInCssPaths(baseDir: string, relPaths: string[]): Promise<string | null> {
  for (const relPath of relPaths) {
    const cssPath = path.join(baseDir, relPath);
    if (!existsSync(cssPath)) continue;
    try {
      const cssContent = await readFile(cssPath, "utf-8");
      const cssPatterns = [
        /--primary\s*:\s*([^;]+);/,
        /--brand\s*:\s*([^;]+);/,
        /--accent\s*:\s*([^;]+);/,
      ];
      for (const pattern of cssPatterns) {
        const match = cssContent.match(pattern);
        if (match) {
          const color = parseTailwindColor(match[1].trim());
          if (color) return color;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

// findProjectFavicon is imported from @/lib/favicon

/**
 * Update or create terminal colors in a project's .tinker.yaml
 * Auto-detects brand color from Tailwind and generates light/dark variants
 */
async function autoUpdateTinkerYaml(projectDir: string): Promise<TinkerConfig | null> {
  const yamlPath = path.join(projectDir, ".tinker.yaml");

  // Read existing config or start fresh
  let existingContent = "";
  let config: TinkerConfig = {};

  if (existsSync(yamlPath)) {
    existingContent = await readFile(yamlPath, "utf-8");
    const existing = await readTinkerConfig(projectDir);
    if (existing) config = existing;
  }

  // Check if terminal colors already exist
  if (config.terminal?.dark && config.terminal?.light) {
    // Already has light/dark colors, don't overwrite
    return config;
  }

  // Try to find a color to use for generating dark/light variants
  // Priority: 1) Existing background color in yaml, 2) Tailwind brand color
  let sourceColor: string | null = config.terminal?.background || null;

  if (!sourceColor) {
    // No existing background, try to find brand color from Tailwind
    sourceColor = await findTailwindBrandColor(projectDir);
  }

  if (sourceColor) {
    // Generate terminal colors from source color
    const terminalColors = generateTerminalColors(sourceColor);
    if (terminalColors) {
      // Update the yaml file
      const hasTerminalSection = existingContent.includes("terminal:");

      if (hasTerminalSection) {
        // Add dark/light after any existing background line (or after terminal:)
        let newContent = existingContent;

        // Check if there's already a background line
        if (existingContent.match(/terminal:[\s\S]*?background:/)) {
          // Insert dark/light after the background line
          newContent = existingContent.replace(
            /(terminal:[\s\S]*?background:\s*"[^"]+"\s*(?:#.*)?)(\n)/,
            `$1$2  dark: "${terminalColors.dark}"\n  light: "${terminalColors.light}"\n`
          );
        } else {
          // No background, just add dark/light after terminal:
          newContent = existingContent.replace(
            /terminal:\s*\n/,
            `terminal:\n  dark: "${terminalColors.dark}"\n  light: "${terminalColors.light}"\n`
          );
        }

        await writeFile(yamlPath, newContent, "utf-8");
      } else if (existingContent) {
        // Add terminal section to existing file
        const terminalSection = `\nterminal:\n  dark: "${terminalColors.dark}"\n  light: "${terminalColors.light}"\n`;
        await writeFile(yamlPath, existingContent.trimEnd() + terminalSection, "utf-8");
      } else {
        // No .tinker.yaml exists — create one with inferred name and colors
        const dirName = path.basename(projectDir);
        const inferredName = dirName
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const newContent = `name: ${inferredName}\nterminal:\n  dark: "${terminalColors.dark}"\n  light: "${terminalColors.light}"\n`;
        await writeFile(yamlPath, newContent, "utf-8");
        config.name = inferredName;
      }

      // Update config object
      config.terminal = {
        dark: terminalColors.dark,
        light: terminalColors.light,
      };

      console.log(`Auto-generated terminal colors for ${projectDir}: dark=${terminalColors.dark}, light=${terminalColors.light}`);
    }
  }

  // Find favicon
  const favicon = await findProjectFavicon(projectDir);
  if (favicon) {
    config.favicon = favicon;
  }

  config.projectPath = projectDir;

  return config;
}
