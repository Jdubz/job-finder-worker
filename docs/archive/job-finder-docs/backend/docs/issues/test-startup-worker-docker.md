# TEST-STARTUP-WORKER — Python Worker Docker Startup Tests

- **Status**: To Do
- **Owner**: Worker A
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-backend, type-testing, dev-monitor
- **Estimated Effort**: 2-3 hours
- **Related**: Dev Monitor Integration (DEV-MONITOR-2)

## What This Issue Covers

Create automated tests to verify the Python worker Docker container (`docker compose -f docker-compose.dev.yml up`) starts reliably, runs the queue worker, and shuts down gracefully. These tests ensure the dev-monitor can reliably control the worker service.

## Context

The dev-monitor app will manage the Python worker Docker container as one of its controlled services. We need to guarantee that:

1. Docker Compose starts the container successfully
2. The worker process initializes and connects to services
3. Graceful shutdown works (`docker compose stop`)
4. Force kill works when needed (`docker compose kill`)
5. The container can be restarted without conflicts

## Tasks

### 1. Create Docker Startup Test Script

Create `scripts/test-docker-startup.sh`:

- [ ] Start Docker container (`docker compose -f docker-compose.dev.yml up -d`)
- [ ] Wait for container to be ready (max 30 seconds)
- [ ] Verify container is running (`docker compose ps`)
- [ ] Check container health status
- [ ] Verify worker logs show initialization
- [ ] Verify worker can connect to Firestore emulator
- [ ] Document exit codes (0 = success, 1 = failure)

### 2. Graceful Shutdown Test

Add to `scripts/test-docker-startup.sh`:

- [ ] Send graceful stop (`docker compose -f docker-compose.dev.yml stop`)
- [ ] Wait for container to stop (max 10 seconds)
- [ ] Verify container has stopped completely
- [ ] Verify no orphaned processes
- [ ] Test that restart works immediately after shutdown
- [ ] Document expected shutdown behavior

### 3. Force Kill Test

Add test case:

- [ ] Start container
- [ ] Send force kill (`docker compose -f docker-compose.dev.yml kill`)
- [ ] Verify immediate termination
- [ ] Verify container stops within 2 seconds
- [ ] Verify no zombie containers
- [ ] Document force kill behavior for dev-monitor

### 4. Port Conflict and Network Handling

Add test cases:

- [ ] Verify Docker network is created
- [ ] Test container restart with existing network
- [ ] Verify container can reach Firestore emulator (port 8080)
- [ ] Test when Firestore emulator is not running (expected failure)
- [ ] Document network requirements

### 5. Process Management Tests

Add test cases:

- [ ] Verify container ID tracking works
- [ ] Test multiple start attempts (should fail gracefully)
- [ ] Test rapid start/stop/restart cycles
- [ ] Verify logs are accessible (`docker compose logs`)
- [ ] Test cleanup of stopped containers

### 6. Integration with Makefile

- [ ] Add `make test-startup` target to Makefile
- [ ] Ensure test can run in CI environment
- [ ] Add cleanup commands for orphaned containers
- [ ] Document in README.md

### 7. Documentation

Create `docs/worker-startup.md`:

- [ ] Document expected startup time (<30s)
- [ ] Document Docker Compose configuration
- [ ] Document graceful shutdown behavior (`docker compose stop`)
- [ ] Document force kill behavior (`docker compose kill`)
- [ ] Document error scenarios and codes
- [ ] Document network and port requirements
- [ ] Document log access and debugging

## Acceptance Criteria

- [ ] `make test-startup` successfully verifies worker starts
- [ ] Test verifies Docker container is running and healthy
- [ ] Test verifies worker logs show successful initialization
- [ ] Test verifies graceful shutdown with `docker compose stop`
- [ ] Test verifies force kill with `docker compose kill`
- [ ] Test verifies restart works after shutdown
- [ ] Test can run in CI environment (with Docker available)
- [ ] Documentation includes all expected behaviors
- [ ] Exit codes are clearly defined (0 = success, non-zero = failure)

## Test Success Criteria

The test script should:

- **Start**: Container starts within 30 seconds
- **Health**: Container status is "running"
- **Logs**: Worker logs show successful initialization
- **Shutdown**: Container stops within 10 seconds of `stop` command
- **Force Kill**: Container stops within 2 seconds of `kill` command
- **Restart**: Can restart immediately without conflicts

## Expected Behaviors for Dev-Monitor

### Normal Startup

```bash
docker compose -f docker-compose.dev.yml up -d
# Expected: Container starts in detached mode
# Expected: Worker initializes within 30 seconds
# Expected: Logs show connection to Firestore
# Expected: Container status: "running"
```

### Check Status

```bash
docker compose -f docker-compose.dev.yml ps
# Expected: Shows container status (running/exited)
# Expected: Shows uptime and health
```

### View Logs

```bash
docker compose -f docker-compose.dev.yml logs -f
# Expected: Streams worker logs in real-time
# Expected: Shows initialization and queue processing
```

### Graceful Shutdown

```bash
docker compose -f docker-compose.dev.yml stop
# Expected: Sends SIGTERM to worker process
# Expected: Worker finishes current task (if any)
# Expected: Container stops within 10 seconds
# Expected: No data loss
```

### Force Kill (if graceful fails)

```bash
docker compose -f docker-compose.dev.yml kill
# Expected: Sends SIGKILL to worker process
# Expected: Immediate termination within 2 seconds
# Expected: May interrupt current task
```

### Restart

```bash
docker compose -f docker-compose.dev.yml restart
# Expected: Graceful stop followed by start
# Expected: Worker reconnects to services
# Expected: Queue processing resumes
```

### Cleanup

```bash
docker compose -f docker-compose.dev.yml down
# Expected: Stops and removes container
# Expected: Removes networks
# Expected: Volumes persist (unless -v flag used)
```

## Dependencies

- Docker and Docker Compose must be installed
- Firestore emulator should be running (for full integration test)
- Environment variables configured in `.env` file

## Notes

- Worker runs in Docker container for isolation
- Use `docker compose stop` for graceful shutdown (preserves data)
- Use `docker compose kill` only when stop hangs or fails
- Container logs are essential for debugging
- Dev-monitor should use detached mode (`-d` flag)
- Test both with and without Firestore emulator running
- Document expected behavior when dependencies are unavailable
- Worker should have reasonable startup timeout (30s)
- Graceful shutdown timeout should be 10s before force kill
