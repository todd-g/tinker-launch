// Locked-down argv for running a project skill headlessly: `claude -p /<skill>`.
//
// These runs are unattended and (for inbound triage) read untrusted email text, so a prompt
// injection must not get the machine. Layers:
//   - dontAsk: any tool call not pre-approved below is denied (no prompt, no bypass)
//   - --setting-sources project: ignore user/local settings, whose broad allow rules and
//     defaultMode would otherwise widen what's approved
//   - --tools Bash,Read: no Write/Edit/WebFetch/etc. at all
//   - --allowedTools: only `curl -s` to the skill's own localhost:3001 API area (+ any MCP tools)
//   - sandbox: Bash can only reach localhost, even if a curl sneaks in a second URL (the
//     prefix-style Bash rules can't stop `curl <allowed-url> <other-url>` on their own)
//   - Read is kept so the agent can open its own truncated tool output; secrets are denied

const DASHBOARD = "http://localhost:3001";

const SANDBOX_SETTINGS = JSON.stringify({
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: false, // still require the allowlist inside the sandbox
    allowUnsandboxedCommands: false, // no dangerouslyDisableSandbox escape hatch
    network: { allowedDomains: ["localhost", "127.0.0.1"], allowLocalBinding: true },
  },
});

const DENIED_TOOLS = [
  "Read(**/.envrc)",
  "Read(~/.tinker-launch/**)",
  "Bash(curl * -o *)",
  "Bash(curl *--output*)",
];

/** GET + POST curl rules (bare and quoted URL forms) for each /api/<area>/* the skill calls */
export function curlRulesFor(apiAreas: string[]): string[] {
  return apiAreas.flatMap((area) => {
    const url = `${DASHBOARD}/api/${area}/*`;
    return [
      `Bash(curl -s ${url})`,
      `Bash(curl -s -X POST ${url})`,
      `Bash(curl -s "${url})`,
      `Bash(curl -s -X POST "${url})`,
    ];
  });
}

export function headlessSkillArgs(
  skill: string,
  opts: { allowedTools: string[]; useMcp?: boolean }
): string[] {
  return [
    "-p", `/${skill}`,
    "--output-format", "json",
    "--permission-mode", "dontAsk",
    "--setting-sources", "project",
    "--settings", SANDBOX_SETTINGS,
    "--tools", "Bash,Read",
    "--allowedTools", ...opts.allowedTools,
    "--disallowedTools", ...DENIED_TOOLS,
    // Skip MCP entirely unless the skill needs a connector
    ...(opts.useMcp ? [] : ["--strict-mcp-config"]),
  ];
}
