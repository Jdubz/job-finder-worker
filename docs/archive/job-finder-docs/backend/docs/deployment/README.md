# Deployment Guide

## 🚀 Deployment Overview

This guide covers deployment procedures for all components of the Job Finder Application across different environments.

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] All tests pass locally and in CI
- [ ] Code review completed and approved
- [ ] Environment variables configured
- [ ] Database migrations applied (if needed)
- [ ] Security scan completed
- [ ] Performance testing completed

### Deployment Process

- [ ] Deploy to staging environment
- [ ] Run integration tests
- [ ] Verify all functionality
- [ ] Deploy to production
- [ ] Monitor deployment
- [ ] Verify production functionality

### Post-Deployment

- [ ] Monitor application health
- [ ] Check error logs
- [ ] Verify user functionality
- [ ] Update documentation
- [ ] Notify stakeholders

## 🏗️ Environment Overview

### Development Environment

- **Purpose**: Local development and testing
- **Access**: Developers only
- **Data**: Test data and emulators
- **URL**: `localhost:3000` (frontend), `localhost:5001` (backend)

### Staging Environment

- **Purpose**: Pre-production testing and validation
- **Access**: Development team and stakeholders
- **Data**: Production-like test data
- **URL**: `staging.jobfinder.app`

### Production Environment

- **Purpose**: Live application for end users
- **Access**: Public access
- **Data**: Real user data
- **URL**: `jobfinder.app`

## 🔧 Component Deployment

### Frontend (job-finder-FE)

```bash
# Staging deployment
npm run deploy:staging

# Production deployment
npm run deploy:production
```

**Requirements**:

- Firebase Hosting configured
- Environment variables set
- Build artifacts generated
- E2E tests passing

### Backend (job-finder-BE)

```bash
# Deploy Cloud Functions
firebase deploy --only functions

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

**Requirements**:

- Firebase project configured
- Service account credentials
- Environment variables set
- Functions tests passing

### Worker (job-finder-worker)

```bash
# Build and push Docker image
docker build -t job-finder-worker .
docker push registry/job-finder-worker:latest

# Deploy to staging/production
kubectl apply -f k8s/
```

**Requirements**:

- Docker image built and pushed
- Kubernetes cluster configured
- Environment variables set
- Worker tests passing

## 🔐 Environment Configuration

### Required Environment Variables

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Database Configuration
DATABASE_URL=your-database-url
REDIS_URL=your-redis-url

# API Configuration
API_BASE_URL=your-api-url
API_KEY=your-api-key

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

### GitHub Secrets Setup

See [GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md) for detailed configuration.

## 🚀 Automated Deployment

### CI/CD Pipeline

- **Trigger**: Push to `staging` or `main` branch
- **Build**: Automated build and test execution
- **Deploy**: Automated deployment to appropriate environment
- **Monitor**: Automated health checks and monitoring

### GitHub Actions Workflows

- **Staging**: Deploy to staging on push to `staging` branch
- **Production**: Deploy to production on push to `main` branch
- **Testing**: Run full test suite on all PRs
- **Security**: Security scanning on all changes

## 📊 Monitoring and Health Checks

### Application Health

- **Frontend**: Check for JavaScript errors and performance
- **Backend**: Monitor API response times and errors
- **Worker**: Monitor queue processing and job completion
- **Database**: Monitor connection health and query performance

### Monitoring Tools

- **Firebase Console**: Backend monitoring and logs
- **Google Cloud Monitoring**: Infrastructure monitoring
- **Sentry**: Error tracking and performance monitoring
- **Custom Dashboards**: Application-specific metrics

## 🔄 Rollback Procedures

### Emergency Rollback

1. **Identify the issue** and determine rollback necessity
2. **Stop the deployment** if still in progress
3. **Revert to previous version**:
   ```bash
   git revert [commit-hash]
   git push origin main
   ```
4. **Monitor the rollback** and verify functionality
5. **Document the incident** and lessons learned

### Planned Rollback

1. **Schedule rollback window** with stakeholders
2. **Prepare rollback plan** with specific steps
3. **Execute rollback** during maintenance window
4. **Verify functionality** after rollback
5. **Update documentation** with rollback notes

## 🛠️ Troubleshooting Deployment

### Common Issues

- **Build Failures**: Check dependencies and environment
- **Deployment Timeouts**: Check network and resource limits
- **Environment Variables**: Verify all required variables are set
- **Database Issues**: Check connection strings and permissions

### Debugging Steps

1. **Check deployment logs** for specific errors
2. **Verify environment configuration** is correct
3. **Test components individually** to isolate issues
4. **Check external dependencies** and services
5. **Review recent changes** that might have caused issues

## 📚 Related Documentation

- **[Production Cutover Checklist](./PRODUCTION_CUTOVER_CHECKLIST.md)**: Production deployment checklist
- **[Custom Domain Setup](./CUSTOM_DOMAIN_SETUP.md)**: Domain configuration guide
- **[GitHub Secrets Setup](./GITHUB_SECRETS_SETUP.md)**: Environment variable configuration
- **[Operations Guide](../operations/)**: Troubleshooting and maintenance

## 🆘 Emergency Contacts

- **Technical Lead**: [Contact Information]
- **DevOps Team**: [Contact Information]
- **On-Call Engineer**: [Contact Information]
- **Emergency Escalation**: [Contact Information]

---

**Last Updated**: 2025-10-21  
**Maintained By**: DevOps Team  
**Review Schedule**: Monthly
