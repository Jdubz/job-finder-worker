# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository Overview

This is the **Job Finder Frontend** - a standalone React application for job search automation, AI-powered resume generation, and job application management.

### Project Management

**IMPORTANT**: This repository is part of a multi-repository project managed centrally.

- **Task Tracking**: ALL task tracking is done in [job-finder-app-manager](https://github.com/Jdubz/job-finder-app-manager)
- **Worker Assignment**: Check `CLAUDE_WORKER_B.md` in the manager repo for your assigned tasks
- **Workflow**: Work in dedicated worktree on your worker branch, submit PRs to `staging`
- **Documentation**: Architecture and setup docs live here, project management lives in manager repo

### Integration

This frontend integrates with:

- **job-finder** (Python Service) - Queue worker for job scraping and AI matching
- **job-finder-BE** (Firebase Functions) - Backend API for document generation and content management
- **job-finder-shared-types** - Shared TypeScript type definitions
- **Shared Firestore Database** - Real-time data synchronization

### Key Technologies

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui components
- **Routing:** React Router v7
- **State Management:** React Context API + Firebase Auth
- **Backend Integration:** Firebase SDK + REST APIs
- **Build Tool:** Vite (fast HMR, optimized production builds)

## Project Structure

```
job-finder-FE/
├── .claude/                # Claude Code configuration
├── .github/workflows/      # GitHub Actions CI/CD
├── src/
│   ├── components/         # Reusable React components
│   │   ├── auth/          # Authentication components
│   │   ├── layout/        # Layout components (nav, sidebar)
│   │   └── ui/            # shadcn/ui component library
│   ├── pages/             # Page-level components
│   │   ├── auth/          # Login, Unauthorized
│   │   ├── job-finder/    # Job submission page
│   │   ├── job-applications/  # Match results display
│   │   ├── document-builder/  # AI resume/cover letter builder
│   │   ├── content-items/ # Experience/skills management
│   │   ├── ai-prompts/    # AI prompt customization
│   │   ├── document-history/  # Generated document history
│   │   ├── queue-management/  # Admin job queue management
│   │   └── settings/      # User settings
│   ├── contexts/          # React contexts (Auth)
│   ├── config/            # Configuration files
│   │   ├── api.ts        # API base URLs and endpoints
│   │   └── firebase.ts   # Firebase initialization
│   ├── lib/               # Utility functions
│   │   └── utils.ts      # Tailwind merge, cn helper
│   ├── types/             # TypeScript type definitions
│   ├── App.tsx            # Root component
│   ├── router.tsx         # Route definitions
│   ├── main.tsx           # Application entry point
│   └── index.css          # Global styles + Tailwind
├── public/                # Static assets
├── scripts/               # Build and utility scripts
├── firebase.json          # Firebase hosting configuration
├── .firebaserc           # Firebase project aliases
├── Makefile              # Development commands
└── package.json          # Dependencies and scripts
```

## Common Development Commands

### Daily Development

```bash
# Start dev server (port 5173)
npm run dev
# or
make dev

# Build for production
npm run build
# or
make build

# Preview production build
npm run preview
# or
make preview

# Run linting
npm run lint
# or
make lint

# Fix linting issues
npm run lint:fix
# or
make lint-fix

# Run tests
npm test
# or
make test
```

### Firebase Development

```bash
# Serve locally with Firebase emulators
firebase emulators:start
# or
make firebase-serve

# Deploy to staging
make deploy-staging

# Deploy to production
make deploy-prod
```

### Process Management

```bash
# Kill all dev servers
make kill
```

## Architecture Patterns

### Authentication Flow

```typescript
// Protected routes require authentication
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

<Route element={<ProtectedRoute />}>
  <Route path="/dashboard" element={<DashboardPage />} />
</Route>

// Public routes redirect authenticated users
import { PublicRoute } from '@/components/auth/PublicRoute'

<Route element={<PublicRoute />}>
  <Route path="/login" element={<LoginPage />} />
</Route>
```

### State Management

**Auth State** (Context):

```typescript
import { useAuth } from "@/contexts/AuthContext"

const { user, loading, isEditor, login, logout } = useAuth()
```

**Component State** (useState/useReducer):

- Local form state
- UI state (modals, dropdowns)

**Server State** (Firebase Realtime):

- Firestore listeners for real-time updates
- No client-side caching needed

### API Integration

**Firebase Functions:**

```typescript
import { api } from "@/config/api"

// AI resume generation
const response = await fetch(`${api.functions.generateResume}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
})
```

**Firestore Direct Access:**

```typescript
import { db } from "@/config/firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"

// Real-time job matches
const q = query(collection(db, "job-matches"), where("userId", "==", user.uid))
onSnapshot(q, (snapshot) => {
  // Update UI
})
```

## Environment Configuration

### Development (`.env.development`)

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=localhost
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_USE_EMULATORS=true
```

### Staging (`.env.staging`)

```env
VITE_FIREBASE_API_KEY=your-staging-key
VITE_FIREBASE_AUTH_DOMAIN=staging.example.com
VITE_FIREBASE_PROJECT_ID=project-staging
VITE_API_BASE_URL=https://staging-api.example.com
```

