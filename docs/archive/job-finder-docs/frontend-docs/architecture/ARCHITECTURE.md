# Job Finder Frontend Architecture

## Overview

The Job Finder frontend is a modern React SPA (Single Page Application) built with TypeScript, following a feature-based architecture with clear separation of concerns.

## Technology Stack

### Core

- **React 18**: UI library with hooks and concurrent features
- **TypeScript 5.9**: Type-safe development
- **Vite**: Fast build tool and dev server
- **React Router v7**: Client-side routing

### UI & Styling

- **shadcn/ui**: Component library built on Radix UI
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **CVA**: Class Variance Authority for component variants

### State Management

- **React Context**: Global state (Auth)
- **React Hooks**: Local component state
- **Firestore Real-time**: Backend state synchronization

### Backend Integration

- **Firebase Auth**: User authentication
- **Cloud Firestore**: Real-time database
- **Firebase Functions**: Backend API (Python)
- **Firebase Hosting**: Static site hosting

### Testing

- **Vitest**: Unit testing framework
- **React Testing Library**: Component testing
- **Playwright**: End-to-end testing
- **jsdom**: DOM simulation

### Development Tools

- **ESLint**: Code linting (flat config)
- **Prettier**: Code formatting
- **TypeScript**: Static type checking

## Architecture Patterns

### 1. Feature-Based Organization

```
src/
├── pages/              # Page components (routes)
│   ├── HomePage.tsx
│   ├── job-applications/
│   │   ├── JobApplicationsPage.tsx
│   │   └── components/     # Page-specific components
│   │       ├── JobMatchCard.tsx
│   │       └── JobDetailsDialog.tsx
│   ├── job-finder/
│   ├── document-builder/
│   ├── document-history/
│   ├── job-finder-config/
│   ├── ai-prompts/
│   ├── settings/
│   └── auth/
├── components/         # Shared components
│   ├── auth/          # Auth-related components
│   ├── layout/        # Layout components
│   └── ui/            # shadcn/ui components
├── api/               # API client layer
├── contexts/          # React contexts
├── hooks/             # Custom hooks
└── lib/               # Utilities
```

### 2. API Client Layer

All backend communication goes through typed API clients:

```
API Clients (src/api/)
├── base-client.ts        # Base class with retry logic
├── prompts-client.ts     # AI prompts management
├── config-client.ts      # Configuration management
├── generator-client.ts   # Document generation
├── job-queue-client.ts   # Queue operations
└── job-matches-client.ts # Job match operations
```

**Benefits:**

- Type safety with shared types
- Centralized error handling
- Automatic retry logic
- Easy mocking for tests

### 3. Route Protection

```typescript
// Public routes (no auth required)
<Route element={<PublicRoute />}>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/how-it-works" element={<HowItWorksPage />} />
</Route>

// Protected routes (auth required)
<Route element={<ProtectedRoute />}>
  <Route path="/job-applications" element={<JobApplicationsPage />} />
  <Route path="/document-builder" element={<DocumentBuilderPage />} />
</Route>

// Editor-only routes (auth + editor role)
<Route element={<ProtectedRoute requireEditor />}>
  <Route path="/ai-prompts" element={<AIPromptsPage />} />
  <Route path="/job-finder-config" element={<JobFinderConfigPage />} />
</Route>
```

### 4. Authentication Flow

```
User → LoginPage → Firebase Auth → AuthContext
                                     ↓
                              Protected Routes
                                     ↓
                              Application Pages
```

**AuthContext provides:**

- `user`: Current Firebase user
- `isEditor`: Boolean for editor role
- `loading`: Auth initialization state
- `signOut()`: Logout function

## Component Architecture

### Page Components

Page components are route-level components that:

- Fetch data from API clients
- Manage page-level state
- Compose smaller components
- Handle navigation

**Example Structure:**

