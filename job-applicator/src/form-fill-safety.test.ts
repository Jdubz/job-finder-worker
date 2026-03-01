import { describe, it, expect } from "vitest"
import { parseFormScanResult } from "./form-fill-safety.js"

describe("parseFormScanResult", () => {
  it("should categorize empty and filled fields", () => {
    const fields = [
      { selector: "#name", label: "Name", type: "text", value: "John" },
      { selector: "#email", label: "Email", type: "email", value: "" },
      { selector: "#phone", label: "Phone", type: "tel", value: "555-1234" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledFields).toHaveLength(2)
    expect(result.emptyFields).toHaveLength(1)
    expect(result.emptyFields[0].selector).toBe("#email")
    expect(result.totalFields).toBe(3)
  })

  it("should calculate filledRatio correctly", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "filled" },
      { selector: "#b", label: "B", type: "text", value: "filled" },
      { selector: "#c", label: "C", type: "text", value: "" },
      { selector: "#d", label: "D", type: "text", value: "filled" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledRatio).toBe(0.75)
    expect(result.isTargetedMode).toBe(true)
  })

  it("should activate targeted mode when >50% filled", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "x" },
      { selector: "#b", label: "B", type: "text", value: "x" },
      { selector: "#c", label: "C", type: "text", value: "" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledRatio).toBeCloseTo(0.667, 2)
    expect(result.isTargetedMode).toBe(true)
  })

  it("should NOT activate targeted mode when exactly 50% filled", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "x" },
      { selector: "#b", label: "B", type: "text", value: "" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledRatio).toBe(0.5)
    expect(result.isTargetedMode).toBe(false)
  })

  it("should NOT activate targeted mode when <50% filled", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "x" },
      { selector: "#b", label: "B", type: "text", value: "" },
      { selector: "#c", label: "C", type: "text", value: "" },
      { selector: "#d", label: "D", type: "text", value: "" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledRatio).toBe(0.25)
    expect(result.isTargetedMode).toBe(false)
  })

  it("should exclude checkbox fields from counts", () => {
    const fields = [
      { selector: "#name", label: "Name", type: "text", value: "John" },
      { selector: "#agree", label: "Agree", type: "checkbox", value: "" },
      { selector: "#email", label: "Email", type: "email", value: "" },
    ]

    const result = parseFormScanResult(fields)

    // Checkbox excluded, so 1 filled + 1 empty = 2 total
    expect(result.totalFields).toBe(2)
    expect(result.filledFields).toHaveLength(1)
    expect(result.emptyFields).toHaveLength(1)
  })

  it("should exclude radio fields from counts", () => {
    const fields = [
      { selector: "#name", label: "Name", type: "text", value: "John" },
      { selector: "#option1", label: "Option 1", type: "radio", value: "" },
      { selector: "#option2", label: "Option 2", type: "radio", value: "selected" },
    ]

    const result = parseFormScanResult(fields)

    // Both radios excluded
    expect(result.totalFields).toBe(1)
    expect(result.filledFields).toHaveLength(1)
    expect(result.emptyFields).toHaveLength(0)
  })

  it("should handle empty fields array", () => {
    const result = parseFormScanResult([])

    expect(result.totalFields).toBe(0)
    expect(result.filledFields).toHaveLength(0)
    expect(result.emptyFields).toHaveLength(0)
    expect(result.filledRatio).toBe(0)
    expect(result.isTargetedMode).toBe(false)
  })

  it("should handle all fields filled", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "x" },
      { selector: "#b", label: "B", type: "text", value: "y" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledRatio).toBe(1)
    expect(result.isTargetedMode).toBe(true)
    expect(result.emptyFields).toHaveLength(0)
  })

  it("should handle all fields empty", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "" },
      { selector: "#b", label: "B", type: "text", value: "" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.filledRatio).toBe(0)
    expect(result.isTargetedMode).toBe(false)
    expect(result.filledFields).toHaveLength(0)
  })

  it("should treat whitespace-only values as empty", () => {
    const fields = [
      { selector: "#a", label: "A", type: "text", value: "   " },
      { selector: "#b", label: "B", type: "text", value: "\t" },
    ]

    const result = parseFormScanResult(fields)

    expect(result.emptyFields).toHaveLength(2)
    expect(result.filledFields).toHaveLength(0)
  })

  it("should handle missing/undefined field properties gracefully", () => {
    const fields = [
      { selector: "#a" },  // missing label, type, value
      { selector: "#b", value: "filled" },
      {},  // missing everything
    ]

    const result = parseFormScanResult(fields as Array<Record<string, unknown>>)

    // #a: no value → empty, #b: has value → filled, {}: no value → empty
    expect(result.emptyFields).toHaveLength(2)
    expect(result.filledFields).toHaveLength(1)
  })
})
