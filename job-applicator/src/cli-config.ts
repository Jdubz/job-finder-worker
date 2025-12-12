import type { CliProvider } from "./types.js"

// CLI command configurations for different AI providers.
// These must always run in non-interactive/auto-approved mode because
// the Electron shell cannot grant permissions interactively. Each command
// below includes the provider's "full permissions" / "autonomous" flag to
// skip any approval prompts.

// One-shot mode: CLI runs once, processes prompt, outputs JSON, exits
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

// Session mode: CLI stays running for interactive conversation
// Used by AgentSession for persistent form-filling sessions
export const CLI_SESSION_COMMANDS: Record<CliProvider, [string, string[]]> = {
  claude: [
    "claude",
    ["--dangerously-skip-permissions"],
  ],
  codex: [
    "codex",
    ["--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox"],
  ],
  gemini: ["gemini", ["--yolo"]],
}

export function getCliCommand(provider: CliProvider): [string, string[]] {
  return CLI_COMMANDS[provider]
}

export function getCliSessionCommand(provider: CliProvider): [string, string[]] {
  return CLI_SESSION_COMMANDS[provider]
}
