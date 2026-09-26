import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function assertValidPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
}

export interface PortStatus {
  port: number;
  isRunning: boolean;
  pid?: number;
}

/**
 * Check if a process is running on a specific port
 */
export async function checkPort(port: number): Promise<PortStatus> {
  assertValidPort(port);
  try {
    const { stdout } = await execFileAsync("lsof", ["-i", `:${port}`, "-t"]);
    const pid = parseInt(stdout.trim().split("\n")[0], 10);
    return { port, isRunning: !isNaN(pid), pid: isNaN(pid) ? undefined : pid };
  } catch {
    // lsof returns error if no process found
    return { port, isRunning: false };
  }
}

/**
 * Check multiple ports at once
 */
export async function checkPorts(ports: number[]): Promise<Map<number, PortStatus>> {
  const results = await Promise.all(ports.map(checkPort));
  return new Map(results.map((r) => [r.port, r]));
}

/**
 * Find the next available port starting from base
 */
export async function findNextAvailablePort(base: number = 3001): Promise<number> {
  let port = base;
  while (port < 65535) {
    const status = await checkPort(port);
    if (!status.isRunning) return port;
    port++;
  }
  throw new Error("No available ports found");
}

/**
 * Kill a process on a specific port
 */
export async function killPort(port: number): Promise<boolean> {
  try {
    const status = await checkPort(port);
    if (status.pid) {
      process.kill(status.pid, "SIGTERM");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
