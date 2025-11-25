> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Development Stack Guide

Complete guide for running the Job Finder development environment locally.

## Quick Start

Start the entire development stack with one command:

```bash
make dev-stack
```

This starts all services in parallel:

- **Firebase Emulators** (Auth, Firestore, Functions, UI)
- **Frontend** (React/Vite dev server)
- **Backend** (Cloud Functions emulator)
- **Worker** (Python job processor)

Press `Ctrl+C` to stop all services.

## Service Endpoints

| Service            | URL                   | Purpose                             |
| ------------------ | --------------------- | ----------------------------------- |
| Frontend           | http://localhost:5173 | React application (Vite dev server) |
| Firebase UI        | http://localhost:4000 | Emulator UI dashboard               |
| Auth Emulator      | http://localhost:9099 | Firebase Authentication             |
| Firestore Emulator | http://localhost:8080 | Firestore database                  |
| Functions Emulator | http://localhost:5001 | Cloud Functions                     |

## Individual Commands

Run services individually for focused development:

### Start Entire Stack

```bash
make dev-stack
```

Starts all services in the correct order with proper delays.

### Start Frontend Only

```bash
make dev-frontend
```

Runs the React/TypeScript frontend on port 5173.

### Start Backend Only

```bash
make dev-backend
```

Runs Cloud Functions emulator on port 5001.

### Start Worker Only

```bash
make dev-worker
```

Runs the Python job processing worker.

### Start Emulators Only

```bash
make dev-emulators
```

Runs Firebase emulators (Auth, Firestore, Functions) without other services.

### Check Service Status

```bash
make status
```

Shows which services are currently running.

### Stop All Services

```bash
make kill-all
```

Stops all development processes and frees up ports.

## Prerequisites

Before running the dev stack, ensure you have:

### 1. Install Dependencies

**Manager Repo:**

```bash
npm install
```

**Frontend:**

```bash
cd job-finder-FE
npm install
```

**Backend:**

```bash
cd job-finder-BE
npm install
cd functions
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

Each repository needs its own `.env` file:

**Frontend (`job-finder-FE/.env`):**

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_USE_EMULATORS=true
```

**Backend (`job-finder-BE/.env`):**

```env
FIREBASE_PROJECT_ID=your-project-id
ANTHROPIC_API_KEY=your-api-key
```

**Worker (`job-finder-worker/.env`):**

```env
ANTHROPIC_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
```

### 3. Firebase Setup

Initialize Firebase in each repository:

```bash
firebase login
cd job-finder-FE && firebase use --add
cd job-finder-BE && firebase use --add
```

## Development Workflow

### Typical Workflow

1. **Start the stack:**

   ```bash
   make dev-stack
   ```

2. **Open services:**
   - Frontend: http://localhost:5173
   - Firebase UI: http://localhost:4000

3. **Make changes:**
   - Frontend changes hot-reload automatically
   - Backend functions require rebuild (automatic with watch mode)
   - Worker changes require restart

4. **Stop when done:**
   - Press `Ctrl+C` (if using `make dev-stack`)
   - Or run `make kill-all`

### Focused Development

Working on just the frontend?

```bash
make dev-emulators    # Terminal 1
make dev-frontend     # Terminal 2
```

Working on just the backend?

```bash
make dev-emulators    # Terminal 1
make dev-backend      # Terminal 2
```

Working on the worker?

```bash
make dev-emulators    # Terminal 1
make dev-worker       # Terminal 2
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (localhost:5173)                │
│                   Frontend React Application                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ├─────────────────────────────────────┐
                         │                                     │
                         ▼                                     ▼
              ┌──────────────────────┐          ┌──────────────────────┐
              │  Firebase Emulators  │          │   Cloud Functions    │
              │   (localhost:9099)   │          │   (localhost:5001)   │
              │  - Auth              │          │  - API Endpoints     │
              │  - Firestore (8080)  │◄─────────┤  - Business Logic    │
              │  - UI (4000)         │          │  - Data Processing   │
              └──────────┬───────────┘          └──────────────────────┘
                         │                                     ▲
                         │                                     │
                         │                                     │
                         ▼                                     │
              ┌──────────────────────┐                        │
              │   Python Worker      │────────────────────────┘
              │  - Job Scraping      │
              │  - Queue Processing  │
              │  - AI Matching       │
              └──────────────────────┘
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:

```bash
make kill-all
make status  # Verify all stopped
make dev-stack
```

Or manually kill specific ports:

```bash
# Linux
fuser -k 5173/tcp   # Frontend
fuser -k 5001/tcp   # Functions
fuser -k 9099/tcp   # Auth
fuser -k 8080/tcp   # Firestore
fuser -k 4000/tcp   # Firebase UI

# macOS
lsof -ti:5173 | xargs kill -9
```

### Firebase Emulators Won't Start

1. Check Firebase CLI is installed:

   ```bash
   firebase --version
   ```

2. Check you're logged in:

   ```bash
   firebase login
   ```

3. Check project is configured:
   ```bash
   cd job-finder-FE
   firebase projects:list
   ```

### Frontend Won't Connect to Emulators

1. Verify `VITE_USE_EMULATORS=true` in `job-finder-FE/.env`
2. Check emulators are running: `make status`
3. Check browser console for connection errors
4. Clear browser cache and reload

### Backend Functions Not Loading

1. Check TypeScript compiled successfully:

   ```bash
   cd job-finder-BE
   npm run build
   ```

2. Check for syntax errors in functions
3. Restart emulators: `make kill-all && make dev-emulators`

### Python Worker Issues

1. Check virtual environment is activated:

   ```bash
   cd job-finder-worker
   source venv/bin/activate
   ```

2. Check dependencies are installed:

   ```bash
   pip install -r requirements.txt
   ```

3. Check environment variables are set
4. Check Firestore emulator is accessible

### Services Keep Running After Ctrl+C

Run the cleanup command:

```bash
make kill-all
```

## Development Tips

### Hot Reload

- **Frontend**: Changes auto-reload (Vite HMR)
- **Backend**: Functions auto-rebuild with watch mode
- **Worker**: Requires manual restart

### Debug Mode

Enable verbose logging:

**Frontend:**

```bash
# In job-finder-FE/.env
VITE_LOG_LEVEL=debug
```

**Backend:**

```bash
# View function logs in Firebase UI
# http://localhost:4000/logs
```

**Worker:**

```bash
cd job-finder-worker
make run  # Already includes debug output
```

### Testing Against Real Firebase

To test against staging/production instead of emulators:

1. Set `VITE_USE_EMULATORS=false` in frontend `.env`
2. Use `firebase use staging` or `firebase use production`
3. Ensure proper credentials are configured

Warning: Be careful when testing against production!

## Performance Considerations

### Emulator Startup Time

Firebase emulators take ~8 seconds to initialize. The `dev-stack` command includes appropriate delays.

### Memory Usage

Running the full stack requires:

- ~500MB for Firebase emulators
- ~200MB for frontend dev server
- ~300MB for backend emulator
- ~150MB for Python worker
- **Total: ~1.2GB RAM**

### Port Usage

The stack uses 5 ports:

- 5173 (Frontend)
- 5001 (Functions)
- 9099 (Auth)
- 8080 (Firestore)
- 4000 (Firebase UI)
