# Monitoring and Alerting Setup Playbook

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

Monitoring and alerting setup for all job-finder services (frontend, backend API, worker). This playbook covers implementation patterns, dashboards, and alerting.

## Overview

**Purpose**: Implement monitoring and alerting to detect and respond to production issues proactively.

**Critical Risks Without Monitoring**:
- Silent failures in production
- Long mean time to detection (MTTD)
- Poor user experience from undetected issues
- No visibility into system health

## Monitoring Architecture

### Components

1. **Structured Logging** - JSON logs via Pino (API) and Python logging (Worker)
2. **Error Tracking (Sentry)** - Structured error reporting and analysis
3. **Health Checks** - Endpoint monitoring for availability
4. **Custom Metrics** - Business and application-specific metrics

### Services Monitored

- **Frontend**: React application (performance, errors)
- **Backend**: Express API (requests, latency, errors)
- **Worker**: Python application (job processing, queue metrics)

## Implementation

### 1. Health Check Endpoints

The Express API exposes health check endpoints:

```
GET /api/healthz  - Liveness check (is the service running?)
GET /api/readyz   - Readiness check (is the service ready to handle traffic?)
```

### 2. Error Tracking with Sentry

#### Frontend Integration

```typescript
// src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT,
  tracesSampleRate: 0.1,
});
```

**Install dependencies**:
```bash
npm install --save @sentry/react
```

#### Backend API Integration

```typescript
// src/index.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Error handler middleware
app.use((err, req, res, next) => {
  Sentry.captureException(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Install dependencies**:
```bash
npm install --save @sentry/node
```

#### Worker Integration

```python
# src/main.py
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv('SENTRY_DSN'),
    environment=os.getenv('ENVIRONMENT'),
    traces_sample_rate=0.1,
)
```

**Install dependencies**:
```bash
pip install sentry-sdk
```

### 3. Structured Logging

#### API (Pino)

The Express API uses Pino for structured JSON logging:

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Log with context
logger.info({ requestId, userId }, 'Processing request');
```

#### Worker (Python)

```python
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'message': record.getMessage(),
            'module': record.module,
        })

logger = logging.getLogger(__name__)
```

### 4. Docker Container Health Checks

In `docker-compose.yml`:

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  worker:
    healthcheck:
      test: ["CMD", "python", "-c", "import requests; requests.get('http://localhost:5000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Metrics to Track

### API Metrics

- **Request count**: Total requests by endpoint
- **Request latency**: P50, P95, P99 response times
- **Error rate**: 4xx and 5xx responses
- **Database query time**: SQLite query duration
- **Authentication failures**: Failed auth attempts

### Worker Metrics

- **Jobs processed**: Success/failure counts
- **Processing time**: Per job duration
- **Queue depth**: Pending jobs count
- **Error rate**: Processing failures
- **Throughput**: Jobs per minute/hour

### Frontend Metrics

- **Error rate**: JavaScript exceptions
- **Page load time**: P50, P95, P99
- **Core Web Vitals**: LCP, FID, CLS
- **API request latency**: Time to first byte

## Alerting Patterns

### Critical Alerts (Immediate Response)

- API health check failing
- Error rate > 5%
- Worker container unhealthy
- Database connection failures

### Warning Alerts (Investigate Soon)

- Elevated latency (P95 > 2s)
- Queue depth growing
- Elevated error rate (> 1%)
- Low disk space on database volume

### Alert Notification Channels

Configure alerts to notify via:
- Email (team distribution list)
- Slack/Discord webhook
- PagerDuty (for critical alerts)

## Runbook Template

```markdown
# Alert: [Alert Name]

## Severity
[Critical / High / Medium / Low]

## Description
[What triggered this alert]

## Impact
[How this affects users or the system]

## Investigation Steps

1. Check service health: `curl http://localhost:8080/api/healthz`
2. Check logs: `docker logs job-finder-api`
3. Check Sentry for error details
4. Review recent deployments
5. Check database connectivity

## Resolution Steps

1. If recent deployment: Consider rollback
2. If resource issue: Scale up or optimize
3. If data issue: Review and correct data
4. Escalate if unresolved

## Post-Incident

1. Create incident report
2. Update runbook with learnings
3. Add preventive measures
```

## Best Practices

### Prevent Alert Fatigue

1. **Set appropriate thresholds** - Avoid false positives
2. **Use alert grouping** - Multiple failures = one alert
3. **Implement suppression windows** - Maintenance periods
4. **Regular review and tuning** - Monthly optimization

### Good Alert Characteristics

- **Actionable**: Clear next steps
- **Contextual**: Includes relevant information
- **Timely**: Triggers at the right time
- **Documented**: Links to runbook

## Testing Schedule

### Monthly

- Review alert thresholds
- Check notification delivery
- Update runbooks as needed

### Quarterly

- Test alert escalation policies
- Review metrics coverage
- Evaluate new monitoring needs

## Troubleshooting

### No Logs Appearing

1. Check log level configuration
2. Verify Docker container is running
3. Check stdout/stderr redirection

### Sentry Not Receiving Errors

1. Verify DSN is correct
2. Check network connectivity
3. Verify Sentry project is active
4. Check sample rate settings

### Health Checks Failing

1. Verify endpoint responds locally
2. Check container networking
3. Review timeout settings
4. Check database connectivity
