/**
 * Utils Tests
 *
 * Tests for utility functions
 */

import { describe, it, expect } from "vitest"
import { cn } from "../utils"

describe("cn utility function", () => {
  it("should merge class names correctly", () => {
    const result = cn("class1", "class2")
    expect(result).toBe("class1 class2")
  })

  it("should handle conditional classes", () => {
    const result = cn("base", true && "conditional", false && "hidden")
    expect(result).toBe("base conditional")
  })

  it("should handle undefined and null values", () => {
    const result = cn("base", undefined, null, "valid")
    expect(result).toBe("base valid")
  })

  it("should handle empty strings", () => {
    const result = cn("base", "", "valid")
    expect(result).toBe("base valid")
  })

  it("should handle arrays of classes", () => {
    const result = cn(["class1", "class2"], "class3")
    expect(result).toBe("class1 class2 class3")
  })

  it("should handle objects with boolean values", () => {
    const result = cn({
      class1: true,
      class2: false,
      class3: true,
    })
    expect(result).toBe("class1 class3")
  })

  it("should handle mixed input types", () => {
    const result = cn(
      "base",
      ["array1", "array2"],
      { object1: true, object2: false },
      "string",
      undefined,
      null
    )
    expect(result).toBe("base array1 array2 object1 string")
  })

  it("should handle Tailwind CSS class conflicts", () => {
    // This tests the twMerge functionality
    const result = cn("p-2", "p-4", "m-2")
    expect(result).toBe("p-4 m-2") // p-4 should override p-2
  })

  it("should handle complex Tailwind conflicts", () => {
    const result = cn("bg-red-500", "bg-blue-500", "text-white")
    expect(result).toBe("bg-blue-500 text-white") // bg-blue-500 should override bg-red-500
  })

  it("should handle responsive classes", () => {
    const result = cn("p-2", "md:p-4", "lg:p-6")
    expect(result).toBe("p-2 md:p-4 lg:p-6")
  })

  it("should handle pseudo-classes", () => {
    const result = cn("hover:bg-blue-500", "focus:ring-2", "active:scale-95")
    expect(result).toBe("hover:bg-blue-500 focus:ring-2 active:scale-95")
  })

  it("should handle empty input", () => {
    const result = cn()
    expect(result).toBe("")
  })

  it("should handle single class", () => {
    const result = cn("single-class")
    expect(result).toBe("single-class")
  })

  it("should handle whitespace in class names", () => {
    const result = cn("  class1  ", "  class2  ")
    expect(result).toBe("class1 class2")
  })

  it("should handle duplicate classes", () => {
    const result = cn("class1", "class2", "class1")
    expect(result).toBe("class1 class2 class1")
  })

  it("should handle nested arrays", () => {
    const result = cn(["class1", ["class2", "class3"]], "class4")
    expect(result).toBe("class1 class2 class3 class4")
  })

  it("should handle deeply nested objects", () => {
    const result = cn({
      class1: true,
      class2: {
        class3: true,
        class4: false,
      },
    })
    expect(result).toBe("class1 class2")
  })
})
