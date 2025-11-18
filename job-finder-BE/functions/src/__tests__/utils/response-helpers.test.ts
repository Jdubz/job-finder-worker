/**
 * Tests for Response Helper Utilities
 */

import {
  sendErrorResponse,
  sendSuccessResponse,
  sendValidationError,
  sendAuthError,
  sendForbiddenError,
  sendNotFoundError,
  sendRateLimitError,
  sendInternalError,
  asyncHandler,
  validateRequiredFields,
  sendPaginatedResponse,
} from '../../utils/response-helpers';
import { createMockLogger, createMockResponse } from '../helpers/test-utils';

describe('Response Helpers', () => {
  let mockResponse: ReturnType<typeof createMockResponse>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResponse = createMockResponse();
    mockLogger = createMockLogger();
  });

  describe('sendErrorResponse', () => {
    it('should send error response with correct status and format', () => {
      sendErrorResponse(
        mockResponse as any,
        400,
        'Test error',
        'TEST_ERROR'
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Test error',
          code: 'TEST_ERROR',
          timestamp: expect.any(String),
        })
      );
    });

    it('should generate default error code when not provided', () => {
      sendErrorResponse(
        mockResponse as any,
        404,
        'Not found'
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'HTTP_404',
        })
      );
    });

    it('should log error when logger provided', () => {
      sendErrorResponse(
        mockResponse as any,
        500,
        'Internal error',
        'INTERNAL',
        { logger: mockLogger, requestId: 'req-123' }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Internal error',
        expect.objectContaining({
          statusCode: 500,
          code: 'INTERNAL',
          requestId: 'req-123',
        })
      );
    });

    it('should include requestId in response', () => {
      sendErrorResponse(
        mockResponse as any,
        400,
        'Bad request',
        'BAD_REQUEST',
        { requestId: 'req-456' }
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-456',
        })
      );
    });

    it('should include log context when provided', () => {
      sendErrorResponse(
        mockResponse as any,
        400,
        'Validation failed',
        'VALIDATION',
        {
          logger: mockLogger,
          logContext: { field: 'email', value: 'invalid' },
        }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Validation failed',
        expect.objectContaining({
          field: 'email',
          value: 'invalid',
        })
      );
    });
  });

  describe('sendSuccessResponse', () => {
    it('should send success response with correct format', () => {
      const testData = { id: 1, name: 'Test' };

      sendSuccessResponse(
        mockResponse as any,
        testData
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: testData,
          timestamp: expect.any(String),
        })
      );
    });

    it('should use custom status code when provided', () => {
      sendSuccessResponse(
        mockResponse as any,
        { created: true },
        { statusCode: 201 }
      );

      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('should log success when logger provided', () => {
      sendSuccessResponse(
        mockResponse as any,
        { data: 'test' },
        { logger: mockLogger, requestId: 'req-789' }
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Request successful',
        expect.objectContaining({
          statusCode: 200,
          requestId: 'req-789',
        })
      );
    });

    it('should include requestId in response', () => {
      sendSuccessResponse(
        mockResponse as any,
        { result: 'ok' },
        { requestId: 'req-abc' }
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-abc',
        })
      );
    });
  });

  describe('sendValidationError', () => {
    it('should send 400 status with validation error code', () => {
      sendValidationError(
        mockResponse as any,
        'Invalid input'
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid input',
          code: 'VALIDATION_ERROR',
        })
      );
    });
  });

  describe('sendAuthError', () => {
    it('should send 401 status with default message', () => {
      sendAuthError(mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('should use custom message when provided', () => {
      sendAuthError(
        mockResponse as any,
        'Invalid credentials'
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid credentials',
        })
      );
    });
  });

  describe('sendForbiddenError', () => {
    it('should send 403 status with default message', () => {
      sendForbiddenError(mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
        })
      );
    });
  });

  describe('sendNotFoundError', () => {
    it('should send 404 status with resource name', () => {
      sendNotFoundError(
        mockResponse as any,
        'User'
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User not found',
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('sendRateLimitError', () => {
    it('should send 429 status with default message', () => {
      sendRateLimitError(mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT',
        })
      );
    });
  });

  describe('sendInternalError', () => {
    it('should send 500 status with default message', () => {
      sendInternalError(mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        })
      );
    });

    it('should log error details when error object provided', () => {
      const testError = new Error('Test error');
      testError.stack = 'Error stack trace';

      sendInternalError(
        mockResponse as any,
        'Something went wrong',
        testError,
        { logger: mockLogger, requestId: 'req-err' }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Internal server error',
        expect.objectContaining({
          error: 'Test error',
          stack: 'Error stack trace',
          requestId: 'req-err',
        })
      );
    });
  });

  describe('validateRequiredFields', () => {
    it('should return true when all required fields present', () => {
      const data = { name: 'John', email: 'john@example.com' };
      const fields = ['name', 'email'];

      const result = validateRequiredFields(
        data,
        fields,
        mockResponse as any
      );

      expect(result).toBe(true);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return false and send error when fields missing', () => {
      const data = { name: 'John' };
      const fields = ['name', 'email', 'phone'];

      const result = validateRequiredFields(
        data,
        fields,
        mockResponse as any
      );

      expect(result).toBe(false);
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Missing required fields: email, phone',
        })
      );
    });

    it('should log missing fields when logger provided', () => {
      const data = { name: 'John' };
      const fields = ['name', 'email'];

      validateRequiredFields(
        data,
        fields,
        mockResponse as any,
        mockLogger,
        'req-validate'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          missingFields: ['email'],
          requestId: 'req-validate',
        })
      );
    });
  });

  describe('sendPaginatedResponse', () => {
    it('should send paginated response with metadata', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const total = 10;
      const page = 1;
      const limit = 3;

      sendPaginatedResponse(
        mockResponse as any,
        items,
        total,
        page,
        limit
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            items,
            pagination: {
              total: 10,
              page: 1,
              limit: 3,
              totalPages: 4,
              hasNext: true,
              hasPrev: false,
            },
          }),
        })
      );
    });

    it('should calculate pagination correctly for last page', () => {
      const items = [{ id: 10 }];
      const total = 10;
      const page = 4;
      const limit = 3;

      sendPaginatedResponse(
        mockResponse as any,
        items,
        total,
        page,
        limit
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pagination: expect.objectContaining({
              hasNext: false,
              hasPrev: true,
            }),
          }),
        })
      );
    });

    it('should handle single page results', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const total = 2;
      const page = 1;
      const limit = 10;

      sendPaginatedResponse(
        mockResponse as any,
        items,
        total,
        page,
        limit
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pagination: expect.objectContaining({
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            }),
          }),
        })
      );
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const asyncFn = jest.fn().mockResolvedValue(undefined);
      const handler = asyncHandler(asyncFn);

      const mockReq = { path: '/test', method: 'GET' };
      await handler(mockReq, mockResponse as any);

      expect(asyncFn).toHaveBeenCalledWith(mockReq, mockResponse);
    });

    it('should catch and handle async errors', async () => {
      const testError = new Error('Async operation failed');
      const asyncFn = jest.fn().mockRejectedValue(testError);
      const handler = asyncHandler(asyncFn);

      const mockReq = { path: '/test', method: 'POST' };
      await handler(mockReq, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'An unexpected error occurred',
          code: 'INTERNAL_ERROR',
        })
      );
    });
  });
});
