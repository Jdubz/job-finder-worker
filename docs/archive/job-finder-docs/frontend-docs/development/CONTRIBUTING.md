# Contributing to Job Finder Frontend

Thank you for your interest in contributing to the Job Finder Frontend! This document provides guidelines and instructions for development.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Coding Standards](#coding-standards)
4. [Testing](#testing)
5. [Pull Request Process](#pull-request-process)
6. [Project Structure](#project-structure)

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Firebase CLI: `npm install -g firebase-tools`
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/Jdubz/job-finder-FE.git
cd job-finder-FE

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.development

# Start development server
npm run dev
# or
make dev
```

### Environment Variables

Create `.env.development` with the following variables:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=localhost
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_USE_EMULATORS=true
VITE_API_BASE_URL=http://localhost:5001
```

---

## Development Workflow

### Branch Strategy

We use a **feature → staging → main** workflow:

```
feature_branch → staging → main
```

### Creating a New Feature

1. **Start from staging:**

   ```bash
   git checkout staging
   git pull origin staging
   ```

2. **Create feature branch:**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make changes and commit:**

   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

4. **Push to remote:**

   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create PR to staging:**
   - Open PR on GitHub: `feature/your-feature-name` → `staging`
   - Request review
   - CI will run tests automatically

6. **After merge to staging:**
   - Staging deployment happens automatically
   - Test on `https://job-finder-staging.web.app`

7. **When ready for production:**
   - Create PR: `staging` → `main`
   - Requires approval
   - Merge triggers production deployment

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, no logic change)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

**Examples:**

```bash
feat(job-finder): add bulk job submission

fix(auth): resolve login redirect loop

docs(readme): update installation instructions

refactor(components): extract reusable button component
```

---

## Coding Standards

### TypeScript

- Use TypeScript for all new files
- Avoid `any` type - use specific types or `unknown`
- Define interfaces for component props
- Use type inference where possible

**Good:**

```typescript
interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  return <button onClick={onClick}>{label}</button>
}
```

**Bad:**

```typescript
const Button = (props: any) => {
  return <button onClick={props.onClick}>{props.label}</button>
}
```

### React Components

- Use functional components with hooks
- One component per file
- Name files with PascalCase: `ComponentName.tsx`
- Export default at the bottom

**Structure:**

```typescript
// Imports
import React from 'react'
import { useAuth } from '@/contexts/AuthContext'

// Types
interface ComponentProps {
  // ...
}

// Component
const ComponentName: React.FC<ComponentProps> = ({ prop1, prop2 }) => {
  // Hooks
  const { user } = useAuth()
  const [state, setState] = useState()

  // Handlers
  const handleClick = () => {
    // ...
  }

  // Render
  return (
    <div>
      {/* ... */}
    </div>
  )
}

// Export
export default ComponentName
```

### Styling with Tailwind

- Use Tailwind utility classes
- Use `cn()` helper for conditional classes
- Avoid inline styles
- Use consistent spacing scale

**Good:**

```typescript
import { cn } from '@/lib/utils'

<button className={cn(
  "px-4 py-2 rounded-md font-medium",
  variant === 'primary' && "bg-blue-500 text-white",
  variant === 'secondary' && "bg-gray-200 text-gray-800",
  disabled && "opacity-50 cursor-not-allowed"
)}>
  {label}
</button>
```

**Bad:**

```typescript
<button style={{
  padding: '8px 16px',
  borderRadius: '4px',
  backgroundColor: variant === 'primary' ? '#3b82f6' : '#e5e7eb'
}}>
  {label}
</button>
```

### File Organization

- Group related files in directories
- Use index files for cleaner imports
- Keep components small and focused

**Example:**

```
src/components/job-finder/
├── index.ts              # Re-exports
├── JobSubmissionForm.tsx
├── JobList.tsx
└── JobCard.tsx
```

```typescript
// src/components/job-finder/index.ts
export { JobSubmissionForm } from "./JobSubmissionForm"
export { JobList } from "./JobList"
export { JobCard } from "./JobCard"

// Usage:
import { JobSubmissionForm, JobList } from "@/components/job-finder"
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

**Component Tests:**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders with correct label', () => {
    render(<Button label="Click me" onClick={() => {}} />)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button label="Click me" onClick={handleClick} />)
    fireEvent.click(screen.getByText('Click me'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

### Code Coverage

- Aim for >80% coverage
- Focus on critical paths
- Don't test implementation details

---

## Pull Request Process

### Before Creating a PR

1. **Run tests:**

   ```bash
   npm test
   ```

2. **Run linting:**

   ```bash
   npm run lint
   ```

3. **Build successfully:**

   ```bash
   npm run build
   ```

4. **Test locally:**
   - Test all changed functionality
   - Check console for errors
   - Test on mobile viewport

### PR Template

When creating a PR, include:

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Tested locally
- [ ] Added/updated tests
- [ ] All tests passing
- [ ] Linting passes

## Screenshots (if applicable)

[Add screenshots]

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-reviewed code
- [ ] Commented complex logic
- [ ] Updated documentation
- [ ] No new warnings
```

### Review Process

1. **Automated checks:** CI runs tests and linting
2. **Code review:** At least one approval required
3. **Testing:** Test on staging deployment
4. **Merge:** Squash and merge to keep history clean

---

## Project Structure

### Adding a New Page

1. **Create page component:**

   ```typescript
   // src/pages/new-feature/NewFeaturePage.tsx
   const NewFeaturePage: React.FC = () => {
     return (
       <div>
         <h1>New Feature</h1>
       </div>
     )
   }

   export default NewFeaturePage
   ```

2. **Add route:**

   ```typescript
   // src/router.tsx
   import NewFeaturePage from '@/pages/new-feature/NewFeaturePage'

   {
     path: '/new-feature',
     element: <NewFeaturePage />
   }
   ```

3. **Add navigation link:**
   ```typescript
   // src/components/layout/Navigation.tsx
   <Link to="/new-feature">New Feature</Link>
   ```

### Adding a shadcn/ui Component

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
```

This adds the component to `src/components/ui/`.

### Adding Dependencies

**Before installing:**

- Check if dependency is necessary
- Consider bundle size impact
- Check for lighter alternatives

**Install:**

```bash
npm install package-name
npm install -D @types/package-name  # If TypeScript types needed
```

**Update documentation:**

- Add to README if user-facing
- Document usage in CLAUDE.md if development-facing

---

## Common Tasks

### Adding Environment Variable

1. **Add to `.env.example`:**

   ```env
   VITE_NEW_VARIABLE=example-value
   ```

2. **Update TypeScript types:**

   ```typescript
   // src/vite-env.d.ts
   interface ImportMetaEnv {
     readonly VITE_NEW_VARIABLE: string
   }
   ```

3. **Use in code:**

   ```typescript
   const newVariable = import.meta.env.VITE_NEW_VARIABLE
   ```

4. **Update CI/CD:**
   - Add to GitHub Actions workflows
   - Add to Firebase hosting config

### Debugging

**React DevTools:**

- Install browser extension
- Inspect component tree and props

**Redux DevTools (if using):**

- Install browser extension
- Monitor state changes

**Console Logging:**

```typescript
console.log("[ComponentName]", "Debug message", { data })
```

**Vite Dev Tools:**

- Network tab for API requests
- Sources tab for breakpoints

---

## Getting Help

- **Documentation:** See CONTEXT.md for architecture
- **Issues:** Create GitHub issue for bugs/features
- **Questions:** Ask in team chat or comments

---

## Code of Conduct

- Be respectful and professional
- Provide constructive feedback
- Focus on the code, not the person
- Ask questions if unclear
- Help others learn

---

Thank you for contributing! 🎉
