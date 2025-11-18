import { type Page } from "@playwright/test"

/**
 * Authentication fixture helpers
 * These would be used to set up authenticated states for tests
 */

export async function mockAuthentication(page: Page, role: "user" | "editor" = "user") {
  // Mock Firebase authentication
  await page.addInitScript((userRole) => {
    // Mock Firebase auth user
    window.localStorage.setItem(
      "mockAuthUser",
      JSON.stringify({
        uid: "test-user-123",
        email: "test@example.com",
        displayName: "Test User",
        role: userRole,
      })
    )
  }, role)
}

export async function clearAuthentication(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

/**
 * Mock job data for testing
 */
export const mockJobData = {
  jobMatch: {
    id: "job-123",
    jobTitle: "Senior Software Engineer",
    company: "Test Company",
    location: "San Francisco, CA",
    salary: "$150k - $200k",
    matchScore: 85,
    status: "pending",
    description: "We are looking for a senior software engineer...",
    requirements: [
      "React and TypeScript experience",
      "5+ years of software development",
      "Strong problem-solving skills",
    ],
    linkedInUrl: "https://www.linkedin.com/jobs/view/123456789",
    createdAt: new Date().toISOString(),
  },

  queueItem: {
    id: "queue-123",
    jobTitle: "Frontend Developer",
    company: "Another Company",
    status: "processing",
    linkedInUrl: "https://www.linkedin.com/jobs/view/987654321",
    createdAt: new Date().toISOString(),
    stage: "scraping",
  },

  document: {
    id: "doc-123",
    type: "resume",
    title: "Resume for Senior Software Engineer at Test Company",
    company: "Test Company",
    jobTitle: "Senior Software Engineer",
    content: "Resume content here...",
    createdAt: new Date().toISOString(),
    downloadUrl: "https://example.com/resume.pdf",
  },
}

/**
 * Wait for Firebase to initialize
 */
export async function waitForFirebaseInit(page: Page) {
  await page
    .waitForFunction(
      () => {
        // Check if Firebase is initialized
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).firebase !== undefined
      },
      { timeout: 5000 }
    )
    .catch(() => {
      // Firebase might not be loaded in test environment
      console.log("Firebase not detected - running in test mode")
    })
}

/**
 * Mock API responses
 */
export async function mockApiResponse(
  page: Page,
  url: string | RegExp,
  response: unknown,
  status = 200
) {
  await page.route(url, async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response),
    })
  })
}

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 2000) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {
    // Network might not go idle in test environment
  })
}

/**
 * Take screenshot on failure
 */
export async function screenshotOnFailure(page: Page, testInfo: { title: string }) {
  const screenshotPath = `test-results/screenshots/${testInfo.title.replace(/\s+/g, "-")}.png`
  await page.screenshot({ path: screenshotPath, fullPage: true })
  console.log(`Screenshot saved to ${screenshotPath}`)
}

/**
 * Get element text safely
 */
export async function getTextContent(page: Page, selector: string): Promise<string | null> {
  const element = page.locator(selector)
  const count = await element.count()
  if (count === 0) return null
  return await element.first().textContent()
}

/**
 * Fill form field safely
 */
export async function fillField(page: Page, label: string | RegExp, value: string) {
  const field = page.getByLabel(label)
  if (await field.isVisible({ timeout: 2000 })) {
    await field.fill(value)
    return true
  }
  return false
}

/**
 * Click button safely
 */
export async function clickButton(page: Page, text: string | RegExp) {
  const button = page.getByRole("button", { name: text })
  if (await button.isVisible({ timeout: 2000 })) {
    await button.click()
    return true
  }
  return false
}
