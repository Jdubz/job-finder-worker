import { describe, expect, it } from 'vitest'
import { normalizeUrl, displayUrl } from '../url.util'

describe('normalizeUrl', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeUrl('   ')).toBe('')
    expect(normalizeUrl('\t\n')).toBe('')
  })

  it('returns empty string for null-ish input', () => {
    expect(normalizeUrl(null as unknown as string)).toBe('')
    expect(normalizeUrl(undefined as unknown as string)).toBe('')
  })

  it('adds https:// prefix when no protocol present', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('www.example.com/path')).toBe('https://www.example.com/path')
  })

  it('preserves existing https:// protocol', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
    expect(normalizeUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM')
  })

  it('preserves existing http:// protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeUrl('HTTP://example.com')).toBe('HTTP://example.com')
  })

  it('trims whitespace from input', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com')
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com')
  })

  it('handles URLs with paths, query strings, and fragments', () => {
    expect(normalizeUrl('example.com/path?query=1#hash')).toBe('https://example.com/path?query=1#hash')
    expect(normalizeUrl('https://example.com/path?query=1#hash')).toBe('https://example.com/path?query=1#hash')
  })
})

describe('displayUrl', () => {
  it('strips https:// protocol', () => {
    expect(displayUrl('https://linkedin.com/in/josh')).toBe('linkedin.com/in/josh')
  })

  it('strips http:// protocol', () => {
    expect(displayUrl('http://github.com/josh')).toBe('github.com/josh')
  })

  it('strips protocol case-insensitively', () => {
    expect(displayUrl('HTTPS://github.com/josh')).toBe('github.com/josh')
    expect(displayUrl('Https://LinkedIn.com/in/josh')).toBe('LinkedIn.com/in/josh')
  })

  it('strips www. prefix', () => {
    expect(displayUrl('https://www.linkedin.com/in/josh')).toBe('linkedin.com/in/josh')
    expect(displayUrl('www.github.com/josh')).toBe('github.com/josh')
  })

  it('strips trailing slash', () => {
    expect(displayUrl('https://joshwentworth.com/')).toBe('joshwentworth.com')
  })

  it('handles bare domain input (no protocol)', () => {
    expect(displayUrl('linkedin.com/in/josh')).toBe('linkedin.com/in/josh')
    expect(displayUrl('github.com/josh')).toBe('github.com/josh')
  })

  it('returns empty string for empty input', () => {
    expect(displayUrl('')).toBe('')
  })
})
