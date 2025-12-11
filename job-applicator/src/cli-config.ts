import type { CliProvider } from "./types.js"

// CLI command configurations for different AI providers.
// These must always run in non-interactive/auto-approved mode because
// the Electron shell cannot grant permissions interactively. Each command
// below includes the provider's "full permissions" / "autonomous" flag to
// skip any approval prompts.
export const CLI_COMMANDS: Record<CliProvider, [string, string[]]> = {
  claude: [
    "claude",
    ["--print", "--output-format", "json", "--dangerously-skip-permissions", "-p", "-"],
  ],
  codex: [
    "codex",
    ["exec", "--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox"],
  ],
  gemini: ["gemini", ["-o", "json", "--yolo"]],
}

export function getCliCommand(provider: CliProvider): [string, string[]] {
  return CLI_COMMANDS[provider]
}
