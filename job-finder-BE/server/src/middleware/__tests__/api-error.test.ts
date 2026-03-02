import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { apiErrorHandler, ApiHttpError } from '../api-error'
import { ApiErrorCode } from '@shared/types'

const buildTestApp = () => {
  const app = express()
  app.get('/bad-request', () => {
    throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, 'Invalid payload', {
      details: { field: 'email' }
    })
  })

  app.get('/unexpected', () => {
    throw new Error('Unexpected boom')
  })

  app.use(apiErrorHandler)
  return app
}

describe('apiErrorHandler middleware', () => {
  it('returns standardized response for ApiHttpError', async () => {
    const res = await request(buildTestApp()).get('/bad-request')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      success: false,
      error: {
        code: ApiErrorCode.INVALID_REQUEST,
        message: 'Invalid payload',
        details: expect.objectContaining({ field: 'email' }),
        stack: expect.any(String)
      }
    })
  })

  it('normalizes unknown errors to INTERNAL_ERROR', async () => {
    const res = await request(buildTestApp()).get('/unexpected')

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe(ApiErrorCode.INTERNAL_ERROR)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toBeDefined()
  })
})
