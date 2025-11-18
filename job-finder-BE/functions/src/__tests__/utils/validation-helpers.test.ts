import { describe, it, expect } from "@jest/globals"
import {
  isValidEmail,
  isValidUrl,
  isValidUuid,
  isValidPhone,
  isNonEmptyString,
  isPositiveNumber,
  isNonNegativeNumber,
  isNonEmptyArray,
  isValidEnum,
  validatePagination,
  validateFileUpload,
  isValidDateString,
  hasRequiredKeys,
  sanitizeString,
  isValidStringLength,
  parseNumberParam,
  parseBooleanParam,
  parseArrayParam,
  combineValidations,
  formatValidationErrors,
} from "../../utils/validation-helpers"

describe("validation-helpers", () => {
  describe("isValidEmail", () => {
    it("should validate correct email addresses", () => {
      expect(isValidEmail("user@example.com")).toBe(true)
      expect(isValidEmail("test.user+tag@subdomain.example.co.uk")).toBe(true)
    })

    it("should reject invalid email addresses", () => {
      expect(isValidEmail("invalid")).toBe(false)
      expect(isValidEmail("@example.com")).toBe(false)
      expect(isValidEmail("user@")).toBe(false)
      expect(isValidEmail("")).toBe(false)
    })
  })

  describe("isValidUrl", () => {
    it("should validate correct URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true)
      expect(isValidUrl("http://subdomain.example.com/path?query=1")).toBe(true)
    })

    it("should reject invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false)
      expect(isValidUrl("ftp://example.com")).toBe(false)
      expect(isValidUrl("")).toBe(false)
    })
  })

  describe("isValidUuid", () => {
    it("should validate correct UUIDs", () => {
      expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true)
      expect(isValidUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true)
    })

    it("should reject invalid UUIDs", () => {
      expect(isValidUuid("not-a-uuid")).toBe(false)
      expect(isValidUuid("123")).toBe(false)
      expect(isValidUuid("")).toBe(false)
    })
  })

  describe("isValidPhone", () => {
    it("should validate phone numbers", () => {
      expect(isValidPhone("(555) 123-4567")).toBe(true)
      expect(isValidPhone("555-123-4567")).toBe(true)
      expect(isValidPhone("+1 555 123 4567")).toBe(true)
    })

    it("should reject invalid phone numbers", () => {
      expect(isValidPhone("abc")).toBe(false)
      expect(isValidPhone("no-numbers-here")).toBe(false)
      expect(isValidPhone("")).toBe(false)
    })
  })

  describe("isNonEmptyString", () => {
    it("should return true for non-empty strings", () => {
      expect(isNonEmptyString("hello")).toBe(true)
      expect(isNonEmptyString(" text ")).toBe(true)
    })

    it("should return false for empty or non-strings", () => {
      expect(isNonEmptyString("")).toBe(false)
      expect(isNonEmptyString("   ")).toBe(false)
      expect(isNonEmptyString(123)).toBe(false)
      expect(isNonEmptyString(null)).toBe(false)
      expect(isNonEmptyString(undefined)).toBe(false)
    })
  })

  describe("isPositiveNumber", () => {
    it("should return true for positive numbers", () => {
      expect(isPositiveNumber(1)).toBe(true)
      expect(isPositiveNumber(0.5)).toBe(true)
      expect(isPositiveNumber(1000)).toBe(true)
    })

    it("should return false for zero, negative, or non-numbers", () => {
      expect(isPositiveNumber(0)).toBe(false)
      expect(isPositiveNumber(-1)).toBe(false)
      expect(isPositiveNumber("5")).toBe(false)
      expect(isPositiveNumber(null)).toBe(false)
    })
  })

  describe("isNonNegativeNumber", () => {
    it("should return true for zero and positive numbers", () => {
      expect(isNonNegativeNumber(0)).toBe(true)
      expect(isNonNegativeNumber(1)).toBe(true)
      expect(isNonNegativeNumber(100)).toBe(true)
    })

    it("should return false for negative numbers", () => {
      expect(isNonNegativeNumber(-1)).toBe(false)
      expect(isNonNegativeNumber(-0.1)).toBe(false)
    })
  })

  describe("isNonEmptyArray", () => {
    it("should return true for non-empty arrays", () => {
      expect(isNonEmptyArray([1, 2, 3])).toBe(true)
      expect(isNonEmptyArray(["a"])).toBe(true)
    })

    it("should return false for empty arrays or non-arrays", () => {
      expect(isNonEmptyArray([])).toBe(false)
      expect(isNonEmptyArray("not array")).toBe(false)
      expect(isNonEmptyArray(null)).toBe(false)
    })
  })

  describe("isValidEnum", () => {
    it("should validate values in allowed enum", () => {
      const allowed = ["red", "green", "blue"] as const
      expect(isValidEnum("red", allowed)).toBe(true)
      expect(isValidEnum("blue", allowed)).toBe(true)
    })

    it("should reject values not in enum", () => {
      const allowed = ["red", "green", "blue"] as const
      expect(isValidEnum("yellow", allowed)).toBe(false)
      expect(isValidEnum("", allowed)).toBe(false)
      expect(isValidEnum(123, allowed)).toBe(false)
    })
  })

  describe("validatePagination", () => {
    it("should validate correct pagination params", () => {
      const result = validatePagination({ page: 1, limit: 10 })
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should reject invalid page numbers", () => {
      const result = validatePagination({ page: 0 })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain("Page must be a positive number")
    })

    it("should reject invalid limit", () => {
      const result = validatePagination({ limit: 0 })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain("Limit must be a positive number")
    })

    it("should reject limit exceeding maximum", () => {
      const result = validatePagination({ limit: 10000 })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes("cannot exceed"))).toBe(true)
    })

    it("should handle string inputs", () => {
      const result = validatePagination({ page: "1", limit: "10" })
      expect(result.isValid).toBe(true)
    })
  })

  describe("validateFileUpload", () => {
    it("should validate files within limits", () => {
      const result = validateFileUpload({
        size: 1024,
        mimeType: "application/pdf",
      })
      expect(result.isValid).toBe(true)
    })

    it("should reject files exceeding size limit", () => {
      const result = validateFileUpload({
        size: 100 * 1024 * 1024, // 100MB
        mimeType: "application/pdf",
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes("exceeds maximum"))).toBe(true)
    })

    it("should reject invalid mime types", () => {
      const result = validateFileUpload({
        size: 1024,
        mimeType: "application/exe",
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes("Invalid file type"))).toBe(true)
    })
  })

  describe("isValidDateString", () => {
    it("should validate ISO date strings", () => {
      expect(isValidDateString("2024-01-01")).toBe(true)
      expect(isValidDateString("2024-01-01T12:00:00Z")).toBe(true)
    })

    it("should reject invalid date strings", () => {
      expect(isValidDateString("not-a-date")).toBe(false)
      expect(isValidDateString("2024-13-01")).toBe(false)
      expect(isValidDateString("")).toBe(false)
    })
  })

  describe("hasRequiredKeys", () => {
    it("should validate objects with all required keys", () => {
      const obj = { name: "John", age: 30, email: "john@example.com" }
      const result = hasRequiredKeys(obj, ["name", "email"] as const)
      expect(result.isValid).toBe(true)
    })

    it("should reject objects missing required keys", () => {
      const obj = { name: "John" } as { name: string; email?: string }
      const result = hasRequiredKeys(obj, ["name", "email"])
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain("email")
    })

    it("should reject objects with null values", () => {
      const obj = { name: "John", email: null } as { name: string; email: string | null }
      const result = hasRequiredKeys(obj, ["name", "email"])
      expect(result.isValid).toBe(false)
    })
  })

  describe("sanitizeString", () => {
    it("should trim and sanitize strings", () => {
      expect(sanitizeString("  hello  ")).toBe("hello")
      expect(sanitizeString("<script>alert('xss')</script>")).toBe("scriptalert('xss')/script")
    })

    it("should return empty string for non-strings", () => {
      expect(sanitizeString(123)).toBe("")
      expect(sanitizeString(null)).toBe("")
      expect(sanitizeString(undefined)).toBe("")
    })

    it("should remove angle brackets", () => {
      expect(sanitizeString("Hello <World>")).toBe("Hello World")
    })
  })

  describe("isValidStringLength", () => {
    it("should validate strings within length bounds", () => {
      expect(isValidStringLength("hello", 1, 10)).toBe(true)
      expect(isValidStringLength("hi", 2, 5)).toBe(true)
    })

    it("should reject strings outside length bounds", () => {
      expect(isValidStringLength("hi", 3, 10)).toBe(false)
      expect(isValidStringLength("very long string", 1, 5)).toBe(false)
    })

    it("should trim before checking length", () => {
      expect(isValidStringLength("  hi  ", 2, 5)).toBe(true)
    })
  })

  describe("parseNumberParam", () => {
    it("should parse valid numbers", () => {
      expect(parseNumberParam("10", 5)).toBe(10)
      expect(parseNumberParam(20, 5)).toBe(20)
    })

    it("should return default for invalid input", () => {
      expect(parseNumberParam("abc", 5)).toBe(5)
      expect(parseNumberParam(undefined, 5)).toBe(5)
      expect(parseNumberParam(NaN, 5)).toBe(5)
    })

    it("should enforce min/max bounds", () => {
      expect(parseNumberParam(5, 10, 8, 12)).toBe(8)
      expect(parseNumberParam(15, 10, 8, 12)).toBe(12)
      expect(parseNumberParam(10, 5, 8, 12)).toBe(10)
    })
  })

  describe("parseBooleanParam", () => {
    it("should parse boolean values", () => {
      expect(parseBooleanParam(true, false)).toBe(true)
      expect(parseBooleanParam(false, true)).toBe(false)
    })

    it("should parse string representations", () => {
      expect(parseBooleanParam("true", false)).toBe(true)
      expect(parseBooleanParam("false", true)).toBe(false)
      expect(parseBooleanParam("1", false)).toBe(true)
      expect(parseBooleanParam("0", true)).toBe(false)
      expect(parseBooleanParam("yes", false)).toBe(true)
      expect(parseBooleanParam("no", true)).toBe(false)
    })

    it("should return default for invalid input", () => {
      expect(parseBooleanParam("invalid", true)).toBe(true)
      expect(parseBooleanParam(null, false)).toBe(false)
    })
  })

  describe("parseArrayParam", () => {
    it("should parse comma-separated strings", () => {
      expect(parseArrayParam("a,b,c")).toEqual(["a", "b", "c"])
      expect(parseArrayParam("one, two, three")).toEqual(["one", "two", "three"])
    })

    it("should handle arrays", () => {
      expect(parseArrayParam(["a", "b", "c"])).toEqual(["a", "b", "c"])
    })

    it("should filter empty values", () => {
      expect(parseArrayParam("a,,c")).toEqual(["a", "c"])
      expect(parseArrayParam(["a", "", "c"])).toEqual(["a", "c"])
    })

    it("should return empty array for invalid input", () => {
      expect(parseArrayParam(null)).toEqual([])
      expect(parseArrayParam(undefined)).toEqual([])
      expect(parseArrayParam(123)).toEqual([])
    })
  })

  describe("combineValidations", () => {
    it("should combine multiple validations", () => {
      const v1 = { isValid: true, errors: [] }
      const v2 = { isValid: true, errors: [] }
      const result = combineValidations(v1, v2)
      expect(result.isValid).toBe(true)
    })

    it("should aggregate errors from all validations", () => {
      const v1 = { isValid: false, errors: ["Error 1"] }
      const v2 = { isValid: false, errors: ["Error 2"] }
      const result = combineValidations(v1, v2)
      expect(result.isValid).toBe(false)
      expect(result.errors).toEqual(["Error 1", "Error 2"])
    })

    it("should mark as invalid if any validation fails", () => {
      const v1 = { isValid: true, errors: [] }
      const v2 = { isValid: false, errors: ["Error"] }
      const result = combineValidations(v1, v2)
      expect(result.isValid).toBe(false)
    })
  })

  describe("formatValidationErrors", () => {
    it("should format single error", () => {
      expect(formatValidationErrors(["Error 1"])).toBe("Error 1")
    })

    it("should format multiple errors", () => {
      const result = formatValidationErrors(["Error 1", "Error 2"])
      expect(result).toContain("Error 1")
      expect(result).toContain("Error 2")
      expect(result).toContain("Multiple validation errors")
    })

    it("should handle empty array", () => {
      expect(formatValidationErrors([])).toBe("Validation failed")
    })
  })
})