```typescript
export function JobApplicationsPage() {
  // 1. Hooks
  const { user } = useAuth();
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // 2. Data fetching
  useEffect(() => {
    loadMatches();
  }, [user]);

  // 3. Event handlers
  const handleFilter = (filters: JobMatchFilters) => {
    // ...
  };

  // 4. Render
  return (
    <div>
      <FilterControls onFilter={handleFilter} />
      <JobMatchList matches={matches} />
    </div>
  );
}
```

### Shared Components

Reusable components in `src/components/`:

- **Layout components**: Navigation, MainLayout
- **Auth components**: ProtectedRoute, PublicRoute
- **UI components**: shadcn/ui primitives

### UI Components (shadcn/ui)

Located in `src/components/ui/`, these are:

- Radix UI primitives with Tailwind styling
- Fully accessible (ARIA compliant)
- Composable and customizable
- Examples: Button, Card, Dialog, Form, Table

## Data Flow

### 1. User Actions → API Clients → Firebase

```
User clicks "Submit Job"
       ↓
JobFinderPage.handleSubmit()
       ↓
jobQueueClient.submitJob(url)
       ↓
Firebase Functions (Python backend)
       ↓
Firestore (queue_items collection)
```

### 2. Real-time Updates (Firestore → UI)

```
Firestore document changes
       ↓
onSnapshot listener
       ↓
React state update
       ↓
Component re-renders
```

**Example:**

```typescript
useEffect(() => {
  const unsubscribe = onSnapshot(collection(db, "job_matches"), (snapshot) => {
    const matches = snapshot.docs.map((doc) => doc.data())
    setMatches(matches)
  })
  return () => unsubscribe()
}, [])
```

### 3. Form Handling

Using React Hook Form + Zod for validation:

```typescript
const schema = z.object({
  linkedInUrl: z.string().url(),
  priority: z.enum(["low", "normal", "high"]),
})

const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { priority: "normal" },
})

const onSubmit = async (data: z.infer<typeof schema>) => {
  await jobQueueClient.submitJob(data.linkedInUrl)
}
```

## Firebase Structure

### Collections

```
firestore/
├── users/                    # User profiles
│   └── {userId}/
│       ├── profile           # Basic info, role, preferences
│       ├── prompts           # Custom AI prompts
│       ├── stop_list         # Blocked companies/keywords
│       ├── queue_settings    # Queue configuration
│       └── ai_settings       # AI model settings
│
├── queue_items/              # Job processing queue
│   └── {itemId}/
│       ├── url               # LinkedIn job URL
│       ├── status            # pending|processing|completed|failed
│       ├── created_at        # Timestamp
│       ├── updated_at        # Timestamp
│       └── result            # Processing result/error
│
├── job_matches/              # Matched jobs
│   └── {matchId}/
│       ├── job_title
│       ├── company
│       ├── match_score       # 0-100
│       ├── status            # new|viewed|applied|rejected
│       ├── user_id
│       └── created_at
│
└── documents/                # Generated documents
    └── {documentId}/
        ├── type              # resume|cover_letter
        ├── job_match_id
        ├── user_id
        ├── title
        ├── content
        ├── download_url      # Cloud Storage URL
        └── created_at
```

### Security Rules

```javascript
// Only authenticated users can read/write their own data
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
}

// Editor role required for certain collections
match /users/{userId}/prompts/{promptId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId
    && get(/databases/$(database)/documents/users/$(userId)).data.role == 'editor';
}
```

## State Management Strategy

### Local State (useState)

For component-specific state:

- Form inputs
- UI toggles (dialogs, dropdowns)
- Temporary filters

### Context (React Context)

For global application state:

- Authentication (AuthContext)
- Theme preferences
- User settings

### Server State (Firestore Real-time)

For backend data:

- Job matches
- Queue items
- Documents
- Configuration

**No global state library needed** - Firebase real-time updates handle most data synchronization.

## Error Handling

### API Errors

```typescript
try {
  await jobQueueClient.submitJob(url)
  setAlert({ type: "success", message: "Job submitted!" })
} catch (error) {
  if (error instanceof ApiError) {
    setAlert({ type: "error", message: error.message })
  } else {
    setAlert({ type: "error", message: "An unexpected error occurred" })
  }
}
```

### Error Boundaries

