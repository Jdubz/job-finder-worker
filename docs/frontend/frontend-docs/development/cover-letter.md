# Cover Letter Generation Feature

**Last Updated**: 2025-10-20
**Owner**: Worker B
**Status**: Documented (FA-2)

---

## Overview

The Cover Letter Generation feature allows users to create AI-powered, customized cover letters tailored to specific job applications. The feature integrates with the Job Finder system to pull job details and generate personalized letters using OpenAI or Gemini models.

---

## User Flow

### 1. Access Document Builder

**Entry Points**:
- Navigate to `/document-builder` directly
- Click "Generate Cover Letter" from Job Applications page
- Select from navigation menu

### 2. Select Document Type

User chooses between:
- **Resume**: AI-generated resume
- **Cover Letter**: AI-generated cover letter (this flow)

### 3. Provide Job Information

**Option A: Select from Job Matches**
- Dropdown shows recent high-quality job matches (score ≥ 70)
- Auto-populates: Job Title, Company Name, Job Description

**Option B: Manual Entry**
- Manually enter: Job Title, Company Name
- Optional: Job Description, Job URL

### 4. Customize (Optional)

**Target Summary**: Brief customization prompt
- Example: "Emphasize my cloud architecture experience"
- Guides AI to focus on specific aspects

### 5. Generate

- Click "Generate Cover Letter" button
- Backend calls AI service (OpenAI/Gemini)
- Document generated and saved to history

### 6. View Results

**Success**:
- Success message displayed
- Document added to history
- Can view/download generated PDF/Markdown

**Error**:
- Error message displayed with details
- User can retry with adjustments

---

## Technical Implementation

### API Endpoint

**Endpoint**: `POST /manageGenerator`

**Base URL** (from `src/config/api.ts`):
- Development: `http://localhost:5001/job-finder-dev/us-central1`
- Staging: `https://us-central1-static-sites-257923.cloudfunctions.net`
  - Function: `manageGenerator-staging`
- Production: `https://us-central1-static-sites-257923.cloudfunctions.net`
  - Function: `manageGenerator`

### Request Payload

```typescript
interface GenerateDocumentRequest {
  type: "cover_letter"                 // Document type
  jobMatchId?: string                  // Optional: Link to job match
  jobUrl?: string                      // Optional: Original job posting URL
  jobTitle?: string                    // Required: Job title
  companyName?: string                 // Required: Company name
  jobDescription?: string              // Optional: Job description text
  customization?: {
    targetSummary?: string             // Optional: Customization prompt
    skillsPriority?: string[]          // Optional: Skills to emphasize
    experienceHighlights?: Array<{     // Optional: Experience to highlight
      company: string
      title: string
      pointsToEmphasize: string[]
    }>
    projectsToInclude?: Array<{        // Optional: Projects to include
      name: string
      whyRelevant: string
      pointsToHighlight: string[]
    }>
  }
  preferences?: {
    provider?: "openai" | "gemini"     // AI provider
    tone?: string                      // Tone preference
    includeProjects?: boolean          // Include projects section
  }
}
```

### Example Request

```json
{
  "type": "cover_letter",
  "jobTitle": "Senior Frontend Engineer",
  "companyName": "Acme Corp",
  "jobDescription": "We are seeking a talented frontend developer...",
  "customization": {
    "targetSummary": "Emphasize my React and TypeScript expertise"
  }
}
```

### Response

```typescript
interface GenerateDocumentResponse {
  success: boolean
  message: string
  documentUrl?: string      // URL to generated document
  documentId?: string       // Document ID for history
  generationId?: string     // Generation tracking ID
  error?: string            // Error message if failed
}
```

### Example Response (Success)

```json
{
  "success": true,
  "message": "Cover letter generated successfully",
  "documentUrl": "https://storage.googleapis.com/..../cover-letter.pdf",
  "documentId": "doc_abc123",
  "generationId": "gen_xyz789"
}
```

