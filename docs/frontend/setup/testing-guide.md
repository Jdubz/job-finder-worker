# Frontend Testing Guide

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Overview

This guide covers comprehensive unit testing for job-finder-bot React components. Currently, there are no unit tests for components - only E2E tests exist, leaving component logic untested.

## Context

**Current State**:

- E2E tests exist (Playwright)
- No unit tests for React components
- No tests for hooks or utilities
- No component behavior testing
- **Result**: Cannot verify component logic works correctly

**Impact**:

- Component bugs only caught in E2E tests (slow)
- Cannot test edge cases easily
- Refactoring is risky (no safety net)
- Cannot verify component props/state behavior
- Slow feedback loop for developers

## Test Structure

```
job-finder-FE/
├── src/
│   ├── components/
│   │   ├── ServiceCard.tsx
│   │   ├── ServiceCard.test.tsx        # Unit tests
│   │   ├── ServiceGrid.tsx
│   │   ├── ServiceGrid.test.tsx
│   │   └── ...
│   ├── hooks/
│   │   ├── useApi.ts
│   │   ├── useApi.test.ts
│   │   └── ...
│   ├── services/
│   │   ├── api.ts
│   │   ├── api.test.ts
│   │   └── ...
│   └── utils/
│       ├── helpers.ts
│       └── helpers.test.ts
├── tests/
│   ├── setup.ts                        # Test setup
│   └── mocks/
│       ├── handlers.ts                 # MSW handlers
│       └── server.ts                   # MSW server
└── vitest.config.ts
```

## Setup Procedures

### 1. Install Testing Dependencies

```bash
cd job-finder-FE
npm install --save-dev \
  vitest \
  @vitest/ui \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jsdom \
  msw \
  @vitest/coverage-v8
```

### 2. Configure Vitest

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.test.{ts,tsx}",
        "**/*.config.{ts,js}",
        "**/main.tsx",
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 3. Create Test Setup File

Create `tests/setup.ts`:

```typescript
import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

### 4. Add Test Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:run": "vitest run"
  }
}
```

## Component Tests

### Example: ServiceCard Component

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ServiceCard from './ServiceCard';
import { Service, ServiceStatus } from '../types';

const mockService: Service = {
  id: 'frontend',
  name: 'Frontend Dev Server',
  status: 'stopped',
  port: 5174,
  command: 'npm run dev',
};

describe('ServiceCard', () => {
  it('renders service name', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText('Frontend Dev Server')).toBeInTheDocument();
  });

  it('displays stopped status badge', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('shows start button when service is stopped', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('calls onStart when start button clicked', () => {
    const onStart = vi.fn();
    render(<ServiceCard service={mockService} onStart={onStart} />);

    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);

    expect(onStart).toHaveBeenCalledWith('frontend');
  });

  it('shows stop button when service is running', () => {
    const runningService = { ...mockService, status: 'running' as ServiceStatus };
    render(<ServiceCard service={runningService} />);

    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('displays port number when provided', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText(/5174/)).toBeInTheDocument();
  });

  it('shows loading state when status is starting', () => {
    const startingService = { ...mockService, status: 'starting' as ServiceStatus };
    render(<ServiceCard service={startingService} />);

    expect(screen.getByText('Starting...')).toBeInTheDocument();
  });
});
```

### Example: StatusBadge Component

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';
import { ServiceStatus } from '../types';

describe('StatusBadge', () => {
  it('renders running status with green color', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('Running');
    expect(badge).toHaveClass('bg-green-500');
  });

  it('renders stopped status with gray color', () => {
    render(<StatusBadge status="stopped" />);
    const badge = screen.getByText('Stopped');
    expect(badge).toHaveClass('bg-gray-500');
  });

  it('renders error status with red color', () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText('Error');
    expect(badge).toHaveClass('bg-red-500');
  });

  it('renders starting status with yellow color', () => {
    render(<StatusBadge status="starting" />);
    const badge = screen.getByText('Starting...');
    expect(badge).toHaveClass('bg-yellow-500');
  });
});
```

