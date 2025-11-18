# FEATURE-2 — Document Builder Interface

> **Context**: See [CLAUDE.md](../../CLAUDE.md) for project overview, Firebase Functions integration
> **Architecture**: Frontend calls Firebase Functions backend for AI document generation

---

## Issue Metadata

```yaml
Title: FEATURE-2 — Document Builder Interface
Labels: priority-p1, repository-frontend, type-feature, status-todo
Assignee: Worker B
Priority: P1-High
Estimated Effort: 10-14 hours
Repository: job-finder-FE
```

---

## Summary

**Problem**: Users need an interface to generate AI-powered resumes and cover letters tailored to specific job matches. The job-finder-BE Firebase Functions backend provides the generation capability, but there's no frontend interface to use it.

**Goal**: Create an intuitive document builder that allows users to select a job match, customize generation parameters, generate documents via Firebase Functions, and preview/download the results.

**Impact**: This is a core value proposition of the application - enabling users to quickly generate customized application materials for each job match.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[CLAUDE.md](../../CLAUDE.md)** - Firebase Functions integration patterns, API configuration
- **[BACKEND_MIGRATION_PLAN.md](../architecture/BACKEND_MIGRATION_PLAN.md)** - Firebase Functions API structure
- **API Config**: `src/config/api.ts` for function endpoints

**Key concepts to understand**:

- **Firebase Functions**: `/manageGenerator` endpoint for document generation
- **Content Items**: User's experience/skills pulled from Firestore
- **Document Types**: Resume vs Cover Letter generation
- **AI Customization**: Tone, length, focus areas

---

## Tasks

### Phase 1: Job Selection

1. **Create job selector component**
   - What: Dropdown/list to select which job match to generate for
   - Where: `src/components/document-builder/JobSelector.tsx` (create)
   - Why: Users need to pick which job to tailor documents for
   - Test: Displays all user job matches, selection updates state

2. **Fetch content items**
   - What: Load user's experience and skills from Firestore
   - Where: `src/hooks/useContentItems.ts` (create)
   - Why: Content items are included in generation request
   - Test: Hook returns user's content items

### Phase 3: Generation Form

3. **Build generation form**
   - What: Form with document type, tone, length, focus options
   - Where: `src/components/document-builder/GenerationForm.tsx` (create)
   - Why: Allow users to customize document generation
   - Test: Form validates and captures all options

4. **Implement Firebase Functions call**
   - What: API call to manageGenerator function with auth token
   - Where: `src/services/documentService.ts` (create)
   - Why: Backend generates AI-powered documents
   - Test: Successfully calls function and receives document

### Phase 4: Results Display

5. **Create document preview component**
   - What: Display generated document with formatting
   - Where: `src/components/document-builder/DocumentPreview.tsx` (create)
   - Why: Users need to review before downloading
   - Test: Renders markdown/HTML content properly

6. **Add download functionality**
   - What: Export as PDF, DOCX, or plain text
   - Where: `src/utils/documentExport.ts` (create)
   - Why: Users need documents in various formats
   - Test: Downloads work in multiple formats

---

## Technical Details

### Files to Create

```
CREATE:
- src/components/document-builder/JobSelector.tsx - Job match selection
- src/components/document-builder/GenerationForm.tsx - Customization form
- src/components/document-builder/DocumentPreview.tsx - Result display
- src/hooks/useContentItems.ts - Fetch user content items
- src/services/documentService.ts - Firebase Functions API calls
- src/utils/documentExport.ts - Export utilities (PDF, DOCX)
- src/pages/document-builder/DocumentBuilderPage.tsx - Main page
- src/pages/document-builder/index.ts - Barrel export

MODIFY:
- src/router.tsx - Add route for /document-builder
- src/components/layout/Sidebar.tsx - Add navigation link
- src/config/api.ts - Add manageGenerator endpoint (if not present)

REFERENCE:
- @jdubz/job-finder-shared-types - JobMatch, ContentItem types
- src/config/firebase.ts - Auth token for API calls
- src/contexts/AuthContext.tsx - User authentication
```

### Key Implementation Notes

**Document Service API Call**:

```typescript
// src/services/documentService.ts
import { auth } from "@/config/firebase"
import { api } from "@/config/api"

interface GenerateDocumentRequest {
  jobMatchId: string
  documentType: "resume" | "coverLetter"
  contentItems: string[] // Array of content item IDs
  options: {
    tone?: "professional" | "casual" | "enthusiastic"
    length?: "concise" | "standard" | "detailed"
    focusAreas?: string[]
  }
}

interface GenerateDocumentResponse {
  success: boolean
  documentId: string
  content: string
  format: string
}

export async function generateDocument(
  request: GenerateDocumentRequest
): Promise<GenerateDocumentResponse> {
  const user = auth.currentUser
  if (!user) throw new Error("User not authenticated")

  const token = await user.getIdToken()

  const response = await fetch(api.functions.manageGenerator, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "generate",
      ...request,
    }),
  })

  if (!response.ok) {
    throw new Error(`Generation failed: ${response.statusText}`)
  }

  return response.json()
}
```

**Generation Form Component**:

