import { describe, it, expect } from 'vitest'
import { getRoleArchetype } from '../workflow/services/role-archetype'

describe('getRoleArchetype', () => {
  // ── Frontend ────────────────────────────────────────────────────────────
  it('classifies frontend roles', () => {
    expect(getRoleArchetype('frontend engineer')).toBe('frontend')
    expect(getRoleArchetype('front-end developer')).toBe('frontend')
    expect(getRoleArchetype('ui engineer')).toBe('frontend')
    expect(getRoleArchetype('react developer')).toBe('frontend')
    expect(getRoleArchetype('vue developer')).toBe('frontend')
    expect(getRoleArchetype('angular developer')).toBe('frontend')
  })

  // ── Backend ─────────────────────────────────────────────────────────────
  it('classifies backend roles', () => {
    expect(getRoleArchetype('backend engineer')).toBe('backend')
    expect(getRoleArchetype('back-end developer')).toBe('backend')
    expect(getRoleArchetype('api engineer')).toBe('backend')
    expect(getRoleArchetype('server-side developer')).toBe('backend')
  })

  // ── Fullstack ───────────────────────────────────────────────────────────
  it('classifies fullstack roles (before frontend/backend)', () => {
    expect(getRoleArchetype('full stack developer')).toBe('fullstack')
    expect(getRoleArchetype('fullstack engineer')).toBe('fullstack')
    expect(getRoleArchetype('full-stack engineer')).toBe('fullstack')
  })

  // ── DevOps/SRE ─────────────────────────────────────────────────────────
  it('classifies devops roles', () => {
    expect(getRoleArchetype('devops engineer')).toBe('devops')
    expect(getRoleArchetype('site reliability engineer')).toBe('devops')
    expect(getRoleArchetype('platform engineer')).toBe('devops')
    expect(getRoleArchetype('infrastructure engineer')).toBe('devops')
    expect(getRoleArchetype('cloud engineer')).toBe('devops')
  })

  // ── Data ────────────────────────────────────────────────────────────────
  it('classifies data roles', () => {
    expect(getRoleArchetype('data engineer')).toBe('data')
    expect(getRoleArchetype('analytics engineer')).toBe('data')
    expect(getRoleArchetype('data analyst')).toBe('data')
  })

  // ── ML/AI ───────────────────────────────────────────────────────────────
  it('classifies ml/ai roles (before data)', () => {
    expect(getRoleArchetype('machine learning engineer')).toBe('ml-ai')
    expect(getRoleArchetype('ai engineer')).toBe('ml-ai')
    expect(getRoleArchetype('deep learning researcher')).toBe('ml-ai')
    expect(getRoleArchetype('nlp engineer')).toBe('ml-ai')
    expect(getRoleArchetype('computer vision engineer')).toBe('ml-ai')
  })

  // ── Mobile ──────────────────────────────────────────────────────────────
  it('classifies mobile roles', () => {
    expect(getRoleArchetype('mobile developer')).toBe('mobile')
    expect(getRoleArchetype('ios engineer')).toBe('mobile')
    expect(getRoleArchetype('android developer')).toBe('mobile')
    expect(getRoleArchetype('react native developer')).toBe('mobile')
  })

  // ── Security ────────────────────────────────────────────────────────────
  it('classifies security roles', () => {
    expect(getRoleArchetype('security engineer')).toBe('security')
    expect(getRoleArchetype('cybersecurity analyst')).toBe('security')
    expect(getRoleArchetype('appsec engineer')).toBe('security')
  })

  // ── Embedded ────────────────────────────────────────────────────────────
  it('classifies embedded roles', () => {
    expect(getRoleArchetype('embedded engineer')).toBe('embedded')
    expect(getRoleArchetype('firmware engineer')).toBe('embedded')
    expect(getRoleArchetype('iot developer')).toBe('embedded')
  })

  // ── QA ──────────────────────────────────────────────────────────────────
  it('classifies qa roles', () => {
    expect(getRoleArchetype('qa engineer')).toBe('qa')
    expect(getRoleArchetype('sdet')).toBe('qa')
    expect(getRoleArchetype('test engineer')).toBe('qa')
    expect(getRoleArchetype('quality assurance engineer')).toBe('qa')
  })

  // ── Ambiguous → null ──────────────────────────────────────────────────
  it('returns null for ambiguous roles', () => {
    expect(getRoleArchetype('software engineer')).toBeNull()
    expect(getRoleArchetype('engineer')).toBeNull()
    expect(getRoleArchetype('developer')).toBeNull()
    expect(getRoleArchetype('programmer')).toBeNull()
  })
})
