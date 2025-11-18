/**
 * Validation Helper Utilities
 *
 * Centralized validation logic to eliminate duplicate validation patterns.
 * Provides reusable validators for common use cases.
 */

import type { Response } from 'express';
import { sendValidationError } from './response-helpers';
import { PATTERNS, UPLOAD_LIMITS, PAGINATION } from '../config/constants';
import { SimpleLogger } from '../types/logger.types';

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return PATTERNS.EMAIL.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  return PATTERNS.URL.test(url);
}

/**
 * Validate UUID format
 */
export function isValidUuid(id: string): boolean {
  return PATTERNS.UUID.test(id);
}

/**
 * Validate phone number format
 */
export function isValidPhone(phone: string): boolean {
  return PATTERNS.PHONE.test(phone);
}

/**
 * Validate required string field
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0;
}

/**
 * Validate non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0;
}

/**
 * Validate array is not empty
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Validate value is within allowed enum
 */
export function isValidEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): value is T {
  return typeof value === 'string' && allowedValues.includes(value as T);
}

/**
 * Validate pagination parameters
 */
export function validatePagination(params: {
  page?: number | string;
  limit?: number | string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate page
  if (params.page !== undefined) {
    const page = Number(params.page);
    if (isNaN(page) || page < 1) {
      errors.push('Page must be a positive number');
    }
  }

  // Validate limit
  if (params.limit !== undefined) {
    const limit = Number(params.limit);
    if (isNaN(limit) || limit < 1) {
      errors.push('Limit must be a positive number');
    } else if (limit > PAGINATION.MAX_LIMIT) {
      errors.push(`Limit cannot exceed ${PAGINATION.MAX_LIMIT}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: {
  size: number;
  mimeType?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate file size
  if (file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
    errors.push(
      `File size exceeds maximum limit of ${UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB`
    );
  }

  // Validate mime type if provided
  if (file.mimeType) {
    const allowedTypes = Object.values(UPLOAD_LIMITS.ALLOWED_MIME_TYPES);
    if (!allowedTypes.includes(file.mimeType as typeof allowedTypes[number])) {
      errors.push(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate date string (ISO 8601 format)
 */
export function isValidDateString(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Validate object has required keys
 */
export function hasRequiredKeys<T extends object>(
  obj: T,
  requiredKeys: (keyof T)[]
): ValidationResult {
  const errors: string[] = [];
  const missingKeys: string[] = [];

  for (const key of requiredKeys) {
    if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
      missingKeys.push(String(key));
    }
  }

  if (missingKeys.length > 0) {
    errors.push(`Missing required fields: ${missingKeys.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate and sanitize string input
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim().replace(/[<>]/g, ''); // Basic XSS protection
}

/**
 * Validate string length
 */
export function isValidStringLength(
  str: string,
  min: number,
  max: number
): boolean {
  const length = str.trim().length;
  return length >= min && length <= max;
}

/**
 * Validate request body against schema
 * Returns true if valid, sends error response and returns false if invalid
 */
export function validateRequestBody<T extends object>(
  body: unknown,
  requiredFields: (keyof T)[],
  res: Response,
  logger?: SimpleLogger,
  requestId?: string
): body is T {
  // Check if body exists
  if (!body || typeof body !== 'object') {
    sendValidationError(res, 'Request body is required', {
      logger,
      requestId,
    });
    return false;
  }

  // Check required fields
  const validation = hasRequiredKeys(body as T, requiredFields);
  if (!validation.isValid) {
    sendValidationError(res, validation.errors.join('; '), {
      logger,
      requestId,
      logContext: { missingFields: requiredFields },
    });
    return false;
  }

  return true;
}

/**
 * Validate ID parameter from URL
 */
export function validateIdParam(
  id: unknown,
  paramName: string,
  res: Response,
  logger?: SimpleLogger,
  requestId?: string
): id is string {
  if (!isNonEmptyString(id)) {
    sendValidationError(res, `Invalid ${paramName}: must be a non-empty string`, {
      logger,
      requestId,
      logContext: { paramName, value: id },
    });
    return false;
  }

  return true;
}

/**
 * Validate and parse query parameter as number
 */
export function parseNumberParam(
  value: unknown,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  const parsed = Number(value);

  if (isNaN(parsed)) {
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    return min;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

/**
 * Validate and parse query parameter as boolean
 */
export function parseBooleanParam(
  value: unknown,
  defaultValue: boolean
): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }

  return defaultValue;
}

/**
 * Validate and parse comma-separated query parameter as array
 */
export function parseArrayParam(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(isNonEmptyString);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
  }

  return [];
}

/**
 * Combine multiple validation results
 */
export function combineValidations(
  ...validations: ValidationResult[]
): ValidationResult {
  const allErrors = validations.flatMap(v => v.errors);
  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Create a validation error message from multiple errors
 */
export function formatValidationErrors(errors: string[]): string {
  if (errors.length === 0) {
    return 'Validation failed';
  }
  if (errors.length === 1) {
    return errors[0];
  }
  return `Multiple validation errors: ${errors.join('; ')}`;
}