```typescript
// src/components/document-builder/GenerationForm.tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface GenerationFormProps {
  onGenerate: (options: GenerationOptions) => void
  loading: boolean
}

interface GenerationOptions {
  documentType: 'resume' | 'coverLetter'
  tone: string
  length: string
  focusAreas: string[]
}

export function GenerationForm({ onGenerate, loading }: GenerationFormProps) {
  const [documentType, setDocumentType] = useState<'resume' | 'coverLetter'>('resume')
  const [tone, setTone] = useState('professional')
  const [length, setLength] = useState('standard')
  const [focusAreas, setFocusAreas] = useState<string[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onGenerate({ documentType, tone, length, focusAreas })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label>Document Type</Label>
        <Select value={documentType} onValueChange={(v) => setDocumentType(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="resume">Resume</SelectItem>
            <SelectItem value="coverLetter">Cover Letter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Tone</Label>
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Length</Label>
        <Select value={length} onValueChange={setLength}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="concise">Concise (1 page)</SelectItem>
            <SelectItem value="standard">Standard (1-2 pages)</SelectItem>
            <SelectItem value="detailed">Detailed (2+ pages)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Generating...' : 'Generate Document'}
      </Button>
    </form>
  )
}
```

**Integration Points**:

- **Firebase Functions**: `/manageGenerator` endpoint
- **Firestore**: Fetch content items and job matches
- **Auth**: Required for API authentication
- **Document History**: Save generated documents for later access

---

## Acceptance Criteria

- [ ] **Job selection works**: Can select from user's job matches
- [ ] **Content items loaded**: User's experience/skills fetched from Firestore
- [ ] **Form validation**: All required fields validated before submission
- [ ] **API call succeeds**: Successfully calls Firebase Functions with auth token
- [ ] **Loading state**: Shows spinner/progress while generating
- [ ] **Document preview**: Displays generated content with proper formatting
- [ ] **Download works**: Can export as PDF, DOCX, and plain text
- [ ] **Error handling**: Shows user-friendly errors if generation fails
- [ ] **Document saved**: Generated document saved to Firestore for history

---

## Testing

### Test Commands

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Run dev server
npm run dev
```

### Manual Testing

```bash
# Step 1: Start development server
npm run dev
# Visit http://localhost:5173/document-builder

# Step 2: Test job selection
# 1. Verify dropdown shows your job matches
# 2. Select a job match
# 3. Verify job details display

# Step 3: Test form submission
# 1. Select document type (Resume)
# 2. Choose tone (Professional)
# 3. Select length (Standard)
# 4. Click "Generate Document"
# 5. Verify loading state appears

# Step 4: Verify API call
# 1. Open browser DevTools Network tab
# 2. Generate a document
# 3. Verify POST to manageGenerator endpoint
# 4. Check Authorization header present
# 5. Verify response contains document content

# Step 5: Test preview and download
# 1. Wait for generation to complete
# 2. Verify document preview displays
# 3. Click download button
# 4. Verify file downloads correctly
# 5. Open file and verify formatting

# Step 6: Test error handling
# 1. Disconnect internet
# 2. Try to generate document
# 3. Verify user-friendly error message
# 4. Reconnect and verify retry works
```

---

## Commit Message Template

```
feat(document-builder): implement document builder interface

Create comprehensive interface for generating AI-powered resumes and
cover letters. Integrates with Firebase Functions backend for document
generation and provides preview/download functionality.

Key changes:
- Add JobSelector component for job match selection
- Create GenerationForm with customization options
- Implement documentService for Firebase Functions API calls
- Add DocumentPreview with formatted display
- Create export utilities for PDF, DOCX, and text formats
- Build DocumentBuilderPage with full workflow
- Add error handling and loading states

Testing:
- Verified API calls to manageGenerator endpoint
- Tested document generation with various options
- Confirmed preview and download functionality
- Validated error handling for API failures

Closes #6
```

---

## Related Issues

- **Depends on**: SETUP-1 (Frontend Development Environment)
- **Depends on**: AUTH-1 (Authentication System)
- **Depends on**: FEATURE-1 (Job Application Interface)
- **Related**: job-finder-BE Firebase Functions backend

---

## Resources

### Documentation

- **Firebase Functions**: https://firebase.google.com/docs/functions/callable
- **Firebase Auth Tokens**: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- **PDF Generation**: https://www.npmjs.com/package/jspdf
- **DOCX Generation**: https://www.npmjs.com/package/docx

### External References

- **React File Download**: https://www.npmjs.com/package/file-saver
- **Markdown Rendering**: https://www.npmjs.com/package/react-markdown

---

## Success Metrics

**How we'll measure success**:

- **Generation time**: Documents generated in < 10 seconds
- **Success rate**: > 95% successful generations
- **User satisfaction**: Documents require minimal manual editing
- **Download rate**: > 80% of previewed documents downloaded

---

## Notes

**Questions? Need clarification?**

- Comment on this issue with specific questions
- Tag @PM for guidance
- Reference BACKEND_MIGRATION_PLAN.md for API structure

**Implementation Tips**:

- Show progress indicator during generation (can take 5-10 seconds)
- Cache content items to avoid re-fetching on each generation
- Consider allowing users to edit generated content before download
- Save generation history for users to access later
- Implement rate limiting UI if backend has rate limits
- Add ability to regenerate with different options

---

**Created**: 2025-10-19
**Created By**: PM
**Last Updated**: 2025-10-19
**Status**: Todo
