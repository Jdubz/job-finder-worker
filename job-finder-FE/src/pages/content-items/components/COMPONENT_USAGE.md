# Content Item List Components

This directory contains list components for displaying different content item types in the job-finder application.

## Components

### 1. CompanyList

**File:** `CompanyList.tsx`
**Purpose:** Display company/employer work experience items
**Icon:** Building2 (blue)
**Features:**

- Company name with website link
- Role and date range display
- Location information
- Summary and accomplishments
- Technologies used
- Nested project support with expandable view
- Edit/delete actions

### 2. ProjectList

**File:** `ProjectList.tsx`
**Purpose:** Display project items with detailed information
**Icon:** Folder (purple)
**Features:**

- Project name and role
- Date range display
- Description and context
- Technologies with badges
- External links support
- Expandable accomplishments section
- Expandable challenges section
- Edit/delete actions

### 3. SkillGroupList

**File:** `SkillGroupList.tsx`
**Purpose:** Display skill groups with proficiency levels
**Icon:** GraduationCap (green)
**Features:**

- Category-based organization
- Skills with proficiency badges (expert, advanced, intermediate, beginner)
- Visual proficiency indicators (star icons)
- Color-coded proficiency levels
- Nested subcategories support
- Proficiency legend
- Edit/delete actions

**Proficiency Levels:**

- Expert: Yellow star (filled)
- Advanced: Blue star (filled)
- Intermediate: Blue half-star
- Beginner: Gray circle

### 4. EducationList

**File:** `EducationList.tsx`
**Purpose:** Display education and certification items
**Icon:** GraduationCap (indigo)
**Features:**

- Institution name
- Degree and field of study
- Date range and location
- Honors display
- Description text
- Relevant courses with badges
- Credential information (ID, URL, expiration)
- Expired credential warning
- Edit/delete actions

### 5. ProfileSectionList

**File:** `ProfileSectionList.tsx`
**Purpose:** Display profile sections with structured data
**Icon:** User (teal)
**Features:**

- Section heading
- Content display (supports whitespace formatting)
- Expandable structured data view
- Name, tagline, role display
- Summary text
- Primary technology stack
- External links
- Edit/delete actions

## Usage Example

```tsx
import {
  CompanyList,
  ProjectList,
  SkillGroupList,
  EducationList,
  ProfileSectionList,
} from "@/pages/content-items/components"
import type { ContentItemWithChildren } from "@/types/content-items"
import { logger } from "@/services/logging"

function MyContentPage() {
  const handleEdit = (item: ContentItemWithChildren) => {
    // Open edit dialog
    logger.info("database", "processing", `Edit content item: ${item.id}`, {
      details: { itemType: item.type, itemId: item.id },
    })
  }

  const handleDelete = (id: string) => {
    // Delete item
    logger.info("database", "processing", `Delete content item: ${id}`, {
      details: { itemId: id },
    })
  }

  return (
    <div className="space-y-8">
      <section>
        <h2>Work Experience</h2>
        <CompanyList items={companyItems} onEdit={handleEdit} onDelete={handleDelete} />
      </section>

      <section>
        <h2>Projects</h2>
        <ProjectList items={projectItems} onEdit={handleEdit} onDelete={handleDelete} />
      </section>

      <section>
        <h2>Skills</h2>
        <SkillGroupList items={skillGroupItems} onEdit={handleEdit} onDelete={handleDelete} />
      </section>

      <section>
        <h2>Education</h2>
        <EducationList items={educationItems} onEdit={handleEdit} onDelete={handleDelete} />
      </section>

      <section>
        <h2>Profile</h2>
        <ProfileSectionList
          items={profileSectionItems}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </section>
    </div>
  )
}
```

## Common Props Interface

All list components share the same props interface:

```typescript
interface ListComponentProps {
  items: ContentItemWithChildren[] // Array of items to display
  onEdit: (item: ContentItemWithChildren) => void // Edit callback
  onDelete: (id: string) => void // Delete callback
}
```

## Empty States

Each component includes a custom empty state with:

- Relevant icon (12x12)
- Descriptive heading
- Helpful message
- Dashed border styling

## Styling Patterns

All components follow these consistent patterns:

1. **Card Layout**: Each item is a Card with CardHeader and CardContent
2. **Icon Colors**: Each type has a distinctive color
3. **Action Buttons**: Edit and Delete buttons in the top-right corner
4. **Badges**: Used for technologies, tags, visibility, and skills
5. **Expandable Sections**: Chevron icons for collapsible content
6. **Date Formatting**: Uses `date-fns` for consistent date display
7. **Spacing**: Consistent gap spacing (4 units between cards)

## Dependencies

Required packages:

- `@/components/ui/button`
- `@/components/ui/card`
- `@/components/ui/badge`
- `lucide-react` (icons)
- `date-fns` (date formatting)
- `@/types/content-items` (TypeScript types)

## Color Scheme

- Companies: Blue (#2563eb)
- Projects: Purple (#9333ea)
- Skills: Green (#16a34a)
- Education: Indigo (#4f46e5)
- Profile: Teal (#0d9488)
- Expert Skills: Yellow (#eab308)
- Advanced Skills: Blue (#3b82f6)
- Intermediate Skills: Light Blue (#60a5fa)
- Beginner Skills: Gray (#9ca3af)
- Accomplishments: Green (#16a34a)
- Challenges: Orange (#ea580c)
- Honors: Amber (#d97706)

## Accessibility

All components include:

- Semantic HTML structure
- ARIA-friendly button labels
- Keyboard navigation support
- Proper heading hierarchy
- External link safety (`rel="noopener noreferrer"`)
- Icon-only buttons with context

## Type Safety

All components are fully typed with TypeScript:

- Props interfaces defined
- Type guards for specific content item types
- Type-safe callbacks
- Proper union type handling
