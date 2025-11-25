> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Development Stack Quick Reference

## One-Line Start

```bash
make dev
```

## All Commands

| Command              | Description                     |
|---------------------|---------------------------------|
| `make dev`          | Start entire stack              |
| `make dev-api`      | Start API only                  |
| `make dev-frontend` | Start frontend only             |
| `make dev-worker`   | Start worker only               |
| `make status`       | Check what's running            |
| `make stop`         | Stop everything                 |
| `make migrate`      | Run database migrations         |
| `make test`         | Run all tests                   |

## Service URLs

| Service   | URL                   |
|-----------|-----------------------|
| Frontend  | http://localhost:5173 |
| API       | http://localhost:8080 |
| API Health| http://localhost:8080/api/healthz |

## Typical Usage

### Start Everything

```bash
make dev
# Press Ctrl+C to stop
```

### Check Status

```bash
make status
```

### Clean Stop

```bash
make stop
```

## Ports Used

| Port | Service           |
|------|-------------------|
| 5173 | Vite dev server   |
| 8080 | Express API       |

## Common Issues

### Port in use?

```bash
make stop
make status  # Verify stopped
make dev
```

### Database issues?

```bash
make migrate
```

### Need to restart one service?

```bash
make stop
make dev-api       # Just API
make dev-frontend  # Just frontend
```

## Full Documentation

See [development-stack.md](./development-stack.md) for complete guide.
