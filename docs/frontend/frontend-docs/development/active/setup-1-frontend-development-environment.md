# SETUP-1 — Frontend Development Environment

> **Context**: See [CLAUDE.md](../../CLAUDE.md) for project overview, tech stack, and development environment
> **Architecture**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui

---

## Issue Metadata

```yaml
Title: SETUP-1 — Frontend Development Environment
Labels: priority-p2, repository-frontend, type-setup, status-todo
Assignee: Worker B
Priority: P2-Medium
Estimated Effort: 2-4 hours
Repository: job-finder-FE
```

---

## Summary

**Problem**: The frontend development environment needs to be configured with all necessary dependencies, linting, formatting, and development tools to ensure consistent code quality and developer experience.

**Goal**: Set up a complete React/TypeScript frontend environment that's ready for feature development.

**Impact**: Enables all frontend development work with proper tooling, type safety, and code quality enforcement.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[CLAUDE.md](../../CLAUDE.md)** - Complete project overview, commands, architecture patterns
- **Project Structure** - src/ layout with components, pages, contexts
- **Tech Stack** - React 18, TypeScript, Vite, Tailwind, shadcn/ui

---

## Tasks

### Phase 1: Initialize Project

1. **Create Vite + React + TypeScript project**
   - What: Set up base project with Vite
   - Where: Root directory
   - Why: Vite provides fast HMR and optimized builds
   - Test: `npm run dev` starts dev server on port 5173

2. **Configure TypeScript**
   - What: Set up tsconfig.json with strict mode and path aliases
   - Where: `tsconfig.json`, `vite.config.ts`
   - Why: Type safety and clean imports (@/ alias)
   - Test: No TypeScript errors in IDE

### Phase 2: Install Dependencies

3. **Install core dependencies**
   - What: React Router v7, Firebase SDK, Tailwind CSS
   - Where: `package.json`
   - Why: Core functionality for routing, backend, and styling
   - Test: `npm install` completes without errors

4. **Install UI library**
   - What: shadcn/ui components (button, card, dialog, etc.)
   - Where: `src/components/ui/`
   - Why: Consistent, accessible UI components
   - Test: Components render correctly

### Phase 3: Configure Tooling

5. **Set up ESLint and Prettier**
   - What: Configure linting and formatting rules
   - Where: `.eslintrc.js`, `.prettierrc`
   - Why: Code quality and consistency
   - Test: `npm run lint` passes

6. **Configure Tailwind CSS**
   - What: Set up Tailwind with custom theme
   - Where: `tailwind.config.js`, `src/index.css`
   - Why: Utility-first styling system
   - Test: Tailwind classes work in components

### Phase 4: Development Scripts

7. **Create npm scripts**
   - What: dev, build, preview, lint, test scripts
   - Where: `package.json`
   - Why: Standardized development commands
   - Test: All scripts execute successfully

8. **Create Makefile**
   - What: Shorthand commands for common tasks
   - Where: `Makefile`
   - Why: Easier command execution
   - Test: `make dev`, `make build`, `make lint` work

---

## Technical Details

### Files to Create

```
CREATE:
- package.json - Dependencies and scripts
- tsconfig.json - TypeScript configuration
- vite.config.ts - Vite configuration
- tailwind.config.js - Tailwind configuration
- .eslintrc.js - ESLint rules
- .prettierrc - Prettier configuration
- Makefile - Development commands
- .env.example - Environment variables template
- src/index.css - Global styles + Tailwind imports
- src/main.tsx - Application entry point
- src/App.tsx - Root component
- src/router.tsx - Route definitions
- src/components/ui/ - shadcn/ui components
- src/lib/utils.ts - Utility functions (cn helper)
```

### Key Implementation Notes

**Vite Configuration**:

```typescript
// vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
})
```

**Package.json Scripts**:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "type-check": "tsc --noEmit"
  }
}
```

---

## Acceptance Criteria

- [ ] **Vite dev server runs**: `npm run dev` starts on port 5173
- [ ] **Build succeeds**: `npm run build` creates production bundle
- [ ] **TypeScript strict mode**: No type errors with strict: true
- [ ] **Linting passes**: `npm run lint` succeeds
- [ ] **Tailwind working**: Utility classes render correctly
- [ ] **shadcn/ui components**: Can add and use UI components
- [ ] **Path aliases work**: @/ imports resolve correctly
- [ ] **Environment variables**: .env.example documents all vars

---

## Testing

### Test Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint

# Type check
npm run type-check
```

### Manual Testing

```bash
# Step 1: Verify dev server
npm run dev
# Visit http://localhost:5173
# Should see React app

# Step 2: Test hot reload
# Edit src/App.tsx
# Changes should reflect immediately

# Step 3: Test build
npm run build
npm run preview
# Should see production build
```

---

## Commit Message Template

```
feat(setup): configure frontend development environment

Set up complete React/TypeScript development environment with Vite,
Tailwind CSS, shadcn/ui, ESLint, and Prettier. Includes path aliases,
development scripts, and Makefile for standardized workflows.

Key changes:
- Initialize Vite + React + TypeScript project
- Configure Tailwind CSS with custom theme
- Set up ESLint and Prettier for code quality
- Add shadcn/ui component library
- Create development scripts and Makefile
- Configure path aliases (@/ for src/)

Testing:
- npm run dev starts dev server successfully
- npm run build creates production bundle
- npm run lint passes all checks
- Tailwind classes render correctly

Closes #4
```

---

## Related Issues

- **Blocks**: All other frontend development issues (authentication, pages, features)

---

## Resources

### Documentation

- **Vite**: https://vitejs.dev/
- **React**: https://react.dev/
- **Tailwind CSS**: https://tailwindcss.com/
- **shadcn/ui**: https://ui.shadcn.com/
- **TypeScript**: https://www.typescriptlang.org/

---

## Success Metrics

**How we'll measure success**:

- Dev server starts in < 5 seconds
- Hot reload updates in < 1 second
- Production build completes in < 30 seconds
- Zero TypeScript errors with strict mode
- Zero ESLint errors

---

**Created**: 2025-10-19
**Created By**: PM
**Last Updated**: 2025-10-19
**Status**: Todo
