# FEATURE-1 — Job Application Interface

> **Context**: See [CLAUDE.md](../../CLAUDE.md) for project overview, tech stack, and development environment
> **Architecture**: Real-time Firestore integration with React components

---

## Issue Metadata

```yaml
Title: FEATURE-1 — Job Application Interface
Labels: priority-p1, repository-frontend, type-feature, status-todo
Assignee: Worker B
Priority: P1-High
Estimated Effort: 8-12 hours
Repository: job-finder-FE
```

---

## Summary

**Problem**: Users need a comprehensive interface to view, filter, and manage job matches that have been analyzed by the job-finder Python service. Currently, there's no frontend interface to display the AI-matched jobs stored in Firestore.

**Goal**: Create an intuitive job application management interface that displays AI-matched jobs in real-time, allows filtering and sorting, and enables users to track their application status.

**Impact**: This is the primary interface where users interact with their job matches, making it essential for the core user experience and workflow.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[CLAUDE.md](../../CLAUDE.md)** - Project overview, Firestore integration patterns
- **[SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)** - Data flow between Python service and frontend
- **Firestore Collections**: `job-matches` collection structure

**Key concepts to understand**:

- **JobMatch Type**: From @jdubz/job-finder-shared-types
- **Real-time Updates**: onSnapshot listeners for live data
- **Auth Context**: User-specific data filtering

---

## Tasks

### Phase 1: Data Integration

1. **Create Firestore hooks**
   - What: Custom React hook for job matches
   - Where: `src/hooks/useJobMatches.ts` (create)
   - Why: Reusable real-time data fetching with cleanup
   - Test: Hook returns matches and updates in real-time

2. **Set up job match types**
   - What: Import and use JobMatch types from shared-types
   - Where: `src/types/index.ts` (if not using shared-types directly)
   - Why: Type safety for job match data
   - Test: TypeScript shows proper type hints

### Phase 2: UI Components

3. **Build JobMatchCard component**
   - What: Card component displaying individual job match
   - Where: `src/components/job-applications/JobMatchCard.tsx` (create)
   - Why: Reusable component for consistent display
   - Test: Renders job title, company, score, and actions

4. **Create filter and sort controls**
   - What: UI controls for filtering by status, sorting by score/date
   - Where: `src/components/job-applications/JobFilters.tsx` (create)
   - Why: Allow users to organize large match lists
   - Test: Filters and sorting update displayed matches

### Phase 3: Main Page

5. **Build JobApplicationsPage**
   - What: Main page component with layout and state management
   - Where: `src/pages/job-applications/JobApplicationsPage.tsx` (create)
   - Why: Primary interface for job application management
   - Test: Page displays matches, filters work, real-time updates

6. **Add status update functionality**
   - What: Allow users to mark jobs as applied, rejected, or saved
   - Where: Update JobMatchCard with status actions
   - Why: Track application progress
   - Test: Status updates persist to Firestore

---

## Technical Details

### Files to Create

```
CREATE:
- src/hooks/useJobMatches.ts - Firestore real-time data hook
- src/components/job-applications/JobMatchCard.tsx - Individual job display
- src/components/job-applications/JobFilters.tsx - Filter/sort controls
- src/components/job-applications/JobMatchList.tsx - List container
- src/pages/job-applications/JobApplicationsPage.tsx - Main page
- src/pages/job-applications/index.ts - Barrel export

MODIFY:
- src/router.tsx - Add route for /job-applications
- src/components/layout/Sidebar.tsx - Add navigation link

REFERENCE:
- @jdubz/job-finder-shared-types - JobMatch type definition
- src/config/firebase.ts - Firestore instance
- src/contexts/AuthContext.tsx - User authentication
```

### Key Implementation Notes

**Firestore Hook Pattern**:

```typescript
// src/hooks/useJobMatches.ts
import { useState, useEffect } from "react"
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore"
import { db } from "@/config/firebase"
import { useAuth } from "@/contexts/AuthContext"
import type { JobMatch } from "@jdubz/job-finder-shared-types"

export function useJobMatches() {
  const [matches, setMatches] = useState<JobMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, "job-matches"),
      where("userId", "==", user.uid),
      orderBy("matchScore", "desc")
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const matchesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as JobMatch[]
        setMatches(matchesData)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user])

  return { matches, loading, error }
}
```

**Job Match Card Component**:

