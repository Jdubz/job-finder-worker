# AI CLI Integration Plan

> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-11-18

## Goal
Run Claude, Codex, and Gemini CLIs inside the existing backend Docker image (one image for the whole stack) so generator/worker processes can call AI agents without embedding API keys.

## Approach
1. **Install CLIs in the backend image (Codex-first)**
   - Extend `job-finder-BE/server/Dockerfile` to `npm install -g`:
     - `@openai/codex` **(default agent, best JSON fidelity for resume/cover-letter prompts)**.
     - `@anthropic-ai/claude-code`
     - `@google/gemini-cli`
   - Add supporting tools (bash, git, curl, chromium if PDF generation needs it).
   - Codex CLI usage for non-interactive runs: `codex exec --cd /workspace --dangerously-bypass-approvals-and-sandbox '<prompt>'`.
   - Gemini CLI usage when explicitly requested: `gemini --print --model gemini-1.5-flash --output json --prompt '<prompt>'`.
   - Claude CLI fallback: `claude --print --dangerously-skip-permissions --output-format json --prompt '<prompt>'`.

2. **Temporary credential copy**
   - Do **not** mount host creds directly into the runtime paths.
   - Instead, mirror dev-bots:
     1. Mount host credential files read-only at `/tmp/host-creds/claude.json`, `/tmp/host-creds/codex.json`, `/tmp/host-creds/gemini.json` when starting the container.
     2. On container start (or before invoking a CLI), copy each file into an in-container tmpfs directory (`/home/node/.claude/.credentials.json`, etc.).
     3. Ensure the target directories exist and have `0700` perms; use tmpfs/ramdisk to avoid writing secrets to disk layers.

3. **Repository workflow**
   - Continue cloning the repo inside the container per task (no host volume mounts) for isolation.
   - Deliver task-specific context via `tar | docker cp` bundles, same as dev-bots.

4. **Runtime invocation**
   - Backend services launch AI work as child processes. The workflow calls Codex first and falls back to Gemini or Claude only when explicitly configured or when Codex fails.
   - Provide wrappers that log stdout/stderr and enforce exit-code handling.
   - Known Gemini 2.5 Flash limitations (May 2025):
     - Several production teams report severe quality regressions (malformed text, failing evals, latency spikes). Keep Gemini disabled unless we need to debug/compare output.
     - Reference: [Google Dev Forum – Gemini 2.5 Flash quality](https://discuss.ai.google.dev/t/gemini-2-5-flash-quality-degradation-based-on-internal-evals/94561?utm_source=openai).
     - Reference: [Reddit – Gemini 2.5 Pro context caching issues](https://www.reddit.com//r/GoogleGeminiAI/comments/1kmyret?utm_source=openai).

## Next Steps
- [ ] Update backend Dockerfile with CLI + system deps.
- [ ] Add entrypoint/helper script that copies creds from `/tmp/host-creds/*.json` into the in-container directories.
- [ ] Document container run command showing temporary credential mounts (e.g. `-v ~/.claude/.credentials.json:/tmp/host-creds/claude.json:ro`).
- [ ] Wire generator/worker code to call the CLIs instead of HTTP APIs. *Status:* Codex is already wired through `GeneratorWorkflowService`; Gemini/Claude remain optional fallbacks.
