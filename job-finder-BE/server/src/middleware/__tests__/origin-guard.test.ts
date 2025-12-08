import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildOriginGuard } from '../origin-guard'
import { ApiHttpError } from '../api-error'

const makeRes = () => ({}) as any

describe('origin guard', () => {
  const allowed = ['https://example.com']
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('allows GET without origin', () => {
    const guard = buildOriginGuard(allowed)
    const next = vi.fn()
    guard({ method: 'GET', headers: {} } as any, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('allows allowed origin on POST', () => {
    process.env.NODE_ENV = 'production'
    const guard = buildOriginGuard(allowed)
    const next = vi.fn()
    guard({ method: 'POST', headers: { origin: 'https://example.com' } } as any, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('allows missing origin when Authorization header present', () => {
    process.env.NODE_ENV = 'production'
    const guard = buildOriginGuard(allowed)
    const next = vi.fn()
    guard({ method: 'POST', headers: { authorization: 'Bearer token' } } as any, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks disallowed origin', () => {
    process.env.NODE_ENV = 'production'
    const guard = buildOriginGuard(allowed)
    const next = vi.fn()
    guard({ method: 'POST', headers: { origin: 'https://evil.com' } } as any, makeRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(ApiHttpError))
  })
})
