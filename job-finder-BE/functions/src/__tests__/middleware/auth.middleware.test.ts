/**
 * Tests for Authentication Middleware
 */

import type { NextFunction } from "express";
import { auth } from "firebase-admin";
import {
  verifyAuthenticatedUser,
  checkOptionalAuth,
  type AuthenticatedRequest,
} from "../../middleware/auth.middleware";
import { createMockLogger, createMockResponse } from "../helpers/test-utils";

// Mock firebase-admin auth
jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

describe("Auth Middleware", () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: ReturnType<typeof createMockResponse>;
  let mockNext: NextFunction;
  let mockVerifyIdToken: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = createMockLogger();
    mockRequest = {
      headers: {},
      requestId: "test-request-id",
    };
    mockResponse = createMockResponse();
    mockNext = jest.fn();

    // Setup mock verifyIdToken
    mockVerifyIdToken = jest.fn();
    (auth as unknown as jest.Mock).mockReturnValue({
      verifyIdToken: mockVerifyIdToken,
    });
  });

  describe("verifyAuthenticatedUser", () => {
    it("should accept valid user token without role check", async () => {
      mockRequest.headers = { authorization: "Bearer valid-token" };
      mockVerifyIdToken.mockResolvedValue({
        uid: "test-uid",
        email: "test@example.com",
        email_verified: true,
        role: "viewer",
      });

      const middleware = verifyAuthenticatedUser(mockLogger);
      await middleware(mockRequest as AuthenticatedRequest, mockResponse as any, mockNext);

      expect(mockRequest.user).toEqual({
        uid: "test-uid",
        email: "test@example.com",
        email_verified: true,
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should accept user with unverified email", async () => {
      mockRequest.headers = { authorization: "Bearer valid-token" };
      mockVerifyIdToken.mockResolvedValue({
        uid: "test-uid",
        email: "test@example.com",
        email_verified: false,
      });

      const middleware = verifyAuthenticatedUser(mockLogger);
      await middleware(mockRequest as AuthenticatedRequest, mockResponse as any, mockNext);

      expect(mockRequest.user).toEqual({
        uid: "test-uid",
        email: "test@example.com",
        email_verified: false,
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it("should reject missing authorization", async () => {
      const middleware = verifyAuthenticatedUser(mockLogger);
      await middleware(mockRequest as AuthenticatedRequest, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("checkOptionalAuth", () => {
    it("should return false when no authorization header", async () => {
      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(false);
      expect(mockRequest.user).toBeUndefined();
    });

    it("should return false for invalid token format", async () => {
      mockRequest.headers = { authorization: "InvalidFormat token123" };

      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(false);
      expect(mockRequest.user).toBeUndefined();
    });

    it("should return false for empty token", async () => {
      mockRequest.headers = { authorization: "Bearer " };

      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(false);
      expect(mockRequest.user).toBeUndefined();
    });

    it("should return false for invalid token", async () => {
      mockRequest.headers = { authorization: "Bearer invalid-token" };
      mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(false);
      expect(mockRequest.user).toBeUndefined();
    });

    it("should return false for token without email", async () => {
      mockRequest.headers = { authorization: "Bearer valid-token" };
      mockVerifyIdToken.mockResolvedValue({
        uid: "test-uid",
        email_verified: true,
      });

      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(false);
      expect(mockRequest.user).toBeUndefined();
    });

    it("should return true for valid token", async () => {
      mockRequest.headers = { authorization: "Bearer valid-token" };
      mockVerifyIdToken.mockResolvedValue({
        uid: "test-uid",
        email: "test@example.com",
        email_verified: true,
      });

      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual({
        uid: "test-uid",
        email: "test@example.com",
        email_verified: true,
      });
    });

    it("should handle unexpected errors gracefully", async () => {
      mockRequest.headers = { authorization: "Bearer valid-token" };
      // Simulate a non-standard error that doesn't get caught by token verification
      mockVerifyIdToken.mockImplementation(() => {
        throw { message: "Catastrophic failure" }; // Non-Error object
      });

      const result = await checkOptionalAuth(mockRequest as AuthenticatedRequest, mockLogger);

      expect(result).toBe(false);
      // The function logs at info level for token failures, not warning for this path
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });
});