```typescript
// src/components/job-applications/JobMatchCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { JobMatch } from '@jdubz/job-finder-shared-types'

interface JobMatchCardProps {
  match: JobMatch
  onStatusUpdate: (id: string, status: string) => void
}

export function JobMatchCard({ match, onStatusUpdate }: JobMatchCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500'
    if (score >= 60) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle>{match.jobTitle}</CardTitle>
          <Badge className={getScoreColor(match.matchScore)}>
            {match.matchScore}% Match
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{match.company}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm">{match.summary}</p>
          <div className="flex gap-2">
            <Button onClick={() => onStatusUpdate(match.id, 'applied')}>
              Mark Applied
            </Button>
            <Button variant="outline" onClick={() => window.open(match.url)}>
              View Job
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Integration Points**:

- **Firestore**: Real-time listeners for job-matches collection
- **Auth Context**: User-specific data filtering
- **Router**: Protected route requiring authentication
- **Document Builder**: Link to generate resume for specific match

---

## Acceptance Criteria

- [ ] **Real-time updates**: Job matches appear immediately when Python service creates them
- [ ] **Filtering works**: Can filter by application status (applied, saved, rejected)
- [ ] **Sorting works**: Can sort by match score, date added, company name
- [ ] **Status updates persist**: Marking as applied/rejected updates Firestore
- [ ] **Match score displayed**: Visual indicator for match quality (color-coded)
- [ ] **Responsive design**: Works on mobile, tablet, and desktop
- [ ] **Error handling**: Shows appropriate errors if Firestore fails
- [ ] **Loading states**: Shows skeleton/spinner while loading data

---

## Testing

### Test Commands

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build (ensures no build errors)
npm run build

# Run dev server
npm run dev
```

### Manual Testing

```bash
# Step 1: Start development server
npm run dev
# Visit http://localhost:5173/job-applications

# Step 2: Verify real-time updates
# 1. Open Firestore console
# 2. Manually add a job-match document with your userId
# 3. Should appear immediately in the UI

# Step 3: Test filtering
# 1. Add multiple job matches with different statuses
# 2. Use filter controls to show/hide by status
# 3. Verify only matching jobs display

# Step 4: Test sorting
# 1. Sort by match score (highest to lowest)
# 2. Sort by date added (newest to oldest)
# 3. Verify order changes correctly

# Step 5: Test status updates
# 1. Click "Mark Applied" on a job
# 2. Check Firestore - status field should update
# 3. Verify UI reflects new status
```

---

## Commit Message Template

```
feat(job-applications): implement job application interface

Create comprehensive interface for viewing and managing AI-matched jobs
from Firestore. Includes real-time updates, filtering, sorting, and
status tracking functionality.

Key changes:
- Add useJobMatches hook for real-time Firestore data
- Create JobMatchCard component with score display
- Implement filtering by status and sorting by score/date
- Build JobApplicationsPage with full layout
- Add status update functionality (applied/rejected/saved)
- Integrate with Auth context for user-specific data

Testing:
- Verified real-time updates from Firestore
- Tested filtering and sorting functionality
- Confirmed status updates persist to database
- Validated responsive design on mobile/desktop

Closes #5
```

---

## Related Issues

- **Depends on**: SETUP-1 (Frontend Development Environment)
- **Depends on**: AUTH-1 (Authentication System)
- **Blocks**: FEATURE-2 (Document Builder Interface)
- **Related**: Python service job-finder creates job-matches

---

## Resources

### Documentation

- **Firestore Queries**: https://firebase.google.com/docs/firestore/query-data/queries
- **Firestore Real-time Updates**: https://firebase.google.com/docs/firestore/query-data/listen
- **shadcn/ui Components**: https://ui.shadcn.com/
- **Shared Types**: @jdubz/job-finder-shared-types package

### External References

- **React Hooks Best Practices**: https://react.dev/reference/react/hooks
- **TypeScript Type Guards**: https://www.typescriptlang.org/docs/handbook/2/narrowing.html

---

## Success Metrics

**How we'll measure success**:

- **Real-time latency**: Updates appear within 1 second of Firestore change
- **Load performance**: Displays 100+ matches without lag
- **Filter response**: Filtering updates UI within 100ms
- **User engagement**: Users can quickly find and act on best matches

---

## Notes

**Questions? Need clarification?**

- Comment on this issue with specific questions
- Tag @PM for guidance
- Reference CLAUDE.md for Firestore patterns

**Implementation Tips**:

- Use onSnapshot for real-time updates, remember to cleanup
- Consider pagination if match count grows large
- Use React.memo for JobMatchCard to prevent unnecessary re-renders
- Cache filter/sort preferences in localStorage
- Add skeleton loading states for better UX

---

**Created**: 2025-10-19
**Created By**: PM
**Last Updated**: 2025-10-19
**Status**: Todo
