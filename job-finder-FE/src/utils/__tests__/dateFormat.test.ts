/**
 * Date Format Utility Tests
 * Tests for date formatting functions
 */

import { describe, it, expect } from "vitest"
import { formatMonthYear, getCurrentMonthYear, isValidMonthYear } from "../dateFormat"

describe("dateFormat utilities", () => {
  describe("formatMonthYear", () => {
    it("should format YYYY-MM date string correctly", () => {
      const result = formatMonthYear("2024-01")
      expect(result).toBe("Jan 2024")
    })

    it("should handle null/undefined gracefully", () => {
      expect(formatMonthYear(null)).toBe("Present")
      expect(formatMonthYear(undefined)).toBe("Present")
    })

    it("should handle different months correctly", () => {
      expect(formatMonthYear("2024-01")).toBe("Jan 2024")
      expect(formatMonthYear("2024-06")).toBe("Jun 2024")
      expect(formatMonthYear("2024-12")).toBe("Dec 2024")
    })

    it("should handle invalid date strings", () => {
      expect(formatMonthYear("invalid")).toBe("Present")
      expect(formatMonthYear("2024-13")).toBe("Present")
      expect(formatMonthYear("2024-00")).toBe("Present")
    })

    it("should handle empty string", () => {
      expect(formatMonthYear("")).toBe("Present")
    })

    it("should format all months correctly", () => {
      const months = [
        ["2024-01", "Jan 2024"],
        ["2024-02", "Feb 2024"],
        ["2024-03", "Mar 2024"],
        ["2024-04", "Apr 2024"],
        ["2024-05", "May 2024"],
        ["2024-06", "Jun 2024"],
        ["2024-07", "Jul 2024"],
        ["2024-08", "Aug 2024"],
        ["2024-09", "Sep 2024"],
        ["2024-10", "Oct 2024"],
        ["2024-11", "Nov 2024"],
        ["2024-12", "Dec 2024"],
      ]

      months.forEach(([input, expected]) => {
        expect(formatMonthYear(input)).toBe(expected)
      })
    })
  })

  describe("getCurrentMonthYear", () => {
    it("should return current month in YYYY-MM format", () => {
      const result = getCurrentMonthYear()
      expect(result).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
    })

    it("should return a valid date string", () => {
      const result = getCurrentMonthYear()
      expect(isValidMonthYear(result)).toBe(true)
    })
  })

  describe("isValidMonthYear", () => {
    it("should validate correct YYYY-MM format", () => {
      expect(isValidMonthYear("2024-01")).toBe(true)
      expect(isValidMonthYear("2024-12")).toBe(true)
      expect(isValidMonthYear("2025-06")).toBe(true)
    })

    it("should reject invalid formats", () => {
      expect(isValidMonthYear("invalid")).toBe(false)
      expect(isValidMonthYear("2024-13")).toBe(false)
      expect(isValidMonthYear("2024-00")).toBe(false)
      expect(isValidMonthYear("24-01")).toBe(false)
      expect(isValidMonthYear("2024-1")).toBe(false)
      expect(isValidMonthYear("")).toBe(false)
    })

    it("should reject null/undefined", () => {
      expect(isValidMonthYear("")).toBe(false)
    })
  })
})
