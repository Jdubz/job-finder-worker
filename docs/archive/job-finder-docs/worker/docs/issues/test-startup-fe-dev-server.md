# TEST-STARTUP-FE — Frontend Dev Server Startup Tests

- **Status**: To Do
- **Owner**: Worker B
- **Priority**: P2 (Medium)
- **Labels**: priority-p2, repository-frontend, type-testing, dev-monitor
- **Estimated Effort**: 2-3 hours
- **Related**: Dev Monitor Integration (DEV-MONITOR-2)

## What This Issue Covers

Create automated tests to verify the frontend dev server (`npm run dev`) starts reliably, runs on the expected port, and shuts down gracefully. These tests ensure the dev-monitor can reliably control the frontend service.

## Context

The dev-monitor app will manage the frontend dev server as one of its controlled services. We need to guarantee that:

1. The startup command works consistently
2. The server runs on the expected port (5173)
3. Graceful shutdown works without hanging processes
4. The process can be restarted without conflicts

## Tasks

### 1. Create Startup Test Script

Create `scripts/test-startup.sh`:

- [ ] Start dev server in background (`npm run dev &`)
- [ ] Wait for server to be ready (max 30 seconds)
- [ ] Verify server responds on `http://localhost:5173`
- [ ] Check process is running with expected PID
- [ ] Test health endpoint or index.html loads
- [ ] Document exit codes (0 = success, 1 = failure)

### 2. Create Graceful Shutdown Test

Add to `scripts/test-startup.sh`:

- [ ] Send SIGTERM to dev server process
- [ ] Wait for process to exit (max 10 seconds)
- [ ] Verify process has fully stopped (no zombie processes)
- [ ] Verify port 5173 is released
- [ ] Test that restart works immediately after shutdown
- [ ] Document expected shutdown behavior

### 3. Port Conflict Handling

Add test case:

- [ ] Attempt to start dev server when port 5173 is occupied
- [ ] Verify appropriate error message is shown
- [ ] Verify process exits cleanly (no hanging)
- [ ] Document expected error behavior for dev-monitor

### 4. Process Management Tests

Add test cases:

- [ ] Verify PID file or process tracking works
- [ ] Test killing orphaned processes
- [ ] Verify multiple starts don't create zombie processes
- [ ] Test rapid start/stop/restart cycles

### 5. Integration with package.json

- [ ] Add `npm run test:startup` script to package.json
- [ ] Ensure test can run in CI environment
- [ ] Add to pre-push hooks (optional)
- [ ] Document in README.md

### 6. Documentation

Create `docs/dev-server-startup.md`:

- [ ] Document expected startup time (<30s)
- [ ] Document port configuration (5173)
- [ ] Document graceful shutdown behavior (SIGTERM)
- [ ] Document error scenarios and codes
- [ ] Document restart behavior
- [ ] Document environment requirements

## Acceptance Criteria

- [ ] `npm run test:startup` successfully verifies dev server starts
- [ ] Test verifies server responds on http://localhost:5173
- [ ] Test verifies graceful shutdown with SIGTERM
- [ ] Test verifies port is released after shutdown
- [ ] Test handles port conflict scenario appropriately
- [ ] Test can run in CI environment
- [ ] Documentation includes all expected behaviors
- [ ] Exit codes are clearly defined (0 = success, non-zero = failure)

## Test Success Criteria

The test script should:

- **Start**: Dev server starts within 30 seconds
- **Health**: HTTP GET to `http://localhost:5173` returns 200
- **Shutdown**: Process stops within 10 seconds of SIGTERM
- **Port Release**: Port 5173 is available immediately after shutdown
- **Restart**: Can restart immediately without conflicts

## Expected Behaviors for Dev-Monitor

### Normal Startup

```bash
npm run dev
# Expected: Vite dev server starts on port 5173
# Expected: Process runs in foreground
# Expected: Logs output to stdout/stderr
```

### Graceful Shutdown

```bash
kill -SIGTERM <pid>
# Expected: Server stops within 10 seconds
# Expected: Port 5173 released
# Expected: No zombie processes
```

### Force Kill (if graceful fails)

```bash
kill -SIGKILL <pid>
# Expected: Immediate termination
# Expected: Port may take 1-2 seconds to release
```

## Dependencies

- None (can start immediately)

## Notes

- Vite dev server typically starts quickly (5-10 seconds)
- Port 5173 is Vite's default development port
- Process runs in foreground, dev-monitor will need to capture output
- Graceful shutdown should always work with SIGTERM
- This test will be used by dev-monitor to verify service health