### Production (`.env.production`)

```env
VITE_FIREBASE_API_KEY=your-production-key
VITE_FIREBASE_AUTH_DOMAIN=example.com
VITE_FIREBASE_PROJECT_ID=project-production
VITE_API_BASE_URL=https://api.example.com
```

## Shared Types Integration

This project uses types from `@jdubz/job-finder-shared-types`:

```typescript
import type { QueueItem, JobMatch, QueueSettings, AISettings } from "@jdubz/job-finder-shared-types"
```

**Installing shared types:**

```bash
npm install ../job-finder-shared-types
```

## Git Workflow

**Branch Strategy:**

```
feature_branch → staging → main
```

**Rules:**

1. Create feature branches from `staging`
2. Create PR: `feature → staging`
3. Test on staging deployment
4. Create PR: `staging → main` for production
5. **Never push directly to `main`**

**Deployment:**

- Push to `staging` → auto-deploys to staging.example.com
- Merge to `main` → auto-deploys to production

## Testing Checklist (Before Merging to Main)

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Linting passes (`npm run lint`)
- [ ] Feature tested on staging
- [ ] Auth works (if auth-related changes)
- [ ] No console errors or warnings
- [ ] Mobile responsive (all breakpoints)
- [ ] Accessibility tested

## Component Library (shadcn/ui)

Add new components:

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
```

Components are added to `src/components/ui/` and can be customized.

## Styling Guidelines

**Use Tailwind utility classes:**

```tsx
<div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-md">
```

**Use cn() helper for conditional classes:**

```tsx
import { cn } from '@/lib/utils'

<button className={cn(
  "px-4 py-2 rounded",
  isActive && "bg-blue-500 text-white",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>
```

## Important Notes

### Security

- **Firebase Auth:** All protected routes check authentication
- **API Keys:** Never commit `.env` files - use `.env.example`
- **CORS:** Backend APIs configured to allow staging + production origins
- **Rate Limiting:** Contact form and AI generation rate limited

### Performance

- **Code Splitting:** React Router lazy loads page components
- **Bundle Size:** Monitor with `npm run build` output
- **Image Optimization:** Use WebP format, lazy loading
- **Firebase SDK:** Only import needed modules

### Common Issues

1. **Dev server won't start:** Check port 5173 is free
2. **Firebase connection fails:** Verify environment variables
3. **Build fails:** Clear node_modules and reinstall
4. **Type errors:** Check shared-types package is installed

## Documentation

- [Architecture](./CONTEXT.md) - System design and patterns
- [Contributing](./CONTRIBUTING.md) - Development workflow
- [Changelog](./CHANGELOG.md) - Version history

## Cross-Project Integration

### Firebase Cloud Functions (Backend API)

**Endpoints:**

- `POST /manageGenerator` - AI resume/cover letter generation
- `POST /handleContactForm` - Contact form submission
- `POST /manageContentItems` - Content and experience management

### Job-Finder Python Service

**Shared Firestore Collections:**

- `job-queue` - Job processing queue
- `job-matches` - AI-analyzed matches
- `job-finder-config` - Settings and stop-lists

**Data Flow:**

1. User submits job URL (this app)
2. Python service processes queue
3. Creates JobMatch if score ≥ threshold
4. User sees match in real-time (this app)
5. User generates custom resume (this app → Firebase Functions backend)

## Deployment

### Firebase Hosting

**Staging:**

```bash
npm run deploy:staging
```

**Production:**

```bash
npm run deploy:production
```

### Alternative Hosting (Vercel/Netlify)

**Vercel:**

```bash
vercel --prod
```

**Netlify:**

```bash
netlify deploy --prod
```

## Troubleshooting

### Firebase Emulator Issues

1. **Port conflicts:** Change ports in `firebase.json`
2. **Auth not working:** Ensure emulators are running
3. **Data not persisting:** Check `--export-on-exit` flag

### Build Issues

1. **Out of memory:** Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096`
2. **Type errors:** Run `npm run type-check`
3. **Import errors:** Check path aliases in `tsconfig.json`

## Implemented Features

This repository contains a complete React frontend with the following features:

### Core Pages

- **Job Finder** - Submit job URLs for AI analysis
- **Job Applications** - View and manage AI-matched jobs
- **Document Builder** - Generate AI-powered resumes and cover letters
- **Document History** - Browse and manage generated documents
- **Content Items** - Manage experience, skills, and portfolio content
- **Queue Management** - Admin interface for job processing queue
- **System Health** - Monitor system status and logs

### Configuration Pages (Editor-Only)

- **AI Prompts** - Customize AI prompts for all generation tasks
- **Job Finder Config** - Manage stop lists, queue settings, AI settings
- **Settings** - User preferences and defaults

### Testing & CI/CD

- **E2E Tests** - Playwright test suite covering all major workflows
- **GitHub Actions** - Automated CI/CD for staging and production
- **Type Safety** - Full TypeScript coverage with strict mode

For current feature development and roadmap, see [job-finder-app-manager](https://github.com/Jdubz/job-finder-app-manager)
