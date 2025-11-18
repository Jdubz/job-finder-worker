/**
 * API Types Usage Examples
 *
 * This file demonstrates how to use the API types in your application.
 * Compile test only - not meant to be executed.
 */

import type {
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
  CallableContext,
  CallableResponse,
  GenerateResumeRequest,
  GenerateResumeResponse,
  CreateContentItemRequest,
  ListQueueItemsRequest,
} from "../src/index"

import {
  ApiErrorCode,
  isApiSuccess,
  isApiError,
  createSuccessResponse,
  createErrorResponse,
} from "../src/index"

// Example 1: Type-safe API response
const successExample: ApiSuccessResponse<{ id: string }> = {
  success: true,
  data: { id: "123" },
  message: "Operation successful"
}

const errorExample: ApiErrorResponse = {
  success: false,
  error: {
    code: ApiErrorCode.NOT_FOUND,
    message: "Resource not found"
  }
}

// Example 2: Using discriminated unions
function handleResponse(response: ApiResponse<{ id: string }>) {
  if (isApiSuccess(response)) {
    // TypeScript knows response.data exists here
    return response.data.id
  } else {
    // TypeScript knows response.error exists here
    throw new Error(response.error.message)
  }
}

// Example 3: Generator API types
const generateRequest: GenerateResumeRequest = {
  jobMatchId: "match-123",
  customizations: {
    skillsToHighlight: ["TypeScript", "React"],
  },
  options: {
    format: "pdf"
  }
}

const generateResponse: ApiResponse<GenerateResumeResponse> = {
  success: true,
  data: {
    documentId: "doc-789",
    documentUrl: "https://example.com/resume.pdf",
    generatedAt: "2024-01-01T00:00:00Z",
    metadata: {
      wordCount: 450,
      sections: ["Summary", "Experience"],
      format: "pdf",
    },
  }
}

// Example 4: Firebase Callable type
type MyCallable = (
  data: { userId: string },
  context: CallableContext
) => Promise<CallableResponse<{ result: string }>>

// Example 5: Helper functions
const success = createSuccessResponse({ id: "123" }, "Created")
const error = createErrorResponse(ApiErrorCode.VALIDATION_FAILED, "Invalid input")

// Type-check successful - this file compiles
export {}
