# Firestore Schema Documentation

This document describes the complete Firestore database schema for the portfolio project, codified as TypeScript interfaces in the shared-types package.

**Schema Source:** Production database (portfolio)  
**Extracted:** October 21, 2025  
**Package Version:** 1.2.0+

## Overview

The Firestore schema types provide a single source of truth for all database collections and their document structures. These types are automatically extracted from the production database to ensure accuracy.

## Collections

### 1. job-queue

**Collection:** `job-queue`  
**Document Type:** `QueueItemDocument`

Stores items in the job processing queue, tracking their status through the scraping and analysis pipeline.

**Key Fields:**
- `type`: `QueueItemDocumentType` - Type of queue item (job | company)
- `status`: `QueueItemDocumentStatus` - Processing status (pending | processing | success | failed | skipped)
- `url`: `string` - URL of the job or company page
- `company_name`: `string` - Company name
- `source`: `QueueDocumentSource` - Origin of the queue item
- `retry_count`: `number` - Number of retry attempts
- `max_retries`: `number` - Maximum retries allowed
- `created_at`: `TimestampLike` - Creation timestamp
- `updated_at`: `TimestampLike` - Last update timestamp

**Optional Fields:**
- `processed_at`: Processing start time
- `completed_at`: Processing completion time
- `result_message`: Result description
- `error_details`: Error information if failed
- `submitted_by`: User ID who submitted
- `company_id`: Reference to company document
- `metadata`: Additional metadata

**Usage:**
```typescript
import { QueueItemDocument, isQueueItemDocument } from '@shared/types'

// Reading from Firestore
const doc = await firestore.collection('job-queue').doc(id).get()
const data = doc.data()

if (isQueueItemDocument(data)) {
  console.log(`Status: ${data.status}`)
  console.log(`URL: ${data.url}`)
}
```

### 2. companies

**Collection:** `companies`  
**Document Type:** `CompanyDocument`

Stores company information including metadata, priority scoring, and technology stack.

**Key Fields:**
- `name`: `string` - Company name
- `name_lower`: `string` - Lowercase name for case-insensitive queries
- `website`: `string` - Company website URL
- `about`: `string` - Company description
- `culture`: `string` - Culture information
- `mission`: `string` - Mission statement
- `tier`: `CompanyTier` - Priority tier (S | A | B | C | D)
- `priorityScore`: `number` - Calculated priority score
- `techStack`: `string[]` - Technologies used
- `hasPortlandOffice`: `boolean` - Portland office flag
- `createdAt`: `TimestampLike` - Creation timestamp
- `updatedAt`: `TimestampLike` - Last update timestamp

**Optional Fields:**
- `size`: Company size
- `company_size_category`: Size category
- `founded`: Founding year/date
- `headquarters_location`: HQ location
- `industry`: Industry classification

**Usage:**
```typescript
import { CompanyDocument, isCompanyDocument } from '@shared/types'

// Query by tier
const companies = await firestore
  .collection('companies')
  .where('tier', '==', 'S')
  .get()

companies.forEach(doc => {
  const data = doc.data()
  if (isCompanyDocument(data)) {
    console.log(`${data.name} (${data.tier}): ${data.priorityScore}`)
  }
})
```

### 3. content-items

**Collection:** `content-items`  
**Document Type:** `ContentItemDocument`

Stores portfolio content items with hierarchical structure and multiple content types.

**Base Fields (All Content Items):**
- `type`: `ContentItemDocumentType` - Content type
- `order`: `number` - Display order
- `visibility`: `ContentItemDocumentVisibility` - Visibility status (published | draft | archived)
- `parentId`: `string | null` - Parent item ID for hierarchy
- `createdAt`: `TimestampLike` - Creation timestamp
- `updatedAt`: `TimestampLike` - Last update timestamp
- `createdBy`: `string` - Creator user ID
- `updatedBy`: `string` - Last updater user ID

**Content Item Types:**

#### CompanyContentItemDocument
Work experience / employment entry

**Additional Fields:**
- `company`: `string` - Company name
- `role`: `string` - Job title/role
- `location`: `string` - Work location
- `startDate`: `string` - Start date (YYYY-MM)
- `endDate`: `string` - End date (YYYY-MM or 'present')
- `summary`: `string?` - Role summary
- `accomplishments`: `string[]?` - List of accomplishments
- `notes`: `string?` - Additional notes

#### ProjectContentItemDocument
Project entry

**Additional Fields:**
- `name`: `string` - Project name
- `description`: `string` - Project description
- `technologies`: `string[]?` - Technologies used

#### SkillGroupContentItemDocument
Skills category

**Additional Fields:**
- `category`: `string` - Category name
- `skills`: `string[]` - List of skills
- `subcategories`: `Array<{name: string, skills: string[]}>?` - Nested categories

#### TextSectionContentItemDocument
Text/markdown content section

**Additional Fields:**
- `heading`: `string` - Section heading
- `content`: `string` - Markdown content
- `format`: `'markdown' | 'html' | 'plain'` - Content format

#### ProfileSectionContentItemDocument
Profile overview section with structured data

