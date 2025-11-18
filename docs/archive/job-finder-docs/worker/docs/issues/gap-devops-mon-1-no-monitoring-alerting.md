# GAP-DEVOPS-MON-1 — No Centralized Monitoring or Alerting

- **Status**: To Do
- **Owner**: Worker A
- **Priority**: P1 (High)
- **Labels**: priority-p1, type-devops, cross-repository, monitoring
- **Estimated Effort**: 3 days
- **Dependencies**: None
- **Related**: Identified in comprehensive gap analysis

## What This Issue Covers

Implement centralized monitoring and alerting for all job-finder services (frontend, backend, worker). Currently, there is **no monitoring or alerting** - failures are only discovered when users complain.

## Context

**Current State**:

- No centralized logging aggregation
- No error tracking or alerting
- No performance monitoring
- No uptime monitoring
- **Result**: Production issues discovered by users, not by monitoring

**Critical Risk**:

- Silent failures in production
- Long mean time to detection (MTTD)
- Poor user experience due to undetected issues
- No visibility into system health
- Cannot proactively address issues

**Why This Is P1 High**:

- Essential for production operations
- Directly impacts user experience
- Industry standard requirement
- Needed for SLA compliance
- Enables proactive incident response

## Tasks

### 1. Set Up Google Cloud Monitoring

- [ ] Enable Cloud Monitoring API
- [ ] Configure dashboards for each service
- [ ] Set up metric collection
- [ ] Create uptime checks
- [ ] Configure service-level objectives (SLOs)

### 2. Implement Error Tracking with Sentry

- [ ] Create Sentry project
- [ ] Add Sentry SDK to frontend (React)
- [ ] Add Sentry SDK to backend (Cloud Functions)
- [ ] Add Sentry SDK to worker (Python)
- [ ] Configure error grouping and filtering
- [ ] Set up release tracking

### 3. Configure Alerting Policies

- [ ] Alert on error rate > 5%
- [ ] Alert on function failures
- [ ] Alert on deployment failures
- [ ] Alert on high latency (p95 > 2s)
- [ ] Alert on resource exhaustion
- [ ] Alert on security events

### 4. Set Up Log Aggregation

- [ ] Ensure all services use structured logging
- [ ] Configure log retention policies
- [ ] Create log-based metrics
- [ ] Set up log exports to BigQuery (optional)

### 5. Create Monitoring Dashboards

- [ ] System health dashboard (all services)
- [ ] Frontend dashboard (performance, errors)
- [ ] Backend dashboard (function metrics, errors)
- [ ] Worker dashboard (job processing, errors)
- [ ] Business metrics dashboard (jobs processed, matches)

### 6. Configure Notification Channels

- [ ] Email notifications for critical alerts
- [ ] Slack integration for team visibility
- [ ] PagerDuty for on-call (optional)
- [ ] Escalation policies

### 7. Documentation

- [ ] Document monitoring architecture
- [ ] Create runbooks for common alerts
- [ ] Document how to investigate issues
- [ ] Add monitoring best practices guide

## Proposed Implementation

### Google Cloud Monitoring Dashboard

```yaml
# dashboards/system-health.yaml
displayName: "Job Finder - System Health"
mosaicLayout:
  columns: 12
  tiles:
    - width: 6
      height: 4
      widget:
        title: "Cloud Function Error Rate"
        xyChart:
          dataSets:
            - timeSeriesQuery:
                timeSeriesFilter:
                  filter: 'resource.type="cloud_function"'
                  aggregation:
                    alignmentPeriod: 60s
                    perSeriesAligner: ALIGN_RATE

    - width: 6
      height: 4
      widget:
        title: "Frontend Error Rate"
        xyChart:
          dataSets:
            - timeSeriesQuery:
                timeSeriesFilter:
                  filter: 'resource.type="cloud_run_revision"'

    - width: 12
      height: 4
      widget:
        title: "Job Processing Throughput"
        xyChart:
          dataSets:
            - timeSeriesQuery:
                timeSeriesFilter:
                  filter: 'metric.type="custom/jobs_processed"'
```

### Alerting Policies

```yaml
# alerts/high-error-rate.yaml
displayName: "High Error Rate - Cloud Functions"
conditions:
  - displayName: "Error rate > 5%"
    conditionThreshold:
      filter: 'resource.type="cloud_function"'
      comparison: COMPARISON_GT
      thresholdValue: 0.05
      duration: 300s
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
notificationChannels:
  - projects/static-sites-257923/notificationChannels/email-team
  - projects/static-sites-257923/notificationChannels/slack-alerts
documentation:
  content: |
    ## High Error Rate Detected

    **What**: Cloud Functions are failing at >5% rate
    **Impact**: Users experiencing errors
    **Action**:
    1. Check Sentry for error details
    2. Review recent deployments
    3. Check Cloud Logging for stack traces
    4. Rollback if needed
```

### Sentry Integration - Frontend

```typescript
// job-finder-FE/src/main.tsx
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT,
  integrations: [
    new BrowserTracing(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions
  beforeSend(event, hint) {
    // Filter out non-errors
    if (event.level === 'info' || event.level === 'debug') {
      return null;
    }
    return event;
  },
});

// Capture errors in React components
const ErrorBoundary = Sentry.ErrorBoundary;

<ErrorBoundary fallback={<ErrorFallback />}>
  <App />
</ErrorBoundary>
```

### Sentry Integration - Backend

```typescript
// job-finder-BE/functions/src/index.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT,
  tracesSampleRate: 0.1,
});

// Wrap Cloud Functions
export const submitJob = onRequest(async (req, res) => {
  try {
    // Function logic
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});
```

### Sentry Integration - Worker

