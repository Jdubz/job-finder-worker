# Firebase Emulator Startup Guide

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Overview

This guide covers automated testing to verify Firebase emulators (`npm run serve` or `firebase emulators:start`) start reliably, run on expected ports, persist data on graceful shutdown, and can be managed by the dev-monitor.

## Context

The dev-monitor app manages Firebase emulators as one of its controlled services. Emulators are critical because they:

1. Must persist data on graceful shutdown (SIGTERM)
2. Run multiple services on different ports
3. Can take 20-30 seconds to fully initialize
4. Require special handling to preserve emulator data

## Setup Procedures

### 1. Create Emulator Startup Test Script

Create `scripts/test-emulator-startup.sh`:

- Start emulators in background (`npm run serve &` or `firebase emulators:start &`)
- Wait for all emulators to be ready (max 60 seconds)
- Verify Auth emulator responds (port 9099)
- Verify Firestore emulator responds (port 8080)
- Verify Functions emulator responds (port 5001)
- Verify Emulator UI responds (port 4000)
- Check process is running with expected PID
- Document exit codes (0 = success, 1 = failure)

### 2. Data Persistence Test (CRITICAL)

Add to `scripts/test-emulator-startup.sh`:

- Start emulators with data export enabled
- Add test data to Firestore emulator
- Send SIGTERM to emulator process
- Wait for graceful shutdown (max 30 seconds)
- Verify emulator data was exported
- Restart emulators
- Verify test data was restored
- Document expected data persistence behavior

### 3. Graceful Shutdown Test

Add test case:

- Send SIGTERM to emulator process
- Verify all emulators stop gracefully (max 30 seconds)
- Verify all ports are released (9099, 8080, 5001, 4000)
- Verify no zombie processes remain
- Verify emulator data directory exists
- Document expected shutdown behavior

### 4. Port Conflict Handling

Add test cases:

- Attempt to start when ports are occupied
- Verify appropriate error messages
- Verify process exits cleanly
- Test partial startup (some ports available, some not)
- Document expected error behavior for dev-monitor

### 5. Process Management Tests

Add test cases:

- Verify PID tracking works
- Test killing orphaned emulator processes
- Verify multiple starts don't create conflicts
- Test rapid start/stop/restart cycles
- Test SIGKILL fallback (if SIGTERM hangs)

### 6. Integration with package.json

- Add `npm run test:startup:emulators` script to package.json
- Ensure test can run in CI environment (with timeout)
- Document in README.md
- Add cleanup script for orphaned processes

## Test Success Criteria

The test script should verify:

- **Start**: All emulators start within 60 seconds
- **Health**: All ports respond (9099, 8080, 5001, 4000)
- **Data Persistence**: Test data survives graceful shutdown/restart
- **Shutdown**: Process stops within 30 seconds of SIGTERM
- **Port Release**: All ports available immediately after shutdown
- **Restart**: Can restart immediately with data intact

## Expected Behaviors

### Normal Startup

```bash
firebase emulators:start
# Expected: All emulators start (Auth, Firestore, Functions, UI)
# Expected: Takes 20-60 seconds to fully initialize
# Expected: Ports: 9099 (Auth), 8080 (Firestore), 5001 (Functions), 4000 (UI)
# Expected: Logs output to stdout/stderr
```

### Graceful Shutdown (CRITICAL - Must preserve data)

```bash
kill -SIGTERM <pid>
# Expected: Emulators export data to disk
# Expected: All services stop within 30 seconds
# Expected: All ports released
# Expected: Data directory written to emulator-data/
# Expected: No zombie processes
```

### Force Kill (if graceful fails after timeout)

```bash
kill -SIGKILL <pid>
# Expected: Immediate termination
# Expected: Data may NOT be persisted (warn user)
# Expected: Ports may take 1-2 seconds to release
```

### Restart with Data

```bash
firebase emulators:start
# Expected: Imports data from previous session
# Expected: Firestore collections restored
# Expected: Auth users restored
```

## Emulator Ports

Document in tests and dev-monitor:

- **Auth**: 9099
- **Firestore**: 8080
- **Functions**: 5001
- **Emulator UI**: 4000

## Documentation

Create `docs/emulator-startup.md`:

- Document expected startup time (20-60s)
- Document all emulator ports (9099, 8080, 5001, 4000)
- Document graceful shutdown with data export
- Document data persistence directory
- Document error scenarios and codes
- Document restart behavior and timing
- Document force kill procedure (SIGKILL)

## Dependencies

None - emulators can start immediately.

## Notes

- **CRITICAL**: Graceful shutdown (SIGTERM) must allow data export
- Emulators take longer to start than other services (20-60s)
- Data persistence is essential for development workflow
- Multiple emulators run as single process
- Test in `job-finder-BE/` directory with proper firebase.json config
- Dev-monitor must allow 30s timeout for graceful shutdown
- If SIGTERM hangs >30s, dev-monitor should fallback to SIGKILL with warning
