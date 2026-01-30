import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/check-direnv
 * Check if direnv is installed and return setup instructions if not
 */
export async function GET() {
  try {
    // Check if direnv is installed
    const { stdout } = await execAsync("which direnv");
    const direnvPath = stdout.trim();

    // Check if direnv is hooked into shell
    let isHooked = false;
    try {
      // This checks if DIRENV_DIR is set, which indicates direnv is active
      await execAsync('bash -ic "type _direnv_hook 2>/dev/null"');
      isHooked = true;
    } catch {
      // direnv hook not found, which is expected in non-interactive context
      // We'll just check if direnv is installed
    }

    // Get direnv version
    let version = "";
    try {
      const { stdout: versionOut } = await execAsync("direnv version");
      version = versionOut.trim();
    } catch {
      // Ignore version check errors
    }

    return NextResponse.json({
      success: true,
      installed: true,
      path: direnvPath,
      version,
      isHooked,
      instructions: null,
    });
  } catch {
    // direnv not found
    return NextResponse.json({
      success: true,
      installed: false,
      path: null,
      version: null,
      isHooked: false,
      instructions: {
        title: "direnv is not installed",
        description:
          "direnv is a shell extension that auto-loads .envrc files when you cd into a directory.",
        steps: [
          {
            title: "Install direnv",
            command: "brew install direnv",
            note: "Using Homebrew on macOS",
          },
          {
            title: "Hook into your shell",
            zsh: 'Add to ~/.zshrc: eval "$(direnv hook zsh)"',
            bash: 'Add to ~/.bashrc: eval "$(direnv hook bash)"',
          },
          {
            title: "Restart your shell",
            command: "exec $SHELL",
          },
          {
            title: "Allow .envrc files",
            command: "direnv allow",
            note: "Run this in each project directory",
          },
        ],
        links: [
          {
            title: "direnv documentation",
            url: "https://direnv.net/",
          },
          {
            title: "GitHub repository",
            url: "https://github.com/direnv/direnv",
          },
        ],
      },
    });
  }
}
