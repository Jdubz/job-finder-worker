/**
 * Debug 500 Errors Test Suite
 * 
 * Comprehensive analysis to identify the root cause of 500 errors
 * in the document generation pipeline.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals"
import { manageGenerator } from "../generator"
import type { Request, Response } from "firebase-functions/v2/https"

// Mock all external dependencies
jest.mock("../services/generator.service")
jest.mock("../services/content-item.service")
jest.mock("../services/pdf.service")
jest.mock("../services/storage.service")
jest.mock("../services/ai-provider.factory")
jest.mock("@google-cloud/firestore")
jest.mock("@google-cloud/secret-manager")

describe("500 Error Debug Analysis", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("Common 500 Error Scenarios", () => {
    it("should identify missing environment variables", async () => {
      // Test for missing API keys
      const originalEnv = process.env
      process.env = { ...originalEnv }
      delete process.env.GEMINI_API_KEY
      delete process.env.OPENAI_API_KEY

      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock request that would trigger AI provider creation
      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue({
          id: "test-request-123",
          status: "processing",
          steps: [
            { id: "fetch_data", name: "Fetch Data", status: "completed" },
            { id: "generate_resume", name: "Generate Resume", status: "pending" },
          ],
          intermediateResults: {
            contentItems: [],
          },
        }),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
        getPersonalInfo: jest.fn().mockResolvedValue({
          name: "Test User",
          aiPrompts: { resume: "Generate resume" },
        }),
      } as any))

      await manageGenerator(req, res)

      // Check if error is related to missing API keys
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "STEP_EXECUTION_FAILED",
        })
      )

      process.env = originalEnv
    })

    it("should identify Firestore connection issues", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock Firestore connection error
      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockRejectedValue(new Error("Firestore connection failed")),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "INTERNAL_ERROR",
          message: "Firestore connection failed",
        })
      )
    })

    it("should identify AI provider initialization failures", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock AI provider initialization failure
      const mockAIProviderFactory = await import("../services/ai-provider.factory")
      jest.mocked(mockAIProviderFactory.createAIProvider).mockRejectedValue(
        new Error("Failed to initialize AI provider: Invalid API key")
      )

      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue({
          id: "test-request-123",
          status: "processing",
          steps: [
            { id: "fetch_data", name: "Fetch Data", status: "completed" },
            { id: "generate_resume", name: "Generate Resume", status: "pending" },
          ],
          intermediateResults: {
            contentItems: [],
          },
        }),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
        getPersonalInfo: jest.fn().mockResolvedValue({
          name: "Test User",
          aiPrompts: { resume: "Generate resume" },
        }),
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "STEP_EXECUTION_FAILED",
          message: "Failed to initialize AI provider: Invalid API key",
        })
      )
    })

    it("should identify PDF generation failures", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock PDF generation failure
      const mockPDFService = await import("../services/pdf.service")
      jest.mocked(mockPDFService.PDFService).mockImplementation(() => ({
        generateResumePDF: jest.fn().mockRejectedValue(new Error("PDF generation failed: Invalid HTML")),
        generateCoverLetterPDF: jest.fn(),
      } as any))

      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue({
          id: "test-request-123",
          status: "processing",
          steps: [
            { id: "fetch_data", name: "Fetch Data", status: "completed" },
            { id: "generate_resume", name: "Generate Resume", status: "completed" },
            { id: "create_resume_pdf", name: "Create Resume PDF", status: "pending" },
          ],
          intermediateResults: {
            resumeContent: "Generated resume content",
          },
        }),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "STEP_EXECUTION_FAILED",
          message: "PDF generation failed: Invalid HTML",
        })
      )
    })

    it("should identify storage upload failures", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock storage upload failure
      const mockStorageService = await import("../services/storage.service")
      jest.mocked(mockStorageService.StorageService).mockImplementation(() => ({
        uploadFile: jest.fn().mockRejectedValue(new Error("Storage upload failed: Permission denied")),
        getSignedUrl: jest.fn(),
      } as any))

      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue({
          id: "test-request-123",
          status: "processing",
          steps: [
            { id: "fetch_data", name: "Fetch Data", status: "completed" },
            { id: "generate_resume", name: "Generate Resume", status: "completed" },
            { id: "create_resume_pdf", name: "Create Resume PDF", status: "completed" },
            { id: "upload_documents", name: "Upload Documents", status: "pending" },
          ],
          intermediateResults: {
            resumePDF: Buffer.from("PDF content"),
          },
        }),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "STEP_EXECUTION_FAILED",
          message: "Storage upload failed: Permission denied",
        })
      )
    })

    it("should identify missing personal info", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock missing personal info
      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue({
          id: "test-request-123",
          status: "processing",
          steps: [
            { id: "fetch_data", name: "Fetch Data", status: "completed" },
            { id: "generate_resume", name: "Generate Resume", status: "pending" },
          ],
          intermediateResults: {
            contentItems: [],
          },
        }),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
        getPersonalInfo: jest.fn().mockResolvedValue(null), // Missing personal info
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "STEP_EXECUTION_FAILED",
          message: "Personal info not found",
        })
      )
    })

    it("should identify missing intermediate results", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock missing intermediate results
      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue({
          id: "test-request-123",
          status: "processing",
          steps: [
            { id: "fetch_data", name: "Fetch Data", status: "completed" },
            { id: "generate_resume", name: "Generate Resume", status: "completed" },
            { id: "create_resume_pdf", name: "Create Resume PDF", status: "pending" },
          ],
          intermediateResults: {
            // Missing resumeContent
          },
        }),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "STEP_EXECUTION_FAILED",
          message: "Resume content not found in intermediate results",
        })
      )
    })
  })

  describe("Request Validation Issues", () => {
    it("should identify malformed request IDs", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/", // Empty request ID
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "VALIDATION_FAILED",
          message: "Request ID is required",
        })
      )
    })

    it("should identify non-existent requests", async () => {
      const req = {
        method: "POST",
        path: "/generator/step/non-existent-request",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock non-existent request
      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => ({
        getRequest: jest.fn().mockResolvedValue(null),
        updateSteps: jest.fn(),
        updateStatus: jest.fn(),
      } as any))

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "NOT_FOUND",
          message: "Generation request not found",
        })
      )
    })
  })

  describe("Service Dependencies", () => {
    it("should identify missing service configurations", async () => {
      // Test for missing service configurations
      const originalEnv = process.env
      process.env = { ...originalEnv }
      delete process.env.GOOGLE_CLOUD_PROJECT
      delete process.env.GCP_PROJECT

      const req = {
        method: "POST",
        path: "/generator/step/test-request-123",
        body: {},
        rawBody: Buffer.from("{}"),
      } as Request

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response

      // Mock service initialization failure
      const mockGeneratorService = await import("../services/generator.service")
      jest.mocked(mockGeneratorService.GeneratorService).mockImplementation(() => {
        throw new Error("Failed to initialize GeneratorService: Missing project configuration")
      })

      await manageGenerator(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "INTERNAL_ERROR",
        })
      )

      process.env = originalEnv
    })
  })
})
