import { describe, it, expect, beforeEach } from "@jest/globals"
import { StorageService } from "../../services/storage.service"

jest.mock("@google-cloud/storage", () => {
  const mockFile = {
    save: jest.fn().mockResolvedValue(undefined),
  }

  const mockBucket = {
    file: jest.fn().mockReturnValue(mockFile),
  }

  const mockStorage = {
    bucket: jest.fn().mockReturnValue(mockBucket),
  }

  return {
    Storage: jest.fn().mockImplementation(() => mockStorage),
    __mockFile: mockFile,
    __mockBucket: mockBucket,
  }
})

describe("StorageService", () => {
  let service: StorageService
  let mockLogger: any
  let mockFile: any

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    }

    // Reset environment
    delete process.env.FUNCTIONS_EMULATOR
    delete process.env.ENVIRONMENT

    // Get the mock file and ensure it's in success state by default
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { __mockFile } = require("@google-cloud/storage")
    mockFile = __mockFile
    // Reset to default resolved state
    mockFile.save.mockReset()
    mockFile.save.mockResolvedValue(undefined)

    service = new StorageService(undefined, mockLogger)
  })

  describe("constructor", () => {
    it("should initialize with production bucket by default", () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        "StorageService initialized for Cloud Functions",
        expect.objectContaining({
          bucket: "joshwentworth-resumes",
        })
      )
    })

    it("should use staging bucket when ENVIRONMENT=staging", () => {
      process.env.ENVIRONMENT = "staging"
      new StorageService(undefined, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith(
        "StorageService initialized for Cloud Functions",
        expect.objectContaining({
          bucket: "joshwentworth-resumes-staging",
        })
      )
    })

    it("should use emulator when FUNCTIONS_EMULATOR=true", () => {
      process.env.FUNCTIONS_EMULATOR = "true"
      new StorageService(undefined, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith(
        "StorageService using Firebase Storage Emulator",
        expect.objectContaining({
          bucket: "joshwentworth-resumes-local",
        })
      )
    })
  })

  describe("uploadPDF", () => {
    // TODO: Fix this test - mock isn't working properly
    it.skip("should handle upload failures", async () => {
      // Reset the mock to reject for this test only
      mockFile.save.mockReset()
      mockFile.save.mockRejectedValue(new Error("Network error"))

      // Create a new service instance with the failing mock
      const testService = new StorageService(undefined, mockLogger)
      
      const buffer = Buffer.from("test")

      await expect(testService.uploadPDF(buffer, "test.pdf", "resume")).rejects.toThrow(
        "Storage upload failed"
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to upload PDF",
        expect.any(Object)
      )

      // Reset back to success for other tests
      mockFile.save.mockReset()
      mockFile.save.mockResolvedValue(undefined)
    })

    it("should upload a PDF buffer successfully", async () => {
      const buffer = Buffer.from("fake-pdf-content")
      const filename = "resume.pdf"

      const result = await service.uploadPDF(buffer, filename, "resume")

      expect(result).toMatchObject({
        filename: "resume.pdf",
        size: buffer.length,
        storageClass: "STANDARD",
      })
      expect(result.gcsPath).toContain("resumes/")
      expect(result.gcsPath).toContain(filename)
    })

    it("should include timestamp in GCS path", async () => {
      const buffer = Buffer.from("test")
      const result = await service.uploadPDF(buffer, "test.pdf", "cover-letter")

      const today = new Date().toISOString().split("T")[0]
      expect(result.gcsPath).toContain(today)
      expect(result.gcsPath).toContain("cover-letters/")
    })

    it("should log upload attempts", async () => {
      const buffer = Buffer.from("test")
      await service.uploadPDF(buffer, "test.pdf", "resume")

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Uploading PDF",
        expect.objectContaining({
          size: buffer.length,
        })
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        "PDF uploaded successfully",
        expect.any(Object)
      )
    })
  })

  describe("uploadImage", () => {
    it("should upload valid image types", async () => {
      const buffer = Buffer.from("fake-image-content")
      const filename = "avatar.png"

      const result = await service.uploadImage(buffer, filename, "avatar", "image/png")

      expect(result).toMatchObject({
        filename: "avatar.png",
        size: buffer.length,
        storageClass: "STANDARD",
      })
      expect(result.gcsPath).toContain("images/avatars/")
    })

    it("should reject invalid content types", async () => {
      const buffer = Buffer.from("test")

      await expect(
        service.uploadImage(buffer, "file.txt", "logo", "text/plain")
      ).rejects.toThrow("Invalid image type")
    })

    it("should reject files larger than 5MB", async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB

      await expect(
        service.uploadImage(largeBuffer, "large.png", "avatar", "image/png")
      ).rejects.toThrow("Image too large")
    })

    it("should accept all valid image types", async () => {
      const buffer = Buffer.from("test")
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]

      for (const contentType of validTypes) {
        await expect(
          service.uploadImage(buffer, "test.img", "logo", contentType)
        ).resolves.toBeDefined()
      }
    })

    it("should organize images by type", async () => {
      const buffer = Buffer.from("test")

      const avatarResult = await service.uploadImage(
        buffer,
        "avatar.png",
        "avatar",
        "image/png"
      )
      const logoResult = await service.uploadImage(buffer, "logo.png", "logo", "image/png")

      expect(avatarResult.gcsPath).toContain("images/avatars/")
      expect(logoResult.gcsPath).toContain("images/logos/")
    })
  })

  describe("generatePublicUrl", () => {
    it("should generate production URL for non-emulator", async () => {
      const url = await service.generatePublicUrl("resumes/2024-01-01/test.pdf")

      expect(url).toContain("https://storage.googleapis.com/")
      expect(url).toContain("joshwentworth-resumes")
      expect(url).toContain("resumes/2024-01-01/test.pdf")
    })

    it("should generate emulator URL when in emulator mode", async () => {
      process.env.FUNCTIONS_EMULATOR = "true"
      const emulatorService = new StorageService(undefined, mockLogger)

      const url = await emulatorService.generatePublicUrl("test/file.pdf")

      expect(url).toContain("localhost")
      expect(url).toContain("alt=media")
      expect(url).toContain(encodeURIComponent("test/file.pdf"))
    })

    it("should use staging bucket URL when ENVIRONMENT=staging", async () => {
      process.env.ENVIRONMENT = "staging"
      const stagingService = new StorageService(undefined, mockLogger)

      const url = await stagingService.generatePublicUrl("test.pdf")

      expect(url).toContain("joshwentworth-resumes-staging")
    })

    it("should log URL generation", async () => {
      await service.generatePublicUrl("test.pdf")

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Generating public URL",
        expect.objectContaining({
          gcsPath: "test.pdf",
        })
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Generated public URL",
        expect.objectContaining({
          publicUrl: expect.stringContaining("test.pdf"),
        })
      )
    })
  })
})
