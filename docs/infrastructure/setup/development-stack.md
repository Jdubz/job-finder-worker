> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Development Stack Guide

Complete guide for running the Job Finder development environment locally.

## Quick Start

Start the development stack using Docker Compose:

```bash
# From repository root
make dev
```

Or start individual services:

```bash
make dev-api      # Start API server
make dev-frontend # Start frontend dev server
make dev-worker   # Start worker in Docker
```

## Service Endpoints

| Service  | URL                   | Purpose                 |
|----------|----------------------|-------------------------|
| Frontend | http://localhost:5173 | React application (Vite)|
| API      | http://localhost:8080 | Express backend API     |
| Worker   | (background)          | Job processing          |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (localhost:5173)                │
│                   Frontend React Application                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Express API        │
              │   (localhost:8080)   │
              │   - REST endpoints   │
              │   - Authentication   │
              │   - Business logic   │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   SQLite Database    │
              │   (./data/sqlite/)   │
              └──────────────────────┘
                         ▲
                         │
              ┌──────────────────────┐
              │   Python Worker      │
              │   (Docker container) │
              │   - Job scraping     │
              │   - Queue processing │
              │   - AI matching      │
              └──────────────────────┘
```

## Individual Commands

### Start Entire Stack

```bash
make dev
```

Starts all services: API, frontend, and worker.

### Start API Only

```bash
make dev-api
```

Runs the Express API server on port 8080.

### Start Frontend Only

```bash
make dev-frontend
```

Runs the React/Vite dev server on port 5173.

### Start Worker Only

```bash
make dev-worker
```

Runs the Python worker in a Docker container.

### Check Status

```bash
make status
```

Shows which services are currently running.

### Stop All Services

```bash
make stop
```

Stops all development processes.

## Prerequisites

### 1. Install Dependencies

**API (Backend):**

```bash
cd job-finder-BE
npm install
```

**Frontend:**

```bash
cd job-finder-FE
npm install
```

**Worker:**

```bash
cd job-finder-worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Each service needs its own `.env` file:

**API (`job-finder-BE/.env`):**

```env
NODE_ENV=development
PORT=8080
SQLITE_PATH=../data/sqlite/jobfinder.db
GOOGLE_CLIENT_ID=your-google-client-id
ANTHROPIC_API_KEY=your-api-key
```

**Frontend (`job-finder-FE/.env`):**

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

**Worker (`job-finder-worker/.env`):**

```env
ANTHROPIC_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key
SQLITE_PATH=/data/sqlite/jobfinder.db
```

### 3. Initialize Database

Run migrations to set up the SQLite database:

```bash
make migrate
```

Or manually:

```bash
cd infra/sqlite
./run-migrations.sh
```

## Development Workflow

### Typical Workflow

1. **Start the stack:**

   ```bash
   make dev
   ```

2. **Open services:**
   - Frontend: http://localhost:5173
   - API health: http://localhost:8080/api/healthz

3. **Make changes:**
   - Frontend changes hot-reload automatically (Vite HMR)
   - API changes require restart (or use `npm run dev` with nodemon)
   - Worker changes require container rebuild

4. **Stop when done:**
   ```bash
   make stop
   ```

### Focused Development

Working on just the frontend?

```bash
make dev-api       # Terminal 1 (or ensure API is running)
make dev-frontend  # Terminal 2
```

Working on just the API?

```bash
cd job-finder-BE
npm run dev
```

Working on the worker?

```bash
make dev-worker
# Or for direct Python execution:
cd job-finder-worker
source venv/bin/activate
python -m src.main
```

## Database Operations

### View Database

```bash
sqlite3 ./data/sqlite/jobfinder.db
```

### Run Migrations

```bash
make migrate
```

### Reset Database

```bash
rm ./data/sqlite/jobfinder.db
make migrate
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:

```bash
make stop
make status  # Verify all stopped
make dev
```

Or manually kill specific ports:

```bash
# Linux
fuser -k 5173/tcp   # Frontend
fuser -k 8080/tcp   # API

# macOS
lsof -ti:5173 | xargs kill -9
lsof -ti:8080 | xargs kill -9
```

### API Won't Start

1. Check Node.js is installed:
   ```bash
   node --version  # Should be 18+
   ```

2. Check dependencies installed:
   ```bash
   cd job-finder-BE && npm install
   ```

3. Check environment variables:
   ```bash
   cat job-finder-BE/.env
   ```

### Frontend Won't Connect to API

1. Verify API is running: http://localhost:8080/api/healthz
2. Check `VITE_API_BASE_URL` in frontend `.env`
3. Check browser console for CORS errors
4. Clear browser cache and reload

### Worker Docker Issues

1. Check Docker is running:
   ```bash
   docker info
   ```

2. Rebuild container:
   ```bash
   make dev-worker-rebuild
   ```

3. View worker logs:
   ```bash
   docker logs job-finder-worker
   ```

### Database Errors

1. Check database file exists:
   ```bash
   ls -la ./data/sqlite/
   ```

2. Run migrations:
   ```bash
   make migrate
   ```

3. Check file permissions:
   ```bash
   chmod 644 ./data/sqlite/jobfinder.db
   ```

## Development Tips

### Hot Reload

- **Frontend**: Changes auto-reload (Vite HMR)
- **API**: Use `npm run dev` for auto-restart on changes
- **Worker**: Requires container restart

### Debug Mode

**API:**
```bash
DEBUG=* npm run dev
```

**Frontend:**
```bash
# In job-finder-FE/.env
VITE_LOG_LEVEL=debug
```

**Worker:**
```bash
cd job-finder-worker
LOG_LEVEL=DEBUG python -m src.main
```

### Running Tests

```bash
# API tests
cd job-finder-BE && npm test

# Frontend tests
cd job-finder-FE && npm test

# Worker tests
cd job-finder-worker && pytest
```

## Resource Usage

Running the full stack requires approximately:

- ~200MB for API server
- ~200MB for frontend dev server
- ~500MB for worker Docker container
- **Total: ~900MB RAM**

## Ports Used

| Port | Service           |
|------|-------------------|
| 5173 | Vite dev server   |
| 8080 | Express API       |
