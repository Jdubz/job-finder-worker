# Monitoring and Alerting Setup Playbook

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

Comprehensive monitoring and alerting setup for all job-finder services (frontend, backend, worker). This playbook covers architecture, implementation, dashboards, and alerting patterns.

## Overview

**Purpose**: Implement centralized monitoring and alerting to detect and respond to production issues proactively.

**Critical Risks Without Monitoring**:
- Silent failures in production
- Long mean time to detection (MTTD)
- Poor user experience from undetected issues
- No visibility into system health
- Inability to proactively address issues

## Monitoring Architecture

### Components

1. **Google Cloud Monitoring** - Infrastructure and application metrics
2. **Error Tracking (Sentry)** - Structured error reporting and analysis
3. **Log Aggregation** - Centralized structured logging
4. **Uptime Monitoring** - Health check and availability tracking
5. **Custom Metrics** - Business and application-specific metrics
6. **Alerting System** - Multi-channel notifications

### Services Monitored

- **Frontend**: React application (performance, errors)
- **Backend**: Cloud Functions (invocations, latency, errors)
- **Worker**: Python application (job processing, queue metrics)

## Implementation

### 1. Google Cloud Monitoring Setup

```bash
# Enable Cloud Monitoring API
gcloud services enable monitoring.googleapis.com \
  --project=[PROJECT_ID]

# Enable Cloud Logging API
gcloud services enable logging.googleapis.com \
  --project=[PROJECT_ID]
```

### 2. Error Tracking with Sentry

#### Create Sentry Project

