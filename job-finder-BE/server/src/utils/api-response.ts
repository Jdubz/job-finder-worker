import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiErrorCode
} from '@shared/types'

export const success = <T>(data: T, message?: string): ApiSuccessResponse<T> => ({
  success: true,
  data,
  ...(message ? { message } : {})
})

export const failure = (
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse => ({
  success: false,
  error: {
    code,
    message,
    ...(details ? { details } : {})
  }
})
