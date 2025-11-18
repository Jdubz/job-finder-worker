# Simple Dev Stack UI - Revised Proposal

## The Reality Check

You're right - we don't need:

- ❌ File-based logging
- ❌ Production-grade process management
- ❌ Auto-restart on crash
- ❌ Log rotation
- ❌ Startup scripts

We just need:

- ✅ Start/stop all services
- ✅ View stdout logs from all services in one place
- ✅ Simple, lightweight solution

## The Simple Solution: Overmind

**Overmind** is a process manager built specifically for development. It's like tmux but dead simple.

### Features

- 🎯 **Single command start**: `overmind start`
- 📺 **TUI (Terminal UI)**: Built-in interface for viewing logs
- 🔄 **Easy restart**: Restart any service with one keystroke
- 📝 **Multiplexed output**: See all logs or filter by service
- 🚀 **Zero config complexity**: Just a simple Procfile
- ⚡ **Lightweight**: Pure terminal, no web server needed

### How It Works

**1. Install Overmind (one-time):**

```bash
# Linux
wget -qO- https://github.com/DarthSim/overmind/releases/latest/download/overmind-v2.4.0-linux-amd64.gz | gunzip > /usr/local/bin/overmind
chmod +x /usr/local/bin/overmind

# macOS
brew install overmind

# Or with Go
go install github.com/DarthSim/overmind/v2@latest
```

**2. Create `Procfile` in manager repo:**

```procfile
emulators: cd job-finder-FE && firebase emulators:start
frontend: sleep 8 && cd job-finder-FE && npm run dev
backend: sleep 11 && cd job-finder-BE && npm run serve
worker: sleep 14 && cd job-finder-worker && make run
```

**3. Add to Makefile:**

```makefile
dev-ui: ## Start dev stack with simple TUI
	overmind start

dev-ui-connect: ## Connect to running dev stack UI
	overmind connect

dev-ui-stop: ## Stop dev stack
	overmind quit

dev-ui-restart: ## Restart specific service (usage: make dev-ui-restart SERVICE=frontend)
	overmind restart $(SERVICE)
```

### Usage

**Start everything:**

```bash
make dev-ui
```

**View the TUI:**

- Shows all services in one terminal
- Use arrow keys or numbers to switch between services
- Press `Ctrl+B` then `?` for help
- Press `Ctrl+B` then `q` to quit

**Restart a service:**

```bash
# From another terminal
overmind restart frontend
# or
make dev-ui-restart SERVICE=frontend
```

**Stop everything:**

```bash
make dev-ui-stop
```

### Why This Is Better

**vs PM2:**

- ✅ No daemon process
- ✅ No web server
- ✅ No log files
- ✅ Just stdout in terminal
- ✅ 1/10th the complexity

**vs Custom UI:**

- ✅ No development needed
- ✅ No maintenance
- ✅ Battle-tested tool

**vs Plain tmux:**

- ✅ No manual layout config
- ✅ Built-in for development
- ✅ Simpler commands

---

## Even Simpler: Concurrently with TUI

If you don't want to install anything beyond npm packages:

### Install

```bash
npm install --save-dev concurrently
```

### Create `dev.config.js`

```javascript
module.exports = {
  prefix: "name",
  prefixColors: "auto",
  timestampFormat: "HH:mm:ss",
  commands: [
    {
      name: "emulators",
      command: "cd job-finder-FE && firebase emulators:start",
      color: "blue",
    },
    {
      name: "frontend",
      command: "sleep 8 && cd job-finder-FE && npm run dev",
      color: "cyan",
    },
    {
      name: "backend",
      command: "sleep 11 && cd job-finder-BE && npm run serve",
      color: "green",
    },
    {
      name: "worker",
      command: "sleep 14 && cd job-finder-worker && make run",
      color: "yellow",
    },
  ],
};
```

### Add to package.json

```json
{
  "scripts": {
    "dev:all": "concurrently --config dev.config.js"
  }
}
```

### Add to Makefile

```makefile
dev-ui: ## Start dev stack with colored output
	npm run dev:all

# Stop with Ctrl+C
```

### Features

- ✅ Colored output per service
- ✅ Prefixed logs (know which service)
- ✅ Timestamps
- ✅ All stdout in one terminal
- ✅ Stop with Ctrl+C

---

## The SIMPLEST: Just Better Make Commands

Honestly, if you want maximum simplicity, let's just improve what we have:

### Enhanced Makefile

```makefile
dev-ui: ## Start dev stack with simple monitoring
	@echo "🚀 Starting Job Finder Dev Stack..."
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@trap 'make kill-all' INT TERM; \
	( \
		cd job-finder-FE && firebase emulators:start 2>&1 | sed 's/^/[EMULATORS] /' & \
		sleep 8; \
		cd job-finder-FE && npm run dev 2>&1 | sed 's/^/[FRONTEND]  /' & \
		sleep 3; \
		cd job-finder-BE && npm run serve 2>&1 | sed 's/^/[BACKEND]   /' & \
		sleep 3; \
		cd job-finder-worker && make run 2>&1 | sed 's/^/[WORKER]    /' & \
		wait \
	)
```

This gives you:

- ✅ Prefixed logs: `[FRONTEND] Starting dev server...`
- ✅ All stdout in one terminal
- ✅ Color with service names
- ✅ Stop with Ctrl+C
- ✅ Zero external dependencies

---

## My Actual Recommendation: Concurrently

**Why:**

1. Already have Node.js/npm
2. Simple npm package (`npm install -D concurrently`)
3. Clean colored output with prefixes
4. Works exactly like you want
5. No daemon, no files, just stdout
6. Stop with Ctrl+C

**Implementation time:** 5 minutes

**What it looks like:**

```
[emulators] Firebase Emulators starting...
[frontend]  Vite dev server ready at http://localhost:5173
[backend]   Functions emulator listening on port 5001
[worker]    Job worker processing queue...
```

Want me to implement the Concurrently solution? It's the sweet spot for simplicity and functionality.
