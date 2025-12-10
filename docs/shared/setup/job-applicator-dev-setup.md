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
pnpm dev
```

## Testing

1. Start app: `pnpm dev`
2. Paste a job application URL
3. Navigate to the form, log in if needed
4. Click "Fill Form"
5. Review and submit manually

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JOB_FINDER_API_URL` | `http://localhost:3000/api` | Backend API URL |
| `CDP_PORT` | `9222` | Chrome DevTools Protocol port |

Set via prefix: `CDP_PORT=9223 JOB_FINDER_API_URL=http://localhost:8080/api pnpm dev`

## Troubleshooting

**CDP connection fails:**
- Ensure port is free: `lsof -i :9222`
- Or use different port: `CDP_PORT=9223 pnpm dev`

**CLI tool not found:**
- Verify tool is installed: `which claude` / `which codex` / `which gemini`
- Select a different tool from the dropdown
- Electron may need full path in spawn call

**Backend connection refused:**
- Start backend: `docker compose up -d` from job-finder root