### Example Response (Error)

```json
{
  "success": false,
  "error": "Failed to generate cover letter: API rate limit exceeded",
  "message": "Generation failed"
}
```

---

## Components

### Main Components

| Component | File | Purpose |
|-----------|------|---------|
| **DocumentBuilderPage** | `src/pages/document-builder/DocumentBuilderPage.tsx` | Main page container |
| **DocumentHistoryList** | `src/pages/document-builder/components/DocumentHistoryList.tsx` | Shows generation history |

### API Client

| Client | File | Purpose |
|--------|------|---------|
| **GeneratorClient** | `src/api/generator-client.ts` | API client for generation |
| **BaseApiClient** | `src/api/base-client.ts` | Base HTTP client with auth |

---

## Required Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_FIREBASE_*` | Firebase authentication | (See `.env.template`) |
| `VITE_API_BASE_URL` | Cloud Functions base URL | Auto-configured by `src/config/api.ts` |

No additional variables required - all covered by standard configuration.

---

## State Management

### Component State

```typescript
const [documentType, setDocumentType] = useState<"resume" | "cover_letter">("resume")
const [selectedJobMatchId, setSelectedJobMatchId] = useState<string>("")
const [customJobTitle, setCustomJobTitle] = useState("")
const [customCompanyName, setCustomCompanyName] = useState("")
const [customJobDescription, setCustomJobDescription] = useState("")
const [targetSummary, setTargetSummary] = useState("")
const [loading, setLoading] = useState(false)
const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
```

### Validation Rules

- **Job Title**: Required
- **Company Name**: Required
- **Job Description**: Optional but recommended
- **Target Summary**: Optional
- **User Authentication**: Required (must be logged in)

---

## Error Handling

### Frontend Validation

```typescript
// src/pages/document-builder/DocumentBuilderPage.tsx:104-107
if (!customJobTitle || !customCompanyName) {
  setAlert({ type: "error", message: "Job title and company name are required" })
  return
}
```

### API Error Handling

```typescript
// src/pages/document-builder/DocumentBuilderPage.tsx:147-152
catch (error) {
  console.error("Generation error:", error)
  setAlert({
    type: "error",
    message: error instanceof Error ? error.message : "Failed to generate document",
  })
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "You must be logged in" | Not authenticated | User must sign in |
| "Job title and company name are required" | Missing required fields | Fill in required fields |
| "Failed to generate document" | API error | Check network, retry |
| "API rate limit exceeded" | Too many requests | Wait and retry |
| Network error | No internet / API down | Check connection, verify API is deployed |

---

## Testing

### Manual Testing Checklist

**Prerequisites**:
- [ ] Logged in as authenticated user
- [ ] Environment variables configured (`.env.development`)
- [ ] Backend functions deployed (staging/production)

**Test Cases**:

1. **Basic Cover Letter Generation**
   - [ ] Navigate to Document Builder
   - [ ] Select "Cover Letter" type
   - [ ] Enter job title: "Senior Frontend Developer"
   - [ ] Enter company name: "Test Company"
   - [ ] Click "Generate Cover Letter"
   - [ ] Verify success message appears
   - [ ] Verify document appears in history

2. **With Job Match**
   - [ ] Go to Job Applications
   - [ ] Click "Generate Cover Letter" on a match
   - [ ] Verify fields auto-populated
   - [ ] Click "Generate Cover Letter"
   - [ ] Verify success

3. **With Customization**
   - [ ] Enter job details
   - [ ] Add target summary: "Emphasize leadership experience"
   - [ ] Generate
   - [ ] Verify document reflects customization

4. **Validation Errors**
   - [ ] Leave job title empty
   - [ ] Click generate
   - [ ] Verify error: "Job title and company name are required"
   - [ ] Fill in title only
   - [ ] Click generate
   - [ ] Verify same error

5. **Unauthenticated User**
   - [ ] Sign out
   - [ ] Try to generate
   - [ ] Verify error: "You must be logged in"

### Automated Testing

**Location**: `src/__tests__/document-builder/`

**Test Files** (to be created in FA-2):
- `coverLetter.test.tsx` - Component tests
- `generatorClient.test.ts` - API client tests

**Commands**:
```bash
# Run all tests
npm test

