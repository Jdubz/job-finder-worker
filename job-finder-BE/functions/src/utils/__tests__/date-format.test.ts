/**
 * Tests for date formatting utilities
 */

import { formatMonthYear } from "../date-format"

describe("formatMonthYear", () => {
  describe("valid dates", () => {
    it("should format January correctly", () => {
      expect(formatMonthYear("2020-01")).toBe("Jan 2020")
    })

    it("should format December correctly", () => {
      expect(formatMonthYear("2020-12")).toBe("Dec 2020")
    })

    it("should format all months correctly", () => {
      const months = [
        ["2020-01", "Jan 2020"],
        ["2020-02", "Feb 2020"],
        ["2020-03", "Mar 2020"],
        ["2020-04", "Apr 2020"],
        ["2020-05", "May 2020"],
        ["2020-06", "Jun 2020"],
        ["2020-07", "Jul 2020"],
        ["2020-08", "Aug 2020"],
        ["2020-09", "Sep 2020"],
        ["2020-10", "Oct 2020"],
        ["2020-11", "Nov 2020"],
        ["2020-12", "Dec 2020"],
      ]

      months.forEach(([input, expected]) => {
        expect(formatMonthYear(input)).toBe(expected)
      })
    })

    it("should handle different years", () => {
      expect(formatMonthYear("2015-06")).toBe("Jun 2015")
      expect(formatMonthYear("2023-03")).toBe("Mar 2023")
    })
  })

  describe("null and undefined values", () => {
    it("should return 'Present' for null", () => {
      expect(formatMonthYear(null)).toBe("Present")
    })

    it("should return 'Present' for undefined", () => {
      expect(formatMonthYear(undefined)).toBe("Present")
    })

    it("should return 'Present' for empty string", () => {
      expect(formatMonthYear("")).toBe("Present")
    })
  })

  describe("invalid dates", () => {
    it("should return 'Present' for invalid month (0)", () => {
      expect(formatMonthYear("2020-00")).toBe("Present")
    })

    it("should return 'Present' for invalid month (13)", () => {
      expect(formatMonthYear("2020-13")).toBe("Present")
    })

    it("should return 'Present' for invalid format", () => {
      expect(formatMonthYear("2020/12")).toBe("Present")
    })

    it("should return 'Present' for malformed strings", () => {
      expect(formatMonthYear("invalid")).toBe("Present")
      expect(formatMonthYear("2020")).toBe("Present")
      expect(formatMonthYear("12-2020")).toBe("Present")
    })

    it("should return 'Present' for non-numeric month", () => {
      expect(formatMonthYear("2020-XX")).toBe("Present")
    })
  })

  describe("edge cases", () => {
    it("should handle leading zeros in month", () => {
      expect(formatMonthYear("2020-01")).toBe("Jan 2020")
      expect(formatMonthYear("2020-09")).toBe("Sep 2020")
    })

    it("should handle months without leading zeros", () => {
      // Month parsing should still work
      expect(formatMonthYear("2020-1")).toBe("Jan 2020")
      expect(formatMonthYear("2020-9")).toBe("Sep 2020")
    })
  })
})
