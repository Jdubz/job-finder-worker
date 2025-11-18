# Document Builder Test Suite

This directory contains comprehensive unit tests for the document builder functionality in the job-finder-FE application.

## Test Structure

```
src/__tests__/
├── setup.ts                    # Global test setup and configuration
├── utils/
│   └── testHelpers.ts          # Reusable test utilities and helpers
├── api/
│   └── generator-client.test.ts # API client tests
├── hooks/
│   └── useGeneratorDocuments.test.ts # Custom hook tests
├── components/
│   ├── DocumentHistoryList.test.tsx # Component tests
│   └── GenerationProgress.test.tsx   # Component tests
├── pages/
│   └── DocumentBuilderPage.test.tsx # Page component tests
├── integration/
│   └── document-generation-flow.test.tsx # Integration tests
└── README.md                   # This file
```

## Test Categories

### 1. Unit Tests

- **API Client Tests**: Test generator client API calls, error handling, and request/response validation
- **Hook Tests**: Test custom React hooks like `useGeneratorDocuments`
- **Component Tests**: Test individual components like `DocumentHistoryList` and `GenerationProgress`
- **Page Tests**: Test the main `DocumentBuilderPage` component

### 2. Integration Tests

- **Document Generation Flow**: Test the complete workflow from form submission to document generation
- **Error Handling**: Test error scenarios and recovery
- **State Management**: Test component state changes and data flow

## Running Tests

### Run All Tests

```bash
npm run test
```

### Run Specific Test Categories

```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests for specific components
npm run test -- DocumentBuilderPage
npm run test -- generator-client
npm run test -- useGeneratorDocuments
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

## Test Utilities

### Mock Data Factories

- `createMockUser()` - Create mock user objects
- `createMockJobMatch()` - Create mock job match objects
- `createMockGenerationStep()` - Create mock generation step objects
- `createMockDocumentHistoryItem()` - Create mock document history items

### Test Helpers

- `renderWithProviders()` - Render components with necessary providers
- `fillJobForm()` - Fill form fields programmatically
- `selectJobMatch()` - Select a job match from dropdown
- `startGeneration()` - Trigger document generation
- `waitForGenerationToComplete()` - Wait for generation to finish

### Assertion Utilities

- `expectFormToBeCleared()` - Assert form is cleared
- `expectFormToBePopulated()` - Assert form has expected values
- `expectGenerationToStart()` - Assert generation API was called
- `expectProgressSteps()` - Assert progress steps are displayed
- `expectDownloadButtons()` - Assert download buttons are present

## Test Coverage

The test suite aims for 80% coverage across:

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

## Mocking Strategy

### API Clients

- Mock all API calls to prevent network requests
- Use realistic mock responses that match backend API
- Test error scenarios with mock failures

### Context Providers

- Mock authentication context with test users
- Mock Firestore context with test data
- Mock router context for navigation tests

### External Dependencies

- Mock window methods (open, confirm, alert)
- Mock browser APIs (matchMedia, IntersectionObserver)
- Mock date/time functions for consistent testing

## Best Practices

### Test Organization

- Group related tests in describe blocks
- Use descriptive test names that explain the scenario
- Test both happy path and error scenarios
- Test edge cases and boundary conditions

### Mock Management

- Clear mocks between tests to prevent interference
- Use realistic mock data that matches production
- Mock at the appropriate level (API vs component)

### Assertions

- Use specific assertions that test behavior, not implementation
- Test user-visible outcomes rather than internal state
- Verify side effects like API calls and navigation

### Performance

- Use `waitFor` for async operations
- Avoid unnecessary re-renders in tests
- Mock expensive operations like file downloads

## Debugging Tests

### Common Issues

1. **Mock not working**: Check mock setup and cleanup
2. **Async operations**: Use `waitFor` for async state changes
3. **Component not rendering**: Check provider setup and imports
4. **API calls not mocked**: Verify mock configuration

### Debug Commands

```bash
# Run tests with verbose output
npm run test -- --reporter=verbose

# Run specific test with debug output
npm run test -- --reporter=verbose DocumentBuilderPage

# Run tests in debug mode
npm run test:debug
```

## Adding New Tests

### For New Components

1. Create test file in appropriate directory
2. Import component and test utilities
3. Set up mocks for dependencies
4. Write tests for rendering, interactions, and edge cases

### For New API Endpoints

1. Add tests to existing API client test file
2. Mock the endpoint response
3. Test success and error scenarios
4. Verify request/response format

### For New Hooks

1. Create test file in hooks directory
2. Use `renderHook` for hook testing
3. Test state changes and side effects
4. Mock dependencies appropriately

## Continuous Integration

Tests are automatically run in CI/CD pipeline with:

- Node.js 18+
- npm install
- npm run test:coverage
- Coverage threshold enforcement
- Test result reporting

## Performance Testing

The test suite includes performance tests for:

- Large document lists (100+ items)
- Complex form interactions
- Async operation timing
- Memory usage patterns

## Accessibility Testing

Tests verify:

- Proper ARIA labels and roles
- Keyboard navigation
- Screen reader compatibility
- Focus management
- Color contrast (where applicable)

## Future Improvements

- [ ] Add visual regression tests
- [ ] Add performance benchmarks
- [ ] Add accessibility audits
- [ ] Add cross-browser testing
- [ ] Add mobile device testing
