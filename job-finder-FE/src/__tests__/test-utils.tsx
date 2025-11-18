/**
 * Custom Test Utils for React 19 Compatibility
 *
 * Provides React 19 compatible testing utilities
 */

import type { ReactElement } from "react"
import { render as rtlRender, type RenderOptions } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"

// Custom render function that wraps components with necessary providers
function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, {
    ...options,
  })
}

// Custom render with router
function renderWithRouter(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, {
    wrapper: BrowserRouter,
    ...options,
  })
}

// Re-export everything from React Testing Library
export * from "@testing-library/react"

// Override the default render with our custom one
export { customRender as render, renderWithRouter }
