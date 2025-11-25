# System Architecture

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Overview

The Job Finder application follows a 3-repository architecture with clear separation of concerns. The system consists of a queue worker, a frontend application with cloud functions, and shared type definitions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Job Finder Application                   │
├─────────────────────────────────────────────────────────────┤
│  Frontend + Cloud Functions  │  Queue Worker (Python)      │
│  ┌─────────────────────────┐   │  ┌─────────────────────────┐ │
│  │  job-finder-FE/        │   │  │  job-finder/           │ │
│  │  - React Frontend       │   │  │  - Queue Processing    │ │
│  │  - Firebase Functions   │   │  │  - Scraping Logic      │ │
│  │  - User Interface       │   │  │  - E2E Testing         │ │
│  │  - State Management     │   │  │  - Data Processing     │ │
│  └─────────────────────────┘   │  └─────────────────────────┘ │
│                                │                              │
│  ┌─────────────────────────┐   │  ┌─────────────────────────┐ │
│  │  job-finder-shared-    │   │  │  Project Management    │ │
│  │  types/                │   │  │  ┌─────────────────┐   │ │
│  │  - Firestore Types     │   │  │  │  job-finder-    │   │ │
│  │  - Data Structures     │   │  │  │  app-manager/   │   │ │
│  │  - Data Models        │   │  │  │  - Coordination │   │ │
│  │  - Validation         │   │  │  │  - Documentation│   │ │
│  └─────────────────────────┘   │  │  │  - Task Management│   │ │
│                                │  │  └─────────────────┘   │ │
└─────────────────────────────────────────────────────────────┘
```

## Repository Structure

### Frontend Repository (job-finder-FE/)

- **Technology**: React with TypeScript
- **Purpose**: User interface and user experience
- **Key Components**:
  - Job search interface and job listing views
  - Queue monitoring and document builder flows
  - Firebase Authentication client
  - Integrations with Cloud Functions for data retrieval
  - Served publicly via Cloudflare at `job-finder-staging.joshwentworth.com` (staging) and `job-finder.joshwentworth.com` (production), proxying Firebase Hosting origins (`job-finder-staging.web.app`, `job-finder-production.web.app`).

### Cloud Functions Repository (job-finder-BE/)

- **Technology**: Firebase Cloud Functions (TypeScript)
- **Purpose**: Serve data and operations to the frontend over callable/HTTP Functions
- **Key Components**:
  - Read/write access to Firestore collections the UI consumes
  - Configuration/document generation endpoints migrated from portfolio
  - Lightweight validation, auth, and response shaping

### Queue Worker Repository (job-finder/)

- **Technology**: Python
- **Purpose**: Perform all queue processing, scraping, AI analysis, and data enrichment
- **Key Components**:
  - Job and company scraping pipelines
  - AI-driven analysis and scoring logic
  - Firestore persistence for job matches and supporting collections
  - Scheduled tasks and scripting to keep the queue healthy

### Shared Types Repository (job-finder-shared-types/)

- **Technology**: TypeScript
- **Purpose**: Shared type definitions and contracts
- **Key Components**:
  - API contract types
  - Data model types
  - Validation schemas
  - Shared interfaces

### Project Management Repository (job-finder-app-manager/)

- **Technology**: Markdown, YAML
- **Purpose**: Project coordination and documentation
- **Key Components**:
  - Task management
  - Documentation
  - Team coordination
  - Process management

## Data Flow

### User Request Flow

1. **User Interface**: User interacts with the React frontend.
2. **Cloud Functions**: The frontend calls Firebase Cloud Functions to read/write Firestore data and trigger curated operations.
3. **Data Backend**: Cloud Functions apply lightweight validation and return data.
4. **Display**: Frontend renders the results for the user.

### Data Processing Flow

1. **Queue Intake**: User submissions and automated discoveries are written to Firestore queue collections.
2. **Job Scraping & Analysis**: The Python worker pulls queue items, performs scraping, AI scoring, and enrichment (no Cloud Function involvement).
3. **Data Storage**: The worker persists results (job matches, company info, queue state) back to Firestore.
4. **Cloud Functions**: Functions surface the processed data to the frontend via callable/HTTP endpoints.
5. **Frontend Consumption**: The frontend reads from Cloud Functions and renders the enriched data.

## Technology Stack

### Frontend Stack

- **Framework**: React
- **Language**: TypeScript
- **Build Tool**: Vite
- **Testing**: Jest, React Testing Library, Playwright

### Backend Stack

- **Framework**: Python (Django/FastAPI)
- **Language**: Python
- **Authentication**: Firebase Authentication
- **Testing**: pytest, unittest

### Shared Stack

- **Language**: TypeScript

## Integration Points

### Frontend-Backend Integration

- **API Contracts**: Defined in shared types
- **Authentication**: Coordinated between frontend and backend
- **Data Flow**: Structured data flow between components
- **Error Handling**: Consistent error handling across stack

### Cross-Repository Coordination

- **Shared Types**: Maintained in shared types repository
- **API Versioning**: Coordinated versioning strategy
- **Deployment**: Coordinated deployment process
- **Testing**: Integrated testing across repositories
