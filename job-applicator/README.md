# Job Applicator

Electron application for automated job application form filling and job listing extraction.

## Features

- **Job Extraction**: Extract job details from web pages using Gemini API
- **Form Filling**: AI-powered form filling using Claude CLI with MCP tools
- **Document Management**: Generate and upload resumes and cover letters
- **Job Queue Integration**: Submit jobs to the backend processing queue

## Prerequisites

1. **Gemini Authentication** (choose one):
   - **Option A (Simple):** Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - **Option B (Production):** Use Google Cloud Project with Application Default Credentials
2. **Node.js**: Version 18 or higher
3. **Backend API**: Running job-finder backend server

## Setup

1. Copy `.env.example` to `.env` (or use production env file):
   ```bash
   cp .env.example .env
   ```

2. Configure Gemini authentication (choose one method):

   **Method A: API Key (Recommended for development)**
   ```bash
   GEMINI_API_KEY=your-api-key-here
   ```

   **Method B: Vertex AI (Production, uses existing GCP setup)**
   ```bash
   GOOGLE_CLOUD_PROJECT=your-gcp-project-id
   GOOGLE_CLOUD_LOCATION=us-central1
   ```

3. Configure the backend API URL:
   ```bash
   JOB_FINDER_API_URL=http://localhost:3000/api
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build the application
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key from AI Studio |
| `GEMINI_DEFAULT_MODEL` | No | `gemini-2.0-flash-exp` | Model to use for job extraction |
| `JOB_FINDER_API_URL` | No | `http://localhost:3000/api` | Backend API URL |
| `JOB_FINDER_SKIP_AUTH` | No | `false` | Skip authentication (for local dev) |
| `GENERATOR_ARTIFACTS_DIR` | No | `/srv/job-finder/artifacts` | Local path for document artifacts |

## Usage

### Job Extraction

1. Navigate to a job listing page (LinkedIn, Indeed, etc.)
2. Click "Submit Job"
3. The app uses Gemini API to extract job details
4. Job is submitted to the backend queue for processing

### Form Filling

1. Select a job match from the sidebar
2. Generate or select documents (resume/cover letter)
3. Start an agent session
4. Click "Fill Form" to automatically fill the application form

## Architecture

- **Main Process**: Electron main process handles IPC, file operations, and API calls
- **Renderer Process**: UI built with vanilla TypeScript/HTML/CSS
- **MCP Server**: Model Context Protocol server for browser automation tools
- **Gemini Provider**: API client for job extraction using Google Gemini

## Migration from Claude CLI

This application previously used Claude CLI for job extraction. As of 2026-01-26, it has been migrated to use the Gemini API exclusively for job extraction. Form filling still uses Claude CLI via MCP server.

Benefits of the migration:
- Faster extraction (no CLI spawn overhead)
- Consistent with backend worker
- Simpler deployment (API key vs CLI installation)
- Better error handling and rate limiting

## Troubleshooting

### "GEMINI_API_KEY is required" error
- Either set `GEMINI_API_KEY` in your `.env` file, OR
- Set `GOOGLE_CLOUD_PROJECT` to use Vertex AI authentication
- Check that the API key is valid and has quota available (if using API key)
- Ensure Application Default Credentials are configured (if using Vertex AI)

### Job extraction fails
- Check the browser console for detailed error messages
- Verify the page has loaded completely before clicking "Submit Job"
- Ensure the page contains actual job listing content (>100 chars)

### Form filling not working
- Ensure Claude CLI is installed and accessible in your PATH
- Check that the MCP server is running (it starts automatically)
- Review logs in `logs/` directory for detailed error messages

## License

See LICENSE file in the root of the repository.
