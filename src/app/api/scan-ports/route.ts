import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const execAsync = promisify(exec);

interface PortEntry {
  port: number;
  name?: string;
  path?: string;
}

interface TinkerConfig {
  name?: string;
  description?: string;
  port?: number;           // Single port (simple projects)
  ports?: PortEntry[];     // Multiple ports (complex projects)
  org?: string;
  repo?: string;
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
    // Scan common dev server port ranges
    const ranges = [
      [3000, 3100],  // Next.js, Vite, etc.
      [4000, 4100],  // Various dev servers
      [5000, 5200],  // Vite, Flask, etc.
      [8000, 8100],  // Python, PHP, etc.
    ];

    const allPorts = await Promise.all(
      ranges.map(([start, end]) => scanPorts(start, end))
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

    return NextResponse.json({ success: true, ports });
  } catch (error) {
    console.error("Port scan error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to scan ports" },
      { status: 500 }
    );
  }
}

async function scanPorts(startPort: number, endPort: number): Promise<PortInfo[]> {
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
        // Try to read .tinker.yaml from the project directory
        const project = cwd ? await readTinkerConfig(cwd) : undefined;

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
      const info = await checkSinglePort(port);
      if (info) {
        results.push(info);
      }
    }
  }

  return results.sort((a, b) => a.port - b.port);
}

function parseLsofLine(line: string): { port: number; pid: number; command: string } | null {
  // lsof output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME (STATE)
  // Example: node 21661 toddgalloway 16u IPv6 0x... 0t0 TCP *:3000 (LISTEN)
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

async function checkSinglePort(port: number): Promise<PortInfo | null> {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -t -sTCP:LISTEN 2>/dev/null`);
    const pid = parseInt(stdout.trim().split("\n")[0], 10);
    if (isNaN(pid)) return null;

    // Get command name
    const { stdout: psOut } = await execAsync(`ps -p ${pid} -o comm= 2>/dev/null`);
    const command = psOut.trim();

    const cwd = await getProcessCwd(pid);
    const project = cwd ? await readTinkerConfig(cwd) : undefined;

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
 */
async function readTinkerConfig(projectDir: string): Promise<TinkerConfig | undefined> {
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
    let currentPortEntry: Partial<PortEntry> = {};

    // Simple YAML parser for our format
    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Check for ports array start
      if (trimmed === "ports:") {
        inPortsArray = true;
        config.ports = [];
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

      // Handle top-level properties (not in ports array)
      if (!inPortsArray) {
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

    // Only return if we found at least a name
    return config.name ? config : undefined;
  } catch {
    return undefined;
  }
}