1. Sign up at [sentry.io](https://sentry.io)
2. Create organization and project
3. Get DSN for each service (frontend, backend, worker)

#### Frontend Integration

```typescript
// src/main.tsx
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

// Wrap app with error boundary
const ErrorBoundary = Sentry.ErrorBoundary;

<ErrorBoundary fallback={<ErrorFallback />}>
  <App />
</ErrorBoundary>
```

**Install dependencies**:
```bash
npm install --save @sentry/react @sentry/tracing
```

#### Backend Integration

```typescript
// functions/src/index.ts
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

**Install dependencies**:
```bash
npm install --save @sentry/node @google-cloud/monitoring
```

#### Worker Integration

```python
# src/main.py
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

**Install dependencies**:
```bash
pip install sentry-sdk google-cloud-monitoring
```

### 3. Monitoring Dashboards

#### System Health Dashboard

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

**Deploy dashboard**:
```bash
gcloud monitoring dashboards create --config-from-file=dashboards/system-health.yaml
```

### 4. Alerting Policies

#### High Error Rate Alert

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
  - projects/[PROJECT_ID]/notificationChannels/[EMAIL_CHANNEL_ID]
  - projects/[PROJECT_ID]/notificationChannels/[SLACK_CHANNEL_ID]
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

**Create alert**:
```bash
gcloud alpha monitoring policies create --policy-from-file=alerts/high-error-rate.yaml
```

### 5. Notification Channels

#### Email Channel

```bash
gcloud alpha monitoring channels create \
  --display-name="Team Email" \
  --type=email \
  --channel-labels=email_address=team@example.com
```

#### Slack Channel

```bash
gcloud alpha monitoring channels create \
  --display-name="Slack Alerts" \
  --type=slack \
  --channel-labels=url=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 6. Uptime Monitoring

```yaml
# monitoring/uptime-checks.yaml
- displayName: "Frontend Health Check"
  monitoredResource:
    type: uptime_url
    labels:
      project_id: [PROJECT_ID]
      host: [YOUR_DOMAIN]
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

**Create uptime checks**:
```bash
gcloud monitoring uptime-check-configs create \
  --display-name="Frontend Health" \
  --resource-type=uptime-url \
  --host=[YOUR_DOMAIN] \
  --path=/api/health
```

### 7. Custom Metrics

Track business and application-specific metrics:

```typescript
// utils/metrics.ts
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

## Metrics to Track

### Frontend Metrics

- **Error rate**: Errors per pageview
- **Page load time**: P50, P95, P99
- **Core Web Vitals**:
  - Largest Contentful Paint (LCP)
  - First Input Delay (FID)
  - Cumulative Layout Shift (CLS)
- **API request latency**
- **Client-side errors** (JavaScript exceptions)

### Backend Metrics

- **Function invocations**: Total count by function
- **Function errors**: Count and rate by function
- **Function latency**: P50, P95, P99
- **Cold start rate**: Percentage of cold starts
- **Firestore operations**: Read/write counts
- **Authentication failures**: Failed auth attempts

### Worker Metrics

- **Jobs processed**: Success/failure counts
- **Processing time**: Per job duration
- **Queue depth**: Pending jobs count
- **Container health**: Resource utilization
- **Error rate**: Processing failures
- **Throughput**: Jobs per minute/hour

## Alert Runbook Template

```markdown
# Alert: [Alert Name]

## Severity

[Critical / High / Medium / Low]

## Description

[What triggered this alert]

## Impact

[How this affects users or the system]

## Investigation Steps

1. Check Sentry for error details: [link]
2. Review Cloud Logging: [link]
3. Check recent deployments
4. Verify external service status
5. Review metric trends

## Resolution Steps

1. If recent deployment: Consider rollback
2. If external dependency issue: Check service status
3. If resource issue: Scale up or optimize
4. If data issue: Review and correct data
5. Escalate if unresolved in [timeframe]

## Post-Incident

1. Create incident report
2. Update runbook with learnings
3. Add preventive measures
4. Update monitoring/alerts if needed
```

## Dashboard Best Practices

1. **Most important metrics at the top**
2. **Use clear, descriptive titles**
3. **Include target/baseline lines**
4. **Color-code by severity** (green/yellow/red)
5. **Link to runbooks** from dashboards
6. **Keep dashboards focused** (one per service or concern)

## Alert Best Practices

### Prevent Alert Fatigue

1. **Set appropriate thresholds** - Avoid false positives
2. **Use alert grouping** - Multiple failures = one alert
3. **Implement suppression windows** - Maintenance periods
4. **Use severity levels** - Critical vs warning
5. **Regular review and tuning** - Monthly optimization

### Good Alert Characteristics

- **Actionable**: Clear next steps
- **Contextual**: Includes relevant information
- **Timely**: Triggers at the right time
- **Specific**: Indicates exact problem
- **Documented**: Links to runbook

## Testing Schedule

### Monthly

- Review alert thresholds
- Check notification delivery
- Verify dashboard accuracy
- Update runbooks as needed

### Quarterly

- Test alert escalation policies
- Review metrics coverage
- Evaluate new monitoring needs
- Analyze alert effectiveness

### Annually

- Full monitoring system audit
- Cost optimization review
- Update monitoring strategy
- Team training on new features

## Cost Optimization

### Free Tier Limits (Google Cloud)

- 150 MB logs ingestion per month
- 50 GB logs storage for 30 days
- Alerting policies are free
- Up to 1M API calls per month

### Sentry Free Tier

- 5,000 errors per month
- 30-day retention
- Unlimited projects

### Tips to Reduce Costs

1. **Sample traces** - Don't capture 100%
2. **Filter logs** - Exclude debug/info in production
3. **Set retention policies** - Archive or delete old data
4. **Use log-based metrics** - More cost-effective than custom metrics
5. **Optimize sampling rates** - Adjust based on traffic

## Troubleshooting

### No Data in Dashboard

**Diagnosis**:
- Verify metric exists and is being written
- Check IAM permissions for monitoring service
- Validate filter queries in dashboard

**Resolution**:
- Test metric writing manually
- Review and update IAM bindings
- Simplify filter and test

### Alerts Not Firing

**Diagnosis**:
- Check alert policy configuration
- Verify notification channels are active
- Review metric data availability

**Resolution**:
- Test alert by triggering condition
- Verify notification channel configuration
- Check email/Slack delivery settings

### Too Many Alerts

**Diagnosis**:
- Threshold too sensitive
- Alert not grouped properly
- False positives from noise

**Resolution**:
- Adjust threshold values
- Enable alert grouping
- Add filters to reduce noise

## Additional Resources

- [Google Cloud Monitoring Documentation](https://cloud.google.com/monitoring/docs)
- [Sentry Documentation](https://docs.sentry.io/)
- [Site Reliability Engineering Book](https://sre.google/books/)
- [Monitoring Best Practices](https://cloud.google.com/architecture/devops/devops-measurement-monitoring-and-observability)
