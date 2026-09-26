import { NextResponse, type NextRequest } from "next/server";

// The dashboard is local-only and its API can run commands, kill processes and
// read credentials, so only same-machine callers may reach /api/*.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalHost(value: string | null, withScheme: boolean): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(withScheme ? value : `http://${value}`);
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false; // unparseable, or an opaque "null" origin
  }
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function proxy(request: NextRequest) {
  // Host check blocks DNS rebinding (evil.com resolving to 127.0.0.1)
  if (!isLocalHost(request.headers.get("host"), false)) return forbidden();

  // Browser requests from other sites carry a foreign Origin / Sec-Fetch-Site.
  // Local curl (skills, ingest daemon) sends neither and passes.
  const origin = request.headers.get("origin");
  if (origin !== null && !isLocalHost(origin, true)) return forbidden();
  if (request.headers.get("sec-fetch-site") === "cross-site") return forbidden();

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
