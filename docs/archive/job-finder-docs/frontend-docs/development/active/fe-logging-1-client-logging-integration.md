# FE-LOGGING-1 — Client Logging Integration with Dev-Monitor

## Issue Metadata

```yaml
Title: FE-LOGGING-1 — Client Logging Integration with Dev-Monitor
Labels: [priority-p1, repository-frontend, type-enhancement, status-todo]
Assignee: TBD
Priority: P1-High
Estimated Effort: 6-8 hours
Repository: job-finder-FE
GitHub Issue: TBD
```

## Summary

**ENHANCEMENT**: Implement client-side logging integration with the dev-monitor system, including WebSocket streaming for development and Google Cloud Logging for staging/production environments. This provides complete log visibility across all application layers.

## Background & Context

### Project Overview
**Application Name**: Job Finder Frontend Application  
**Technology Stack**: React 18, TypeScript, WebSocket, Google Cloud Logging  
**Architecture**: Frontend application with integrated logging for monitoring

### This Repository's Role
The job-finder-FE repository contains the React frontend application that needs to integrate with the dev-monitor logging system for complete application monitoring.

### Current State
The application currently:
- ❌ **No client logging**: Frontend logs are not captured or monitored
- ❌ **No dev-monitor integration**: No connection to centralized logging system
- ❌ **No cloud logging**: No production log capture for staging/production
- ❌ **Limited debugging**: No centralized log visibility for frontend issues

### Desired State
After completion:
- Frontend logs are captured and streamed to dev-monitor
- Staging and production logs are sent to Google Cloud Logging
- Complete log visibility for debugging and monitoring
- Unified logging across all application layers

## Technical Specifications

### Affected Files
```yaml
CREATE:
- src/utils/logging/clientLogger.ts - Client-side logging utility
- src/utils/logging/cloudLogger.ts - Google Cloud Logging client
- src/utils/logging/logStream.ts - WebSocket log streaming
- src/utils/logging/logTypes.ts - Log type definitions
- src/config/logging.ts - Logging configuration
- src/hooks/useLogging.ts - Custom hook for logging

MODIFY:
- src/main.tsx - Initialize client logging
- src/App.tsx - Add log streaming setup
- src/components/ErrorBoundary.tsx - Add error logging
- package.json - Add logging dependencies
- vite.config.ts - Add logging environment variables
```

### Technology Requirements
**Languages**: TypeScript, JavaScript  
**Frameworks**: React 18, WebSocket, Google Cloud Logging  
**Tools**: @google-cloud/logging, ws, React Context API  
**Dependencies**: Existing React application, dev-monitor WebSocket server

### Code Standards
**Naming Conventions**: Follow existing utility naming patterns  
**File Organization**: Place logging utilities in `src/utils/logging/`  
**Import Style**: Use existing import patterns

## Implementation Details

### Step-by-Step Tasks

1. **Create Client Logging Infrastructure**
   - Implement `clientLogger.ts` with different log levels (info, warn, error, debug)
   - Add log formatting and metadata handling
   - Implement log buffering for performance
   - Add environment-specific logging configuration

2. **Implement WebSocket Log Streaming**
   - Create `logStream.ts` for WebSocket connection to dev-monitor
   - Implement real-time log streaming with retry logic
   - Add connection lifecycle management
   - Handle network issues and reconnection

3. **Add Google Cloud Logging Integration**
   - Implement `cloudLogger.ts` for Google Cloud Logging
   - Configure staging and production log forwarding
   - Add log filtering and aggregation
   - Implement log retention and archival

4. **Create React Integration**
   - Create `useLogging.ts` custom hook for components
   - Add logging to error boundaries and error handlers
   - Implement user interaction logging
   - Add performance and timing logs

5. **Update Application Configuration**
   - Add logging configuration to environment variables
   - Update build process for logging dependencies
   - Add logging initialization to application startup
   - Configure logging levels for different environments

### Architecture Decisions

**Why this approach:**
- WebSocket for real-time development logging
- Google Cloud Logging for production scalability
- React hooks for clean component integration
- Environment-specific configuration

**Alternatives considered:**
- HTTP polling: Less efficient, higher latency
- File-based logging: No real-time capabilities
- External logging service: Additional complexity and cost

### Dependencies & Integration

**Internal Dependencies:**
- Depends on: Existing React application, dev-monitor WebSocket server
- Consumed by: All React components that need logging

**External Dependencies:**
- APIs: WebSocket API, Google Cloud Logging API
- Services: Dev-monitor WebSocket server, Google Cloud Platform

## Testing Requirements

### Test Coverage Required

**Unit Tests:**
```typescript
describe('ClientLogger', () => {
  it('should log messages with correct formatting', () => {
    // Test log formatting and metadata
  });

  it('should stream logs via WebSocket', () => {
    // Test WebSocket log streaming
  });
});
```

**Integration Tests:**
- Test WebSocket connection to dev-monitor
- Test Google Cloud Logging integration
- Test logging in different environments

**Manual Testing Checklist**
- [ ] Logs are captured and streamed to dev-monitor
- [ ] Google Cloud Logging works in staging/production
- [ ] Log levels work correctly (info, warn, error, debug)
- [ ] WebSocket connection handles network issues
- [ ] Performance impact is minimal

