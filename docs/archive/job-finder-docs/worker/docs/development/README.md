# Development Guide

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+
- Docker
- Firebase CLI
- Git

### Initial Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Jdubz/job-finder-app-manager.git
   cd job-finder-app-manager
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Environment configuration**:
   ```bash
   cp .env.example .env
   # Configure your environment variables
   ```

## 🏗️ Repository Structure

### Manager Repository (job-finder-app-manager)

- **Purpose**: Project coordination, documentation, and task management
- **Branch**: `main` (PM works here)
- **Key Files**: Documentation, issue tracking, project management

### Development Repositories

- **job-finder-BE**: Backend API (Firebase Cloud Functions)
- **job-finder-FE**: Frontend Application (React/TypeScript)
- **job-finder-worker**: Queue Worker (Python)
- **job-finder-shared-types**: Shared TypeScript definitions

## 🔄 Development Workflow

### Issue-Based Task Management

1. **Check available issues** in the appropriate repository
2. **Select an issue** based on your expertise and availability
3. **Update issue status** to `in-progress` and assign to yourself
4. **Follow the detailed specifications** in the issue and backing document
5. **Submit PR** with proper documentation and tests

### Branch Strategy

- **Production (`main`)**: Protected, only PM can merge from staging
- **Staging**: Integration branch where all development work is merged
- **Feature Branches**: Created as needed from `staging` for larger features
- **Small Fixes**: Commit directly to `staging`

### Code Quality Standards

- **Semantic Commits**: Use conventional commit format
- **Testing**: Write comprehensive tests for all code
- **Documentation**: Document complex logic and APIs
- **Security**: No secrets, validate inputs, follow security best practices
- **Performance**: Optimize for performance and scalability

## 🛠️ Development Setup

### Frontend Development (job-finder-FE)

```bash
cd job-finder-FE
npm install
npm run dev
```

### Backend Development (job-finder-BE)

```bash
cd job-finder-BE
npm install
npm run serve
```

### Worker Development (job-finder-worker)

```bash
cd job-finder-worker
pip install -r requirements.txt
python -m pytest
```

### Shared Types Development (job-finder-shared-types)

```bash
cd job-finder-shared-types
npm install
npm run build
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### Test Requirements

- **Unit Tests**: >80% coverage for all functions
- **Integration Tests**: Test API endpoints and database operations
- **E2E Tests**: Test complete user workflows
- **Performance Tests**: Ensure acceptable response times

## 📝 Documentation Standards

### Code Documentation

- **JSDoc Comments**: All functions should have JSDoc comments
- **Inline Comments**: Document complex logic and algorithms
- **README Updates**: Keep repository READMEs current
- **API Documentation**: Document all public APIs

### Issue Documentation

- **Detailed Specifications**: Use the ISSUE_TEMPLATE.md format
- **Acceptance Criteria**: Clear, testable requirements
- **Implementation Details**: Step-by-step task breakdown
- **Testing Requirements**: Comprehensive test coverage

## 🔒 Security Guidelines

### Code Security

- **No Hardcoded Secrets**: Use environment variables
- **Input Validation**: Validate all user inputs
- **Authentication**: Implement proper auth checks
- **Authorization**: Verify user permissions

### Git Security

- **Never Commit Secrets**: Use .gitignore and environment variables
- **Secure Credentials**: Store sensitive data in GitHub Secrets
- **Code Review**: All changes must be reviewed
- **Security Scanning**: Regular security audits

## 🚀 Deployment

### Development Deployment

- **Local Development**: Use Firebase emulators
- **Staging Deployment**: Automated via GitHub Actions
- **Testing**: Run full test suite before deployment

### Production Deployment

- **PM Approval**: All production changes require PM review
- **Staging Validation**: Must pass staging tests
- **Rollback Plan**: Always have a rollback strategy
- **Monitoring**: Monitor deployment for issues

## 🐛 Troubleshooting

### Common Issues

- **Environment Setup**: Check [Operations Guide](../operations/)
- **Dependency Issues**: Update package versions
- **Firebase Issues**: Check Firebase CLI and credentials
- **Docker Issues**: Check Docker daemon and containers

### Getting Help

1. **Check Documentation**: Review relevant docs
2. **Search Issues**: Look for similar problems
3. **Create Issue**: Document the problem clearly
4. **Ask Team**: Use appropriate communication channels

## 📊 Performance Guidelines

### Frontend Performance

- **Bundle Size**: Keep bundle size optimized
- **Lazy Loading**: Implement code splitting
- **Caching**: Use appropriate caching strategies
- **Images**: Optimize images and use modern formats

### Backend Performance

- **Database Queries**: Optimize database operations
- **Caching**: Implement caching where appropriate
- **Rate Limiting**: Prevent abuse and overload
- **Monitoring**: Track performance metrics

## 🔄 Continuous Integration

### Automated Checks

- **Linting**: Code style and quality checks
- **Testing**: Automated test execution
- **Security**: Security vulnerability scanning
- **Build**: Automated build verification

### Quality Gates

- **All Tests Pass**: No failing tests allowed
- **Linting Clean**: No linting errors or warnings
- **Security Scan**: No high-severity vulnerabilities
- **Code Review**: All changes reviewed and approved

---

**For specific repository setup, see individual repository READMEs**  
**For deployment procedures, see [Deployment Guide](../deployment/)**  
**For troubleshooting, see [Operations Guide](../operations/)**
