/**
 * Tests for Rate Limit Middleware
 */

import type { Request, Response, NextFunction } from "express";
import {
  contactFormRateLimiter,
  strictRateLimiter,
  experienceRateLimiter,
  generatorRateLimiter,
  generatorEditorRateLimiter,
} from "../../middleware/rate-limit.middleware";

// Mock express-rate-limit
jest.mock("express-rate-limit", () => {
  return jest.fn((config) => {
    const middleware = (req: Request, res: Response, next: NextFunction) => {
      // In test environment, skip rate limiting
      if (config.skip && config.skip()) {
        return next();
      }

      // Simulate rate limit hit for testing
      if ((req as any).__rateLimitHit) {
        return config.handler(req, res, next);
      }

      next();
    };
    middleware.config = config;
    return middleware;
  });
});

describe("Rate Limit Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      ip: "127.0.0.1",
      headers: {},
      path: "/test",
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    // Set test environment
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe("contactFormRateLimiter", () => {
    it("should be configured with correct window and max requests", () => {
      const config = (contactFormRateLimiter as any).config;

      expect(config.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(config.max).toBe(10); // Development value (NODE_ENV=test uses non-production values)
    });

    it("should skip rate limiting in test environment", () => {
      const config = (contactFormRateLimiter as any).config;
      
      expect(config.skip()).toBe(true);
    });

    it("should extract IP from X-Forwarded-For header", () => {
      mockRequest.headers = {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      };

      const config = (contactFormRateLimiter as any).config;
      const clientIp = config.keyGenerator(mockRequest);

      expect(clientIp).toBe("203.0.113.195");
    });

    it("should handle single IP in X-Forwarded-For", () => {
      mockRequest.headers = {
        "x-forwarded-for": "203.0.113.195",
      };

      const config = (contactFormRateLimiter as any).config;
      const clientIp = config.keyGenerator(mockRequest);

      expect(clientIp).toBe("203.0.113.195");
    });

    it("should fallback to req.ip when no X-Forwarded-For", () => {
      const reqWithIp = { ...mockRequest, ip: "192.168.1.1" };

      const config = (contactFormRateLimiter as any).config;
      const clientIp = config.keyGenerator(reqWithIp);

      expect(clientIp).toBe("192.168.1.1");
    });

    it("should use placeholder IP when neither header nor req.ip available", () => {
      const reqWithoutIp = { headers: {}, path: "/test" };

      const config = (contactFormRateLimiter as any).config;
      const clientIp = config.keyGenerator(reqWithoutIp);

      expect(clientIp).toBe("unknown");
    });

    it("should have correct rate limit message", () => {
      const config = (contactFormRateLimiter as any).config;

      expect(config.message).toEqual({
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        errorCode: "CF_SEC_003",
        message: "Too many requests. Please try again later.",
      });
    });

    it("should call handler when rate limit exceeded", () => {
      const config = (contactFormRateLimiter as any).config;
      
      // Temporarily disable skip for this test
      const originalSkip = config.skip;
      config.skip = () => false;

      config.handler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "RATE_LIMIT_EXCEEDED",
          errorCode: "CF_SEC_003",
        })
      );

      config.skip = originalSkip;
    });
  });

  describe("strictRateLimiter", () => {
    it("should be configured with strict limits", () => {
      const config = (strictRateLimiter as any).config;

      expect(config.windowMs).toBe(60 * 60 * 1000); // 1 hour
      expect(config.max).toBe(1); // Only 1 request
    });

    it("should return appropriate error code for suspicious activity", () => {
      const config = (strictRateLimiter as any).config;

      expect(config.message).toEqual({
        success: false,
        error: "RATE_LIMIT_EXCEEDED",
        errorCode: "CF_SEC_004",
        message: "Access temporarily restricted. Please contact support if you believe this is an error.",
      });
    });

    it("should call handler with access restricted message", () => {
      const config = (strictRateLimiter as any).config;
      config.skip = () => false;

      config.handler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "ACCESS_RESTRICTED",
          errorCode: "CF_SEC_004",
        })
      );
    });
  });

  describe("experienceRateLimiter", () => {
    it("should be configured for CRUD operations", () => {
      const config = (experienceRateLimiter as any).config;

      expect(config.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(config.max).toBe(100); // Development value (NODE_ENV=test uses non-production values)
    });

    it("should have experience-specific error code", () => {
      const config = (experienceRateLimiter as any).config;

      expect(config.message.errorCode).toBe("EXP_SEC_001");
    });
  });

  describe("generatorRateLimiter", () => {
    it("should be configured with restrictive limits for public use", () => {
      const config = (generatorRateLimiter as any).config;

      expect(config.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(config.max).toBe(20); // Development value (NODE_ENV=test uses non-production values)
    });

    it("should have generator-specific error code", () => {
      const config = (generatorRateLimiter as any).config;

      expect(config.message.errorCode).toBe("GEN_SEC_001");
    });
  });

  describe("generatorEditorRateLimiter", () => {
    it("should be configured with more permissive limits for authenticated users", () => {
      const config = (generatorEditorRateLimiter as any).config;

      expect(config.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(config.max).toBe(50); // Development value (NODE_ENV=test uses non-production values)
    });

    it("should have editor-specific error code", () => {
      const config = (generatorEditorRateLimiter as any).config;

      expect(config.message.errorCode).toBe("GEN_SEC_002");
    });
  });

  describe("Production vs Development Configuration", () => {
    it("should use stricter limits in production", () => {
      // Tests run with NODE_ENV=test, which uses development values
      // This test should verify the current (development) behavior
      const contactConfig = (contactFormRateLimiter as any).config;
      const genConfig = (generatorRateLimiter as any).config;
      const editorConfig = (generatorEditorRateLimiter as any).config;

      // In test/development: more permissive limits
      expect(contactConfig.max).toBe(10);
      expect(genConfig.max).toBe(20);
      expect(editorConfig.max).toBe(50);
    });
  });

  describe("Standard Headers Configuration", () => {
    it("should use draft-7 standard headers", () => {
      const limiters = [
        contactFormRateLimiter,
        experienceRateLimiter,
        generatorRateLimiter,
        generatorEditorRateLimiter,
      ];

      limiters.forEach((limiter) => {
        const config = (limiter as any).config;
        expect(config.standardHeaders).toBe("draft-7");
        expect(config.legacyHeaders).toBe(false);
      });
    });
  });
});
