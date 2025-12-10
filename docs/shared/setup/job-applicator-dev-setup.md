> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-09

# Job Applicator Setup

## Prerequisites

- Node.js 20+
- At least one CLI tool authenticated:
  - Claude: `claude --version`
  - Codex: `codex --version`
  - Gemini: `gemini --version`
- job-finder backend running (`docker compose up -d`)

## Setup

```bash
cd job-applicator
pnpm install
pnpm start
```

## Testing

1. Start app: `pnpm start`
2. Paste a job application URL
3. Navigate to the form, log in if needed
4. Click "Fill Form"
5. Review and submit manually

## Troubleshooting

**CDP connection fails:**
- Ensure port 9222 is free: `lsof -i :9222`

**CLI tool not found:**
- Verify tool is installed: `which claude` / `which codex` / `which gemini`
- Select a different tool from the dropdown
- Electron may need full path in spawn call

**Backend connection refused:**
- Start backend: `docker compose up -d` from job-finder root
