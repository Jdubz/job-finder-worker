> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Development Stack Quick Reference

## One-Line Start

```bash
make dev-stack
```

## All Commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `make dev-stack`     | 🚀 Start entire stack (all services) |
| `make dev-frontend`  | 🎨 Start frontend only               |
| `make dev-backend`   | ⚙️ Start backend only                |
| `make dev-worker`    | 🐍 Start worker only                 |
| `make dev-emulators` | 🔥 Start emulators only              |
| `make status`        | 📊 Check what's running              |
| `make kill-all`      | 🛑 Stop everything                   |

## Service URLs

| Service       | URL                   |
| ------------- | --------------------- |
| Frontend      | http://localhost:5173 |
| Firebase UI   | http://localhost:4000 |
| Auth Emulator | http://localhost:9099 |
| Firestore     | http://localhost:8080 |
| Functions     | http://localhost:5001 |

## Typical Usage

### Start Everything

```bash
make dev-stack
# Press Ctrl+C to stop
```

### Check Status

```bash
make status
```

### Clean Stop

```bash
make kill-all
```

## Ports Used

- **5173** - Vite dev server (Frontend)
- **5001** - Cloud Functions emulator
- **9099** - Auth emulator
- **8080** - Firestore emulator
- **4000** - Firebase emulator UI

## Common Issues

### Port in use?

```bash
make kill-all
make status  # Verify stopped
make dev-stack
```

### Services won't start?

Check prerequisites in [Development Stack Guide](./DEVELOPMENT_STACK.md)

### Need to restart one service?

```bash
make kill-all
make dev-emulators   # Just emulators
make dev-frontend    # Just frontend
# etc.
```

## Full Documentation

See [DEVELOPMENT_STACK.md](./DEVELOPMENT_STACK.md) for complete guide.
