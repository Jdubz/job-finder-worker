# PM2 Implementation Guide

This is the detailed implementation guide for Option 1: PM2 + Web Dashboard (Recommended).

## Prerequisites

- Node.js installed
- npm or yarn package manager
- All project repositories cloned

## Installation

### Step 1: Install PM2 Globally

```bash
npm install -g pm2

# Verify installation
pm2 --version
```

### Step 2: Install PM2 Log Rotation Module

```bash
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## Configuration

### Create `ecosystem.config.js`

Place this file in the root of `job-finder-app-manager`:

```javascript
module.exports = {
  apps: [
    {
      name: "firebase-emulators",
      cwd: "./job-finder-FE",
      script: "firebase",
      args: "emulators:start",
      interpreter: "none",
      autorestart: false, // Don't auto-restart emulators
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
        FIRESTORE_EMULATOR_HOST: "localhost:8080",
        FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
        FIREBASE_STORAGE_EMULATOR_HOST: "localhost:9199",
      },
      error_file: "./logs/emulators-error.log",
      out_file: "./logs/emulators-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      kill_timeout: 5000,
    },
    {
      name: "frontend",
      cwd: "./job-finder-FE",
      script: "npm",
      args: "run dev",
      interpreter: "none",
      autorestart: true,
      watch: ["src", "public"],
      ignore_watch: ["node_modules", "dist"],
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "development",
        VITE_USE_EMULATORS: "true",
        PORT: "5173",
      },
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
    {
      name: "backend",
      cwd: "./job-finder-BE",
      script: "npm",
      args: "run serve",
      interpreter: "none",
      autorestart: true,
      watch: ["functions/src", "functions/dist"],
      ignore_watch: ["node_modules"],
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "development",
        FUNCTIONS_EMULATOR_HOST: "localhost:5001",
      },
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
    {
      name: "worker",
      cwd: "./job-finder-worker",
      script: "python3",
      args: "-m src.main",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        PYTHONUNBUFFERED: "1",
        ENVIRONMENT: "development",
        USE_EMULATORS: "true",
      },
      error_file: "./logs/worker-error.log",
      out_file: "./logs/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
```

### Create `logs/` Directory

```bash
mkdir -p logs
echo "logs/" >> .gitignore
```

## Makefile Integration

Add these commands to your `Makefile`:

```makefile
# === PM2 Development Stack Commands ===

dev-pm2: ## Start dev stack with PM2 (includes web dashboard)
	@echo "🚀 Starting Job Finder Dev Stack with PM2..."
	@echo ""
	pm2 start ecosystem.config.js
	@sleep 3
	@echo ""
	@echo "✅ All services started!"
	@echo ""
	@echo "📊 PM2 Web Dashboard: http://localhost:9615"
	@echo "💻 PM2 Terminal Monitor: pm2 monit"
	@echo "📝 View Logs: pm2 logs"
	@echo "📊 Status: pm2 status"
	@echo ""
	@echo "Services:"
	@echo "  - Firebase Emulators UI: http://localhost:4000"
	@echo "  - Frontend: http://localhost:5173"
	@echo "  - Backend Functions: http://localhost:5001"
	@echo ""
	pm2 web &
	@echo ""
	@echo "Press 'make dev-pm2-monit' to open terminal monitor"

dev-pm2-monit: ## Open PM2 terminal monitor (interactive)
	@echo "💻 Opening PM2 Terminal Monitor..."
	@echo "Press Ctrl+C to exit monitor"
	pm2 monit

dev-pm2-logs: ## View all PM2 logs (streaming)
	@echo "📝 Streaming logs from all services..."
	@echo "Press Ctrl+C to stop"
	pm2 logs

dev-pm2-logs-specific: ## View logs for specific service (usage: make dev-pm2-logs-specific SERVICE=frontend)
	@if [ -z "$(SERVICE)" ]; then \
		echo "❌ Please specify SERVICE. Example: make dev-pm2-logs-specific SERVICE=frontend"; \
		echo "Available services: firebase-emulators, frontend, backend, worker"; \
		exit 1; \
	fi
	pm2 logs $(SERVICE)

dev-pm2-stop: ## Stop all PM2 services
	@echo "🛑 Stopping all PM2 services..."
	pm2 stop all
	pm2 kill
	@echo "✅ All services stopped"

dev-pm2-restart: ## Restart all PM2 services
	@echo "🔄 Restarting all PM2 services..."
	pm2 restart all
	@echo "✅ All services restarted"

dev-pm2-restart-specific: ## Restart specific service (usage: make dev-pm2-restart-specific SERVICE=frontend)
	@if [ -z "$(SERVICE)" ]; then \
		echo "❌ Please specify SERVICE. Example: make dev-pm2-restart-specific SERVICE=frontend"; \
		echo "Available services: firebase-emulators, frontend, backend, worker"; \
		exit 1; \
	fi
	@echo "🔄 Restarting $(SERVICE)..."
	pm2 restart $(SERVICE)
	@echo "✅ $(SERVICE) restarted"

dev-pm2-status: ## Show PM2 status table
	@echo "📊 PM2 Services Status:"
	@echo ""
	pm2 status

dev-pm2-flush: ## Flush all PM2 logs
	@echo "🗑️  Flushing all PM2 logs..."
	pm2 flush
	@echo "✅ Logs flushed"

dev-pm2-reset: ## Reset PM2 (stop all, delete all, restart daemon)
	@echo "🔄 Resetting PM2..."
	pm2 kill
	rm -rf logs/*
	@echo "✅ PM2 reset complete"

dev-pm2-save: ## Save current PM2 process list (auto-restart on reboot)
	@echo "💾 Saving PM2 process list..."
	pm2 save
	@echo "✅ Process list saved"

dev-pm2-web: ## Open PM2 web dashboard in browser
	@echo "🌐 Opening PM2 Web Dashboard..."
	pm2 web
	@sleep 2
	xdg-open http://localhost:9615 2>/dev/null || open http://localhost:9615 2>/dev/null || echo "Open http://localhost:9615 in your browser"

dev-pm2-describe: ## Describe specific service (usage: make dev-pm2-describe SERVICE=frontend)
	@if [ -z "$(SERVICE)" ]; then \
		echo "❌ Please specify SERVICE. Example: make dev-pm2-describe SERVICE=frontend"; \
		echo "Available services: firebase-emulators, frontend, backend, worker"; \
		exit 1; \
	fi
	pm2 describe $(SERVICE)
```

## Usage Guide

### Starting the Stack

```bash
# Start everything with PM2
make dev-pm2
```

This will:

1. Start all services in the background
2. Launch the web dashboard at http://localhost:9615
3. Display service URLs

### Monitoring Services

**Web Dashboard:**

```bash
# Open web dashboard
make dev-pm2-web
# or manually visit: http://localhost:9615
```

**Terminal Monitor:**

```bash
# Interactive terminal monitor
make dev-pm2-monit
```

**Status Table:**

```bash
# Quick status check
make dev-pm2-status
```

### Viewing Logs

**All Services:**

```bash
# Stream all logs
make dev-pm2-logs
```

**Specific Service:**

```bash
# View frontend logs only
make dev-pm2-logs-specific SERVICE=frontend

# View backend logs only
make dev-pm2-logs-specific SERVICE=backend

# View worker logs only
make dev-pm2-logs-specific SERVICE=worker

# View emulator logs only
make dev-pm2-logs-specific SERVICE=firebase-emulators
```

**Log Files:**
Logs are also saved to `./logs/` directory:

- `frontend-error.log` / `frontend-out.log`
- `backend-error.log` / `backend-out.log`
- `worker-error.log` / `worker-out.log`
- `emulators-error.log` / `emulators-out.log`

### Restarting Services

**All Services:**

```bash
# Restart everything
make dev-pm2-restart
```

**Specific Service:**

```bash
# Restart just the frontend
make dev-pm2-restart-specific SERVICE=frontend

# Restart just the backend
make dev-pm2-restart-specific SERVICE=backend
```

### Stopping Services

```bash
# Stop all services
make dev-pm2-stop
```

### Getting Service Details

```bash
# Get detailed info about a service
make dev-pm2-describe SERVICE=frontend
```

## PM2 Web Dashboard Features

Access at http://localhost:9615

### Available Views

1. **Process List**
   - All running services
   - CPU and memory usage
   - Uptime
   - Status (online/stopped/errored)

2. **Logs**
   - Real-time log streaming
   - Filter by service
   - Search functionality

3. **Monitoring**
   - CPU usage graphs
   - Memory usage graphs
   - Event loop latency (Node.js only)

4. **Actions**
   - Start/Stop/Restart buttons
   - Delete process
   - View detailed info

## PM2 Terminal Monitor

Access with `make dev-pm2-monit`

### Features

- Real-time resource monitoring
- Log streaming
- Process status
- Custom metrics (if configured)

### Keyboard Shortcuts

- `←` `→` - Switch between processes
- `↑` `↓` - Scroll logs
- `Ctrl+C` - Exit monitor

## Troubleshooting

### Issue: Port already in use

```bash
# Kill PM2 and all processes
make dev-pm2-stop

# Check for lingering processes
make status

# Force kill if needed
make kill-all

# Restart PM2
make dev-pm2
```

### Issue: Service won't start

```bash
# Check service details
make dev-pm2-describe SERVICE=<service-name>

# View error logs
make dev-pm2-logs-specific SERVICE=<service-name>

# Restart specific service
make dev-pm2-restart-specific SERVICE=<service-name>
```

### Issue: PM2 daemon not responding

```bash
# Reset PM2 completely
make dev-pm2-reset

# Restart from scratch
make dev-pm2
```

### Issue: Logs not showing

```bash
# Flush and restart logging
make dev-pm2-flush
make dev-pm2-restart
```

## Advanced Configuration

### Auto-start on System Boot

To automatically start services when your machine boots:

```bash
# Generate startup script
pm2 startup

# Save current process list
make dev-pm2-save

# Now services will auto-start on boot
```

To disable:

```bash
pm2 unstartup
```

### Custom Environment Variables

Edit `ecosystem.config.js` and add to the `env` section:

```javascript
env: {
  NODE_ENV: 'development',
  CUSTOM_VAR: 'value',
  API_KEY: process.env.API_KEY // Use system env vars
}
```

### Watch Mode Configuration

To enable file watching for auto-restart:

```javascript
{
  watch: true,
  watch_delay: 1000,
  ignore_watch: ['node_modules', 'logs', 'dist'],
  watch_options: {
    followSymlinks: false
  }
}
```

### Memory Limits

Automatically restart services if memory exceeds limit:

```javascript
{
  max_memory_restart: "300M"; // Restart if exceeds 300MB
}
```

## Best Practices

1. **Always use `make dev-pm2-stop` before switching to other dev modes**

   ```bash
   make dev-pm2-stop
   make dev-stack  # Safe to switch
   ```

2. **Check status regularly**

   ```bash
   make dev-pm2-status
   ```

3. **Monitor resource usage**

   ```bash
   make dev-pm2-monit
   ```

4. **Flush logs periodically**

   ```bash
   make dev-pm2-flush
   ```

5. **Save process list after changes**
   ```bash
   make dev-pm2-save
   ```

## Integration with Existing Commands

The PM2 setup **complements** existing commands:

- `make dev-stack` - Original parallel execution (no PM2)
- `make dev-pm2` - New PM2-managed execution with UI

You can use whichever fits your workflow better!

## Performance Comparison

| Metric              | `make dev-stack` | `make dev-pm2`         |
| ------------------- | ---------------- | ---------------------- |
| Startup Time        | ~8 seconds       | ~10 seconds            |
| Memory Overhead     | None             | ~50MB (PM2 daemon)     |
| Log Management      | Terminal only    | Web + Terminal + Files |
| Auto-restart        | No               | Yes                    |
| Process Control     | Manual           | Web UI + CLI           |
| Resource Monitoring | No               | Yes                    |

## Next Steps

1. Install PM2: `npm install -g pm2`
2. Create `ecosystem.config.js` (copy from above)
3. Add Makefile commands (copy from above)
4. Test: `make dev-pm2`
5. Explore web dashboard: http://localhost:9615
6. Share with team and gather feedback

## Support

- PM2 Documentation: https://pm2.keymetrics.io/docs/
- PM2 GitHub: https://github.com/Unitech/pm2
- PM2 Cheatsheet: https://pm2.keymetrics.io/docs/usage/quick-start/
