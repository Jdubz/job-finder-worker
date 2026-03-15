import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInitialSteps, startStep, completeStep } from '../workflow/generation-steps'

describe('createInitialSteps', () => {
  it('creates resume steps in correct order', () => {
    const steps = createInitialSteps('resume')
    expect(steps.map((s) => s.id)).toEqual(['collect-data', 'generate-resume', 'review-resume', 'render-pdf'])
  })

  it('creates cover letter steps in correct order', () => {
    const steps = createInitialSteps('coverLetter')
    expect(steps.map((s) => s.id)).toEqual([
      'collect-data',
      'generate-cover-letter',
      'review-cover-letter',
      'render-pdf'
    ])
  })

  it('creates both-doc steps in correct order', () => {
    const steps = createInitialSteps('both')
    expect(steps.map((s) => s.id)).toEqual([
      'collect-data',
      'generate-resume',
      'review-resume',
      'generate-cover-letter',
      'review-cover-letter',
      'render-pdf'
    ])
  })

  it('all steps start with pending status', () => {
    for (const type of ['resume', 'coverLetter', 'both'] as const) {
      const steps = createInitialSteps(type)
      for (const step of steps) {
        expect(step.status).toBe('pending')
      }
    }
  })

  it('each step has name and description', () => {
    const steps = createInitialSteps('resume')
    for (const step of steps) {
      expect(step.name).toBeTruthy()
      expect(step.description).toBeTruthy()
    }
  })

  it('returns empty array for unknown generation type', () => {
    const steps = createInitialSteps('unknown' as any)
    expect(steps).toEqual([])
  })
})

describe('startStep', () => {
  it('sets step status to in_progress and adds startedAt', () => {
    const steps = createInitialSteps('resume')
    const updated = startStep(steps, 'collect-data')

    const started = updated.find((s) => s.id === 'collect-data')!
    expect(started.status).toBe('in_progress')
    expect(started.startedAt).toBeInstanceOf(Date)
  })

  it('does not modify other steps', () => {
    const steps = createInitialSteps('resume')
    const updated = startStep(steps, 'collect-data')

    const others = updated.filter((s) => s.id !== 'collect-data')
    for (const step of others) {
      expect(step.status).toBe('pending')
      expect(step.startedAt).toBeUndefined()
    }
  })

  it('returns new array (immutable)', () => {
    const steps = createInitialSteps('resume')
    const updated = startStep(steps, 'collect-data')
    expect(updated).not.toBe(steps)
    expect(steps[0].status).toBe('pending')
  })

  it('leaves steps unchanged when id does not match', () => {
    const steps = createInitialSteps('resume')
    const updated = startStep(steps, 'nonexistent-step')
    for (const step of updated) {
      expect(step.status).toBe('pending')
    }
  })
})

describe('completeStep', () => {
  let now: Date

  beforeEach(() => {
    now = new Date('2026-03-15T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets step status to completed and adds completedAt', () => {
    const steps = startStep(createInitialSteps('resume'), 'collect-data')
    const updated = completeStep(steps, 'collect-data', 'completed')

    const completed = updated.find((s) => s.id === 'collect-data')!
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeInstanceOf(Date)
  })

  it('calculates duration from startedAt', () => {
    const steps = startStep(createInitialSteps('resume'), 'collect-data')
    // Advance time by 500ms
    vi.advanceTimersByTime(500)
    const updated = completeStep(steps, 'collect-data', 'completed')

    const completed = updated.find((s) => s.id === 'collect-data')!
    expect(completed.duration).toBe(500)
  })

  it('sets status to failed when specified', () => {
    const steps = startStep(createInitialSteps('resume'), 'generate-resume')
    const updated = completeStep(steps, 'generate-resume', 'failed')

    expect(updated.find((s) => s.id === 'generate-resume')!.status).toBe('failed')
  })

  it('attaches result when provided', () => {
    const steps = startStep(createInitialSteps('resume'), 'collect-data')
    const result = { data: 'some result' }
    const updated = completeStep(steps, 'collect-data', 'completed', result)

    expect(updated.find((s) => s.id === 'collect-data')!.result).toEqual(result)
  })

  it('attaches error when provided', () => {
    const steps = startStep(createInitialSteps('resume'), 'generate-resume')
    const error = { message: 'AI failed' }
    const updated = completeStep(steps, 'generate-resume', 'failed', undefined, error)

    expect(updated.find((s) => s.id === 'generate-resume')!.error).toEqual(error)
  })

  it('preserves existing result if none provided', () => {
    let steps = startStep(createInitialSteps('resume'), 'collect-data')
    // Manually set a result on the step
    steps = steps.map((s) => (s.id === 'collect-data' ? { ...s, result: { existing: true } } : s))
    const updated = completeStep(steps, 'collect-data', 'completed')

    expect(updated.find((s) => s.id === 'collect-data')!.result).toEqual({ existing: true })
  })

  it('does not modify other steps', () => {
    const steps = startStep(createInitialSteps('resume'), 'collect-data')
    const updated = completeStep(steps, 'collect-data', 'completed')

    const others = updated.filter((s) => s.id !== 'collect-data')
    for (const step of others) {
      expect(step.status).toBe('pending')
      expect(step.completedAt).toBeUndefined()
    }
  })

  it('handles step without startedAt (duration is undefined)', () => {
    const steps = createInitialSteps('resume')
    // Complete without starting first — edge case
    const updated = completeStep(steps, 'collect-data', 'completed')

    const completed = updated.find((s) => s.id === 'collect-data')!
    expect(completed.status).toBe('completed')
    expect(completed.duration).toBeUndefined()
  })
})
