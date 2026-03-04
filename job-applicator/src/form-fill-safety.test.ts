import { describe, it, expect } from "vitest"
import { parseFormScanResult } from "./form-fill-safety.js"

describe("parseFormScanResult", () => {
  it("should categorize empty and filled fields", () => {
    const empty = [
      { selector: "#email", label: "Email", type: "email", value: "" },
    ]
    const filled = [
      { label: "Name", type: "text", value: "John" },
      { label: "Phone", type: "tel", value: "555-1234" },
    ]

    const result = parseFormScanResult(empty, filled)

    expect(result.filledFields).toHaveLength(2)
    expect(result.emptyFields).toHaveLength(1)
    expect(result.emptyFields[0].selector).toBe("#email")
    expect(result.totalFields).toBe(3)
  })

  it("should calculate filledRatio correctly", () => {
    const empty = [
      { selector: "#c", label: "C", type: "text", value: "" },
    ]
    const filled = [
      { label: "A", type: "text", value: "filled" },
      { label: "B", type: "text", value: "filled" },
      { label: "D", type: "text", value: "filled" },
    ]

    const result = parseFormScanResult(empty, filled)

    expect(result.filledRatio).toBe(0.75)
    expect(result.isTargetedMode).toBe(true)
  })

  it("should activate targeted mode when >50% filled", () => {
    const empty = [
      { selector: "#c", label: "C", type: "text", value: "" },
    ]
    const filled = [
      { label: "A", type: "text", value: "x" },
      { label: "B", type: "text", value: "x" },
    ]

    const result = parseFormScanResult(empty, filled)

    expect(result.filledRatio).toBeCloseTo(0.667, 2)
    expect(result.isTargetedMode).toBe(true)
  })

  it("should NOT activate targeted mode when exactly 50% filled", () => {
    const empty = [
      { selector: "#b", label: "B", type: "text", value: "" },
    ]
    const filled = [
      { label: "A", type: "text", value: "x" },
    ]

    const result = parseFormScanResult(empty, filled)

    expect(result.filledRatio).toBe(0.5)
    expect(result.isTargetedMode).toBe(false)
  })

  it("should NOT activate targeted mode when <50% filled", () => {
    const empty = [
      { selector: "#b", label: "B", type: "text", value: "" },
      { selector: "#c", label: "C", type: "text", value: "" },
      { selector: "#d", label: "D", type: "text", value: "" },
    ]
    const filled = [
      { label: "A", type: "text", value: "x" },
    ]

    const result = parseFormScanResult(empty, filled)

    expect(result.filledRatio).toBe(0.25)
    expect(result.isTargetedMode).toBe(false)
  })

  it("should exclude checkbox fields from empty array counts", () => {
    const empty = [
      { selector: "#email", label: "Email", type: "email", value: "" },
      { selector: "#agree", label: "Agree", type: "checkbox", value: "" },
    ]
    const filled = [
      { label: "Name", type: "text", value: "John" },
    ]

    const result = parseFormScanResult(empty, filled)

    // Checkbox excluded from empty, so 1 empty + 1 filled = 2 total
    expect(result.totalFields).toBe(2)
    expect(result.filledFields).toHaveLength(1)
    expect(result.emptyFields).toHaveLength(1)
  })

  it("should exclude radio fields from empty array counts", () => {
    const empty = [
      { selector: "#option1", label: "Option 1", type: "radio", value: "" },
    ]
    const filled = [
      { label: "Name", type: "text", value: "John" },
    ]

    const result = parseFormScanResult(empty, filled)

    // Radio excluded from empty
    expect(result.totalFields).toBe(1)
    expect(result.filledFields).toHaveLength(1)
    expect(result.emptyFields).toHaveLength(0)
  })

  it("should handle empty arrays", () => {
    const result = parseFormScanResult([], [])

    expect(result.totalFields).toBe(0)
    expect(result.filledFields).toHaveLength(0)
    expect(result.emptyFields).toHaveLength(0)
    expect(result.filledRatio).toBe(0)
    expect(result.isTargetedMode).toBe(false)
  })

  it("should handle all fields filled", () => {
    const filled = [
      { label: "A", type: "text", value: "x" },
      { label: "B", type: "text", value: "y" },
    ]

    const result = parseFormScanResult([], filled)

    expect(result.filledRatio).toBe(1)
    expect(result.isTargetedMode).toBe(true)
    expect(result.emptyFields).toHaveLength(0)
  })

  it("should handle all fields empty", () => {
    const empty = [
      { selector: "#a", label: "A", type: "text", value: "" },
      { selector: "#b", label: "B", type: "text", value: "" },
    ]

    const result = parseFormScanResult(empty, [])

    expect(result.filledRatio).toBe(0)
    expect(result.isTargetedMode).toBe(false)
    expect(result.filledFields).toHaveLength(0)
  })

  it("should set empty string value for empty fields", () => {
    const empty = [
      { selector: "#a", label: "A", type: "text", value: "" },
    ]

    const result = parseFormScanResult(empty, [])

    expect(result.emptyFields[0].value).toBe("")
  })

  it("should set empty string selector for filled fields", () => {
    const filled = [
      { label: "A", type: "text", value: "hello" },
    ]

    const result = parseFormScanResult([], filled)

    expect(result.filledFields[0].selector).toBe("")
    expect(result.filledFields[0].value).toBe("hello")
  })

  it("should handle missing/undefined field properties gracefully", () => {
    const empty = [
      { selector: "#a" },  // missing label, type, value
      {},  // missing everything
    ]
    const filled = [
      { value: "filled" },  // missing label, type
    ]

    const result = parseFormScanResult(
      empty as Array<Record<string, unknown>>,
      filled as Array<Record<string, unknown>>
    )

    // #a: text type (default) → empty, {}: text type (default) → empty
    expect(result.emptyFields).toHaveLength(2)
    expect(result.filledFields).toHaveLength(1)
  })
})
