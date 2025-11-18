# Linting Setup

## Overview

This project uses ESLint with strict TypeScript rules to ensure code quality and catch bugs early.

## Configuration

### Tools

- **ESLint 9** - JavaScript/TypeScript linter
- **TypeScript ESLint** - TypeScript-specific linting rules
- **Prettier** - Code formatter
- **lint-staged** - Run linters on staged files only
- **Husky** - Git hooks manager

### Pre-commit Hook

The pre-commit hook automatically runs `lint-staged` which:

- Lints and auto-fixes all staged `.ts` and `.tsx` files
- Formats all staged files with Prettier
- **Blocks the commit if there are any lint errors** (`--max-warnings=0`)

### Pre-push Hook

The pre-push hook runs:

- `npm run type-check` - TypeScript type checking
- `npm run test:ci` - All tests

## Commands

```bash
# Lint all files
npm run lint

# Lint and auto-fix
npm run lint:fix

# Format all files
npm run format

# Check formatting
npm run format:check

# Type check
npm run type-check
```

## Rules

### Strict Rules (Errors)

- `@typescript-eslint/no-explicit-any` - No `any` types allowed
- `@typescript-eslint/no-unused-vars` - No unused variables (except those prefixed with `_`)
- `react-hooks/rules-of-hooks` - Proper hook usage
- `prefer-const` - Use `const` when possible
- `no-var` - No `var` declarations

### Warnings

- `react-hooks/exhaustive-deps` - Hook dependency warnings
- `react-refresh/only-export-components` - Fast refresh compatibility
- `@typescript-eslint/no-non-null-assertion` - Avoid `!` assertions
- `no-console` - Console logs (except `console.warn`, `console.error`, `console.log`)

## Remaining Work

As of the latest commit, there are **38 lint errors** remaining, primarily:

- `@typescript-eslint/no-explicit-any` - Files using `any` types that need proper typing
- Files: hooks, services, contexts that interact with Firestore

These should be fixed incrementally as those files are modified.

## Bypassing (Emergency Only)

```bash
# Skip pre-commit hook (NOT RECOMMENDED)
git commit --no-verify -m "message"

# Skip pre-push hook (NOT RECOMMENDED)
git push --no-verify
```

**Note:** These should only be used in emergencies. The hooks are there to maintain code quality.