# Run cover letter tests specifically
npm test cover-letter

# Run with coverage
npm run test:coverage
```

---

## Troubleshooting

### Issue: "Failed to generate document"

**Possible Causes**:
1. Backend function not deployed
2. Wrong API URL
3. Authentication token expired
4. API rate limit

**Debug Steps**:
```bash
# 1. Check API URL in browser console
# Should see: https://us-central1-static-sites-257923.cloudfunctions.net/manageGenerator-staging

# 2. Test function manually
curl -I https://us-central1-static-sites-257923.cloudfunctions.net/manageGenerator-staging
# Should return: 401 (means function exists, auth required)

# 3. Check browser console for detailed error

# 4. Verify environment
npm run check:env
```

### Issue: Form Fields Empty After Selection

**Cause**: State not updating
**Solution**: Check console for errors, ensure job match has required fields

### Issue: Generation Takes Too Long

**Normal**: 10-30 seconds for AI generation
**Too Long**: > 60 seconds

**Debug**:
1. Check network tab - is request pending?
2. Check backend logs (if accessible)
3. Try again - may be temporary API slowdown

---

## Development Guide

### Adding New Fields

1. **Add State**:
```typescript
const [newField, setNewField] = useState("")
```

2. **Add to UI**:
```tsx
<Input
  value={newField}
  onChange={(e) => setNewField(e.target.value)}
/>
```

3. **Include in Request**:
```typescript
const request: GenerateDocumentRequest = {
  // ... existing fields
  newField: newField || undefined,
}
```

### Customizing Generation

**Modify**: `customization` object in request

```typescript
customization: {
  targetSummary: "...",
  skillsPriority: ["React", "TypeScript", "AWS"],
  experienceHighlights: [{
    company: "Previous Company",
    title: "Senior Developer",
    pointsToEmphasize: ["Led team of 5", "Deployed to 1M users"]
  }]
}
```

---

## Performance Considerations

### Generation Time

- **Average**: 15-20 seconds
- **Range**: 10-45 seconds (depends on AI API response time)

### Optimization

- Request is asynchronous (doesn't block UI)
- Loading indicator shown during generation
- History refreshes automatically on success

---

## Security

### Authentication

- **Required**: User must be authenticated
- **Token**: Sent via `Authorization: Bearer <token>` header
- **Validation**: Backend validates Firebase Auth token

### Data Privacy

- Cover letters stored in user's Firebase account
- Only accessible to authenticated user
- Documents can be deleted from history

---

## Future Enhancements

Potential improvements (not in scope for FA-2):

1. **Real-time Preview**: Show cover letter as it's being generated
2. **Template Selection**: Choose from different cover letter styles
3. **Batch Generation**: Generate multiple versions
4. **Version History**: Track edits to generated letters
5. **Export Formats**: PDF, DOCX, plain text
6. **AI Provider Selection**: Let users choose OpenAI vs Gemini

---

## Related Documentation

- [Environment Troubleshooting](../environment-troubleshooting.md)
- [Environment Verification Matrix](../environment-verification-matrix.md)
- [API Configuration](../architecture/BACKEND_MIGRATION_PLAN.md)
- [README - Environment Variables](../../README.md#environment-variables)

---

## Verification Status

**Last Verified**: 2025-10-20 (FA-2)

| Environment | Status | Notes |
|-------------|--------|-------|
| Development | ⏳ Pending | Requires emulators + backend |
| Staging | ⏳ Pending | Backend deployed, needs frontend test |
| Production | ⏳ Pending | Ready for production cutover |

See FA-2 issue for complete verification checklist.