```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo);
    // Could send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

## Performance Optimizations

### 1. Code Splitting

```typescript
// Lazy load pages
const JobApplicationsPage = lazy(() => import('./pages/job-applications'));

// Render with Suspense
<Suspense fallback={<Skeleton />}>
  <JobApplicationsPage />
</Suspense>
```

### 2. Memoization

```typescript
const filteredMatches = useMemo(() => {
  return matches.filter((match) => match.score >= minScore)
}, [matches, minScore])

const handleClick = useCallback(() => {
  // Handler logic
}, [dependency])
```

### 3. Virtual Lists

For long lists, use React Virtual:

```typescript
import { useVirtualizer } from "@tanstack/react-virtual"

// Virtualize large job match lists
```

### 4. Image Optimization

- Use WebP format
- Lazy load images
- Responsive images with srcset

## Testing Strategy

### Unit Tests (Vitest)

```typescript
// src/api/__tests__/prompts-client.test.ts
describe("PromptsClient", () => {
  it("should extract variables from prompt", () => {
    const prompt = "Hello {{name}}, your job is {{title}}"
    const vars = extractVariables(prompt)
    expect(vars).toEqual(["name", "title"])
  })
})
```

### Component Tests (React Testing Library)

```typescript
// src/pages/__tests__/LoginPage.test.tsx
describe('LoginPage', () => {
  it('should render login button', () => {
    render(<LoginPage />);
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/authentication.spec.ts
test("should redirect unauthenticated users to login", async ({ page }) => {
  await page.goto("/job-applications")
  await expect(page).toHaveURL("/login")
})
```

## Deployment Architecture

```
GitHub Repository
       ↓
GitHub Actions (CI/CD)
       ↓
[Lint] → [Test] → [Build] → [E2E]
       ↓
Firebase Hosting
       ↓
[Staging] https://staging.job-finder.com
[Production] https://job-finder.com
```

### Environments

1. **Development** (local)
   - `npm run dev`
   - Hot module replacement
   - Source maps

2. **Staging** (staging branch)
   - Auto-deploy on push to `staging`
   - Firebase Hosting (staging target)
   - Staging Firebase project

3. **Production** (main branch)
   - Auto-deploy on push to `main`
   - Firebase Hosting (production target)
   - Production Firebase project
   - GitHub release created

## Security Considerations

### 1. Authentication

- Firebase Auth tokens in HTTP-only cookies
- Automatic token refresh
- Session timeout after inactivity

### 2. Authorization

- Role-based access (user/editor)
- Route protection
- Firestore security rules

### 3. Data Protection

- All API requests over HTTPS
- Sensitive data encrypted at rest
- PII handled according to privacy policy

### 4. XSS Prevention

- React auto-escapes JSX
- No `dangerouslySetInnerHTML`
- CSP headers configured

### 5. CSRF Protection

- Firebase Auth tokens
- Same-origin policy
- CORS properly configured

## Monitoring & Observability

### Error Tracking

- Console errors logged
- API errors captured
- Could integrate Sentry/LogRocket

### Performance Monitoring

- Firebase Performance Monitoring
- Web Vitals tracking
- Lighthouse CI in pipeline

### Analytics

- Firebase Analytics
- User flow tracking
- Feature usage metrics

## Future Enhancements

### Planned

- [ ] Offline support with Service Workers
- [ ] Push notifications for job matches
- [ ] Advanced filtering and sorting
- [ ] Bulk operations on jobs
- [ ] Export data (CSV, PDF)
- [ ] Mobile app (React Native)

### Under Consideration

- [ ] GraphQL API layer
- [ ] Advanced caching strategy
- [ ] Microservices architecture
- [ ] Real-time collaboration features
- [ ] AI-powered job recommendations

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## Additional Documentation

- [API Documentation](./API.md) - Detailed API client reference
- [Component Library](./COMPONENTS.md) - UI component documentation
- [Testing Guide](./TESTING.md) - Comprehensive testing documentation
- [Deployment Guide](./DEPLOYMENT.md) - Deployment and CI/CD details