## API Client Tests with MSW

### Example: API Service Tests

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { rest } from "msw";
import { startService, stopService, getServiceStatus } from "./api";

const API_URL = "http://localhost:5000/api";

// Mock API server
const server = setupServer(
  rest.post(`${API_URL}/processes/:id/start`, (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),
  rest.post(`${API_URL}/processes/:id/stop`, (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  }),
  rest.get(`${API_URL}/processes/:id`, (req, res, ctx) => {
    return res(
      ctx.json({
        id: req.params.id,
        status: "running",
        port: 5174,
      }),
    );
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("API Client", () => {
  describe("startService", () => {
    it("sends POST request to start endpoint", async () => {
      const result = await startService("frontend");
      expect(result.success).toBe(true);
    });

    it("throws error on network failure", async () => {
      server.use(
        rest.post(`${API_URL}/processes/:id/start`, (req, res, ctx) => {
          return res.networkError("Failed to connect");
        }),
      );

      await expect(startService("frontend")).rejects.toThrow();
    });

    it("throws error on 500 response", async () => {
      server.use(
        rest.post(`${API_URL}/processes/:id/start`, (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: "Internal error" }));
        }),
      );

      await expect(startService("frontend")).rejects.toThrow();
    });
  });

  describe("getServiceStatus", () => {
    it("fetches service status", async () => {
      const status = await getServiceStatus("frontend");
      expect(status.id).toBe("frontend");
      expect(status.status).toBe("running");
    });

    it("returns correct port number", async () => {
      const status = await getServiceStatus("frontend");
      expect(status.port).toBe(5174);
    });
  });
});
```

## Implementation Strategy

### Phase 1: Infrastructure (0.5 days)

- Set up Vitest and React Testing Library
- Configure test environment
- Set up MSW for API mocking
- Add test scripts

### Phase 2: Component Tests (1.5 days)

- Test all existing components
- Test component props and state
- Test user interactions
- Test edge cases

### Phase 3: Hooks & Utilities (0.5 days)

- Test custom hooks
- Test API client
- Test utility functions
- Test error handling

### Phase 4: CI Integration & Docs (0.5 days)

- Add tests to CI pipeline
- Configure coverage reporting
- Write testing guide
- Add examples to README

## Testing Best Practices

### What to Test

- Component rendering (props → output)
- User interactions (clicks, typing)
- State changes
- Conditional rendering
- Error states
- Edge cases

### What NOT to Test

- Implementation details (internal state)
- Third-party library internals
- Styling (use visual regression tests)
- Network requests (mock with MSW)

### Writing Good Tests

1. Test behavior, not implementation
2. Use meaningful test descriptions
3. Follow Arrange-Act-Assert pattern
4. One assertion per test (when possible)
5. Avoid testing implementation details
6. Mock external dependencies

### Test Organization

```typescript
describe("ComponentName", () => {
  describe("when user is logged in", () => {
    it("displays user profile", () => {
      // Test logged-in behavior
    });
  });

  describe("when user is logged out", () => {
    it("displays login button", () => {
      // Test logged-out behavior
    });
  });
});
```

## Benefits

- **Fast Feedback**: Unit tests run in milliseconds
- **Better Coverage**: Test edge cases easily
- **Refactoring Safety**: Know when changes break things
- **Documentation**: Tests show how components work
- **Developer Experience**: Catch bugs while coding
- **Cheaper**: Unit tests cheaper than E2E tests

## Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run in CI mode (single run)
npm run test:run
```

## Notes

- Start with most critical components first
- Aim for 70%+ coverage, not 100%
- Write tests that provide value
- Avoid brittle tests (test behavior, not implementation)
- Keep tests fast (mock slow operations)
- Review test quality in PRs
