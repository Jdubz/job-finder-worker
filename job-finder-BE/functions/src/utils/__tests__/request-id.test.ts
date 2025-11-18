/**
 * Tests for request ID generator
 */

import { generateRequestId } from "../request-id"

describe("generateRequestId", () => {
  describe("format", () => {
    it("should generate ID with correct prefix", () => {
      const id = generateRequestId()
      expect(id).toMatch(/^req_/)
    })

    it("should generate ID with three parts separated by underscores", () => {
      const id = generateRequestId()
      const parts = id.split("_")
      expect(parts).toHaveLength(3)
      expect(parts[0]).toBe("req")
    })

    it("should have timestamp as second part", () => {
      const beforeTime = Date.now()
      const id = generateRequestId()
      const afterTime = Date.now()

      const parts = id.split("_")
      const timestamp = parseInt(parts[1], 10)

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it("should have random string as third part", () => {
      const id = generateRequestId()
      const parts = id.split("_")
      const randomPart = parts[2]

      // Random part should be 9 characters (from slice(2, 11))
      expect(randomPart).toHaveLength(9)

      // Should only contain alphanumeric characters
      expect(randomPart).toMatch(/^[a-z0-9]+$/)
    })

    it("should match expected format", () => {
      const id = generateRequestId()
      // Format: req_{timestamp}_{random}
      // timestamp is 13 digits, random is 9 alphanumeric chars
      expect(id).toMatch(/^req_\d{13}_[a-z0-9]{9}$/)
    })
  })

  describe("uniqueness", () => {
    it("should generate unique IDs", () => {
      const ids = new Set()
      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        ids.add(generateRequestId())
      }

      // All IDs should be unique
      expect(ids.size).toBe(iterations)
    })

    it("should generate different IDs when called consecutively", () => {
      const id1 = generateRequestId()
      const id2 = generateRequestId()
      const id3 = generateRequestId()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })
  })

  describe("timestamp ordering", () => {
    it("should generate IDs with increasing timestamps", async () => {
      const id1 = generateRequestId()

      // Wait a tiny bit to ensure different timestamp
       
      await new Promise((resolve) => setTimeout(resolve, 5))

      const id2 = generateRequestId()

      const timestamp1 = parseInt(id1.split("_")[1], 10)
      const timestamp2 = parseInt(id2.split("_")[1], 10)

      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1)
    })
  })

  describe("real-world usage", () => {
    it("should work as request identifier in logs", () => {
      const requestId = generateRequestId()

      // Simulate log message
      const logMessage = `[${requestId}] Processing request`

      expect(logMessage).toContain("req_")
      expect(logMessage).toMatch(/\[req_\d{13}_[a-z0-9]{9}\]/)
    })

    it("should work in request tracking scenarios", () => {
      const requestId = generateRequestId()

      // Simulate tracking object
      const request = {
        id: requestId,
        timestamp: Date.now(),
        path: "/api/test",
      }

      expect(request.id).toBeTruthy()
      expect(request.id.startsWith("req_")).toBe(true)
    })
  })

  describe("edge cases", () => {
    it("should not contain whitespace", () => {
      const id = generateRequestId()
      expect(id).not.toMatch(/\s/)
    })

    it("should not be empty", () => {
      const id = generateRequestId()
      expect(id.length).toBeGreaterThan(0)
    })

    it("should have consistent length range", () => {
      const ids = Array.from({ length: 100 }, () => generateRequestId())

      // All IDs should be within a narrow length range
      // Format: "req_" (4) + timestamp (12-13) + "_" (1) + random (9) = 26-27 chars
      ids.forEach((id) => {
        expect(id.length).toBeGreaterThanOrEqual(26)
        expect(id.length).toBeLessThanOrEqual(27)
      })
    })
  })
})