```python
# job-finder-worker/src/main.py
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

sentry_sdk.init(
    dsn=os.getenv('SENTRY_DSN'),
    environment=os.getenv('ENVIRONMENT'),
    traces_sample_rate=0.1,
    integrations=[
        LoggingIntegration(
            level=logging.INFO,
            event_level=logging.ERROR
        ),
    ],
)

# Automatically captures exceptions
def process_job(job_id: str):
    try:
        # Processing logic
    except Exception as e:
        sentry_sdk.capture_exception(e)
        raise
```

### Uptime Monitoring

```yaml
# monitoring/uptime-checks.yaml
- displayName: "Frontend Health Check"
  monitoredResource:
    type: uptime_url
    labels:
      project_id: static-sites-257923
      host: jobfinder.joshwentworth.com
  httpCheck:
    path: /api/health
    port: 443
    useSsl: true
  period: 60s
  timeout: 10s

- displayName: "Backend Health Check"
  httpCheck:
    path: /health
    requestMethod: GET
  period: 60s
  timeout: 10s
```

### Custom Metrics

```typescript
// job-finder-BE/functions/src/utils/metrics.ts
import { Monitoring } from "@google-cloud/monitoring";

const monitoring = new Monitoring.MetricServiceClient();

export async function recordJobProcessed() {
  const dataPoint = {
    interval: {
      endTime: {
        seconds: Date.now() / 1000,
      },
    },
    value: {
      int64Value: 1,
    },
  };

  const timeSeriesData = {
    metric: {
      type: "custom.googleapis.com/jobs_processed",
    },
    resource: {
      type: "global",
      labels: {
        project_id: process.env.GCLOUD_PROJECT,
      },
    },
    points: [dataPoint],
  };

  await monitoring.createTimeSeries({
    name: monitoring.projectPath(process.env.GCLOUD_PROJECT!),
    timeSeries: [timeSeriesData],
  });
}
```

## Acceptance Criteria

- [ ] Sentry integrated in all 3 services
- [ ] Errors automatically tracked and alerted
- [ ] Dashboards show real-time system health
- [ ] Uptime checks configured for all endpoints
- [ ] Alert notifications working (email + Slack)
- [ ] Runbooks created for common alerts
- [ ] All alerts tested (trigger and verify)
- [ ] Documentation complete

## Implementation Strategy

### Phase 1: Error Tracking (1 day)

- Set up Sentry project
- Integrate Sentry in all 3 services
- Configure error filtering and grouping
- Test error reporting

### Phase 2: Monitoring & Dashboards (1 day)

- Enable Cloud Monitoring
- Create dashboards for each service
- Configure uptime checks
- Set up custom metrics

### Phase 3: Alerting (0.5 days)

- Configure alerting policies
- Set up notification channels (email, Slack)
- Test alerts
- Create escalation policies

### Phase 4: Documentation (0.5 days)

- Document monitoring architecture
- Write runbooks for common alerts
- Add troubleshooting guides
- Create team onboarding guide

## Benefits

- **Proactive**: Detect issues before users complain
- **Faster Resolution**: Lower MTTD and MTTR
- **Visibility**: Understand system health at a glance
- **Confidence**: Deploy with confidence knowing monitoring exists
- **Data-Driven**: Make decisions based on metrics
- **Accountability**: Track SLAs and SLOs

## Dependencies Installation

### Frontend

```bash
cd job-finder-FE
npm install --save @sentry/react @sentry/tracing
```

### Backend

```bash
cd job-finder-BE/functions
npm install --save @sentry/node @google-cloud/monitoring
```

### Worker

```bash
cd job-finder-worker
pip install sentry-sdk google-cloud-monitoring
```

## Related Issues

- GAP-TEST-BE-1: Backend tests (monitor test coverage)
- GAP-SEC-AUTH-1: API authentication (monitor auth failures)
- All workflow issues (monitor deployment success)

## Monitoring Best Practices

### Alert Fatigue Prevention

1. Set appropriate thresholds (avoid noise)
2. Use alert grouping (multiple failures = 1 alert)
3. Implement alert suppression windows
4. Use severity levels (critical vs warning)
5. Regular alert review and tuning

### Dashboard Design

1. Most important metrics at the top
2. Use clear, descriptive titles
3. Include target/baseline lines
4. Color-code by severity (green/yellow/red)
5. Link to runbooks from dashboards

### Runbook Template

```markdown
# Alert: High Error Rate

## Severity

Critical - Immediate action required

## Description

Cloud Functions error rate exceeded 5%

## Impact

Users experiencing failures when [action]

## Investigation Steps

1. Check Sentry for error details: [link]
2. Review Cloud Logging: [link]
3. Check recent deployments
4. Verify Firestore connectivity

## Resolution Steps

1. If recent deployment: Rollback
2. If Firestore issue: Check quotas
3. If specific function: Disable traffic
4. Escalate to on-call if unresolved in 15 min

## Post-Incident

1. Create incident report
2. Update runbook with learnings
3. Add preventive tests if applicable
```

## Metrics to Track

### Frontend

- Error rate (errors/pageviews)
- Page load time (p50, p95, p99)
- Largest Contentful Paint (LCP)
- First Input Delay (FID)
- Cumulative Layout Shift (CLS)
- API request latency

### Backend

- Function invocations
- Function errors (by function)
- Function latency (p50, p95, p99)
- Cold start rate
- Firestore read/write operations
- Authentication failures

### Worker

- Jobs processed (success/failure)
- Processing time per job
- Queue depth
- Docker container health
- Resource utilization (CPU, memory)

## Notes

- Start with basic monitoring, iterate
- Too many alerts = alert fatigue
- Focus on actionable alerts
- Review and tune alerts monthly
- Consider SLO-based alerting (error budget)