### Test Data

**Sample logging scenarios:**
- User interactions and events
- API call logs and responses
- Error logs and stack traces
- Performance metrics and timing

## Acceptance Criteria

- [ ] Client logging is implemented with multiple log levels
- [ ] WebSocket streaming to dev-monitor works in development
- [ ] Google Cloud Logging integration works for staging/production
- [ ] Logs are properly formatted and include metadata
- [ ] Performance impact is minimal on application
- [ ] Error boundaries and handlers include logging
- [ ] Documentation is updated with logging setup

## Environment Setup

### Prerequisites
```bash
# Required tools and versions
Node.js: v18+
npm: v9+
Google Cloud SDK: latest
WebSocket: ws library
```

### Repository Setup
```bash
# Clone frontend repository
git clone https://github.com/Jdubz/job-finder-FE.git
cd job-finder-FE

# Install dependencies
npm install

# Environment variables needed
cp .env.example .env
# Configure logging and Google Cloud credentials
```

### Running Locally
```bash
# Start frontend with logging enabled
npm run dev:with-logging

# Test log streaming
npm run test:logging

# Check Google Cloud integration
npm run test:cloud-logging
```

## Code Examples & Patterns

### Example Implementation

**Client logging utility:**
```typescript
export class ClientLogger {
  private ws: WebSocket;
  private cloudLogger: CloudLogger;
  private buffer: LogEntry[] = [];

  constructor() {
    this.ws = new WebSocket(process.env.VITE_DEV_MONITOR_WS_URL);
    this.cloudLogger = new CloudLogger();
    this.setupWebSocket();
  }

  log(level: LogLevel, message: string, metadata?: any) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      source: 'frontend',
      userId: this.getCurrentUserId()
    };

    // Stream to dev-monitor in development
    if (process.env.NODE_ENV === 'development') {
      this.ws.send(JSON.stringify(logEntry));
    }

    // Send to Google Cloud in staging/production
    if (['staging', 'production'].includes(process.env.NODE_ENV)) {
      this.cloudLogger.log(logEntry);
    }
  }
}
```

## Security & Performance Considerations

### Security
- [ ] No sensitive data in frontend logs
- [ ] Secure WebSocket connection (WSS in production)
- [ ] Proper Google Cloud credentials management
- [ ] Log data sanitization

### Performance
- [ ] Logging adds <2ms overhead per log entry
- [ ] Efficient WebSocket message handling
- [ ] Minimal impact on application performance
- [ ] Proper log buffering and batching

### Error Handling
```typescript
// Proper error handling for logging
try {
  this.ws.send(JSON.stringify(logEntry));
} catch (error) {
  console.error('Failed to send log to dev-monitor:', error);
  // Continue operation without logging
}
```

## Documentation Requirements

### Code Documentation
- [ ] All logging utilities have JSDoc comments
- [ ] Custom hooks are documented with usage examples
- [ ] Google Cloud integration is documented

### README Updates
Update repository README.md with:
- [ ] Client logging setup instructions
- [ ] Google Cloud Logging configuration
- [ ] Logging troubleshooting guide

## Commit Message Requirements

All commits for this issue must use **semantic commit structure**:

```
feat(logging): implement client logging integration with dev-monitor

Add client-side logging with WebSocket streaming for development
and Google Cloud Logging for staging/production. Includes React
hooks, error boundary integration, and environment-specific config.

Closes #[issue-number]
```

### Commit Types
- `feat:` - New feature (client logging integration)

## PR Checklist

When submitting the PR for this issue:

- [ ] PR title matches issue title
- [ ] PR description references issue: `Closes #[issue-number]`
- [ ] All acceptance criteria met
- [ ] All tests pass locally
- [ ] No linter errors or warnings
- [ ] Code follows project style guide
- [ ] Self-review completed

## Timeline & Milestones

**Estimated Effort**: 6-8 hours  
**Target Completion**: This week (important for complete log visibility)  
**Dependencies**: Dev-monitor WebSocket server, Google Cloud Platform setup  
**Blocks**: Full-stack log monitoring capabilities

## Success Metrics

How we'll measure success:

- **Completeness**: Frontend logs are now captured and monitored
- **Integration**: Seamless integration with dev-monitor system
- **Performance**: Minimal impact on application performance
- **Reliability**: Stable logging across all environments

## Rollback Plan

If this change causes issues:

1. **Immediate rollback**:
   ```bash
   # Disable client logging if causing performance issues
   git revert [commit-hash]
   ```

2. **Decision criteria**: If client logging causes significant performance degradation

## Questions & Clarifications

**If you need clarification during implementation:**

1. **Add a comment** to this issue with what's unclear
2. **Tag the PM** for guidance
3. **Don't assume** - always ask if requirements are ambiguous

## Issue Lifecycle

```
TODO → IN PROGRESS → REVIEW → DONE
```

**Update this issue**:
- When starting work: Add `status-in-progress` label
- When PR is ready: Add `status-review` label and PR link
- When merged: Add `status-done` label and close issue

**PR must reference this issue**:
- Use `Closes #[issue-number]` in PR description

---

**Created**: 2025-10-21  
**Created By**: PM  
**Priority Justification**: Critical for complete full-stack log monitoring and production logging  
**Last Updated**: 2025-10-21