**Additional Fields:**
- `heading`: `string` - Section heading
- `content`: `string` - Markdown content
- `format`: `'markdown' | 'html' | 'plain'` - Content format
- `structuredData`: Structured profile information
  - `role`: Job role
  - `summary`: Professional summary
  - `tagline`: Profile tagline
  - `primaryStack`: Primary technologies
  - `links`: Array of links with labels and URLs

**Usage:**
```typescript
import { 
  ContentItemDocument, 
  CompanyContentItemDocument,
  isContentItemDocument 
} from '@shared/types'

// Query by type and order
const items = await firestore
  .collection('content-items')
  .where('type', '==', 'company')
  .where('visibility', '==', 'published')
  .orderBy('order', 'asc')
  .get()

items.forEach(doc => {
  const data = doc.data()
  if (isContentItemDocument(data) && data.type === 'company') {
    const company = data as CompanyContentItemDocument
    console.log(`${company.company} - ${company.role}`)
  }
})
```

### 4. contact-submissions

**Collection:** `contact-submissions`  
**Document Type:** `ContactSubmissionDocument`

Stores contact form submissions with email transaction tracking and telemetry.

**Key Fields:**
- `name`: `string` - Submitter name
- `email`: `string` - Submitter email
- `message`: `string` - Message content
- `status`: `'new' | 'read' | 'replied' | 'archived'` - Submission status
- `requestId`: `string` - Request ID for tracing
- `traceId`: `string` - OpenTelemetry trace ID
- `spanId`: `string` - OpenTelemetry span ID
- `metadata`: Submission metadata
  - `timestamp`: ISO timestamp
  - `ip`: Client IP address
  - `userAgent`: Client user agent
  - `referrer?`: Referrer URL
- `createdAt`: `TimestampLike` - Creation timestamp
- `updatedAt`: `TimestampLike` - Last update timestamp

**Optional Fields:**
- `transaction`: Email transaction details
  - `contactEmail`: Contact email result
  - `autoReply`: Auto-reply email result
  - `errors`: Transaction errors
- `mailgun`: Legacy Mailgun response

**Usage:**
```typescript
import { ContactSubmissionDocument } from '@shared/types'

// Query new submissions
const submissions = await firestore
  .collection('contact-submissions')
  .where('status', '==', 'new')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get()

submissions.forEach(doc => {
  const data = doc.data() as ContactSubmissionDocument
  console.log(`From: ${data.name} <${data.email}>`)
  console.log(`Message: ${data.message}`)
})
```

### 5. users

**Collection:** `users`  
**Document Type:** `UserDocument`

User authentication and profile information.

**Note:** This collection was empty at time of schema extraction. Type definition is based on expected Firebase Auth user structure.

**Key Fields:**
- `email`: `string` - User email
- `createdAt`: `TimestampLike` - Account creation time

**Optional Fields:**
- `displayName`: Display name
- `photoURL`: Profile photo URL
- `emailVerified`: Email verification status
- `role`: User role/permissions
- `lastLoginAt`: Last login timestamp
- `metadata`: Additional user metadata

### 6. config

**Collection:** `config`  
**Document Type:** `ConfigDocument`

Application configuration documents.

**Note:** This collection was empty at time of schema extraction. Type definition is a generic config structure.

**Key Fields:**
- `key`: `string` - Config key/identifier
- `value`: `Record<string, unknown>` - Config value (flexible structure)
- `createdAt`: `TimestampLike` - Creation timestamp
- `updatedAt`: `TimestampLike` - Last update timestamp

**Optional Fields:**
- `updatedBy`: User ID who last updated

**Common Config Documents:**
- `stopList`: Job filtering exclusion list
- `aiSettings`: AI provider configuration
- `queueSettings`: Queue processing settings

## Type Guards

All Firestore schema types include runtime validation guards:

```typescript
import { 
  isQueueItemDocument,
  isCompanyDocument,
  isContentItemDocument,
  isContactSubmissionDocument,
  isUserDocument,
  isConfigDocument 
} from '@shared/types'

// Example: Validating Firestore data
const doc = await firestore.collection('companies').doc(id).get()
const data = doc.data()

if (isCompanyDocument(data)) {
  // TypeScript knows data is CompanyDocument here
  console.log(`${data.name} - Tier ${data.tier}`)
}
```

## Keeping Schema in Sync

To update the schema types when the database structure changes:

1. Run the schema extraction script:
   ```bash
   node scripts/extract-firestore-schema.js
   ```

2. Review the extracted schema in `firestore-schema-extracted.json`

3. Update TypeScript interfaces in `src/firestore-schema.types.ts`

4. Update type guards in `src/firestore-schema.guards.ts`

5. Test the build:
   ```bash
   npm run build
   npm test
   ```

6. Update package version and publish:
   ```bash
   npm version minor
   git push && git push --tags
   ```

## Notes

- All timestamp fields use `TimestampLike` type which accepts both `Date` and Firestore `Timestamp` objects
- Optional fields are marked with `?` in TypeScript interfaces
- Nullable fields are explicitly typed as `type | null`
- Empty string values in production are represented as `string` type
- Array fields may be empty arrays (`[]`)

## See Also

- [Type Guards](../README.md#type-guards) - Runtime validation examples
- [TypeScript → Python Mapping](../README.md#type-mapping) - Pydantic model examples
- [Integration Architecture](../README.md#integration-architecture) - How types flow through the system

