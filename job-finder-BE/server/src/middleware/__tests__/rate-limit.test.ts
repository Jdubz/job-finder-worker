import { describe, expect, it, vi, afterEach } from 'vitest'
import { rateLimit } from '../rate-limit'

const makeReq = (ip?: string) => ({ ip, headers: {} } as any)
const makeRes = () => {
  const res: any = {}
  res.statusCode = 200
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('rateLimit middleware', () => {
  let stop: (() => void) | undefined
  afterEach(() => {
    stop?.()
    stop = undefined
  })

  it('allows under limit and blocks when exceeding', () => {
    const middleware: any = rateLimit({ windowMs: 1000, max: 2 })
    stop = middleware.stop
    const req = makeReq('1.1.1.1')
    const res = makeRes()
    const next = vi.fn()

    middleware(req, res, next)
    middleware(req, res, next)
    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(2)

    const res2 = makeRes()
    const next2 = vi.fn()
    middleware(req, res2, next2)
    expect(res2.status).toHaveBeenCalledWith(429)
    expect(next2).not.toHaveBeenCalled()
  })

  it('skips when no key is available', () => {
    const middleware: any = rateLimit({ windowMs: 1000, max: 1, keyGenerator: () => null })
    stop = middleware.stop
    const req = makeReq(undefined)
    const res = makeRes()
    const next = vi.fn()
    middleware(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})
