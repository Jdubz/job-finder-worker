import { describe, it, expect } from 'vitest'
import {
  canonicalizeTech,
  canonicalizeTechStack,
  getTechCategory,
} from '../workflow/services/tech-taxonomy'

// ── canonicalizeTech ────────────────────────────────────────────────────────

describe('canonicalizeTech', () => {
  it('maps synonym to canonical form', () => {
    expect(canonicalizeTech('reactjs')).toBe('react')
    expect(canonicalizeTech('React.js')).toBe('react')
    expect(canonicalizeTech('react')).toBe('react')
  })

  it('handles case insensitivity', () => {
    expect(canonicalizeTech('TypeScript')).toBe('typescript')
    expect(canonicalizeTech('PYTHON')).toBe('python')
    expect(canonicalizeTech('NodeJS')).toBe('node.js')
  })

  it('trims whitespace', () => {
    expect(canonicalizeTech('  react  ')).toBe('react')
  })

  it('maps backend framework synonyms', () => {
    expect(canonicalizeTech('expressjs')).toBe('express')
    expect(canonicalizeTech('express.js')).toBe('express')
    expect(canonicalizeTech('fast-api')).toBe('fastapi')
  })

  it('maps cloud provider synonyms', () => {
    expect(canonicalizeTech('amazon web services')).toBe('aws')
    expect(canonicalizeTech('google cloud platform')).toBe('gcp')
    expect(canonicalizeTech('microsoft azure')).toBe('azure')
  })

  it('maps database synonyms', () => {
    expect(canonicalizeTech('postgresql')).toBe('postgres')
    expect(canonicalizeTech('psql')).toBe('postgres')
    expect(canonicalizeTech('mariadb')).toBe('mysql')
    expect(canonicalizeTech('mongo')).toBe('mongodb')
  })

  it('maps devops synonyms', () => {
    expect(canonicalizeTech('k8s')).toBe('kubernetes')
    expect(canonicalizeTech('containers')).toBe('docker')
  })

  it('passes through unknown terms lowercased', () => {
    expect(canonicalizeTech('Rust')).toBe('rust')
    expect(canonicalizeTech('Haskell')).toBe('haskell')
    expect(canonicalizeTech('COBOL')).toBe('cobol')
  })
})

// ── canonicalizeTechStack ───────────────────────────────────────────────────

describe('canonicalizeTechStack', () => {
  it('canonicalizes and sorts tech stack', () => {
    expect(canonicalizeTechStack(['TypeScript', 'reactjs', 'node'])).toEqual([
      'node.js',
      'react',
      'typescript',
    ])
  })

  it('deduplicates synonyms that resolve to same canonical', () => {
    expect(canonicalizeTechStack(['react', 'reactjs', 'React.js'])).toEqual(['react'])
  })

  it('deduplicates case variations of unknown terms', () => {
    expect(canonicalizeTechStack(['Rust', 'rust', 'RUST'])).toEqual(['rust'])
  })

  it('returns empty array for empty input', () => {
    expect(canonicalizeTechStack([])).toEqual([])
  })

  it('preserves unknown terms lowercased alongside known ones', () => {
    expect(canonicalizeTechStack(['react', 'Svelte', 'Rust'])).toEqual([
      'react',
      'rust',
      'svelte',
    ])
  })

  it('produces deterministic output regardless of input order', () => {
    const a = canonicalizeTechStack(['vue', 'typescript', 'aws'])
    const b = canonicalizeTechStack(['aws', 'vue', 'typescript'])
    expect(a).toEqual(b)
  })
})

// ── getTechCategory ─────────────────────────────────────────────────────────

describe('getTechCategory', () => {
  it('returns category for known canonical terms', () => {
    expect(getTechCategory('react')).toBe('frontend')
    expect(getTechCategory('typescript')).toBe('language')
    expect(getTechCategory('express')).toBe('backend')
    expect(getTechCategory('aws')).toBe('cloud')
    expect(getTechCategory('postgres')).toBe('database')
    expect(getTechCategory('docker')).toBe('devops')
    expect(getTechCategory('graphql')).toBe('api')
    expect(getTechCategory('redis')).toBe('cache')
  })

  it('returns null for unknown terms', () => {
    expect(getTechCategory('rust')).toBeNull()
    expect(getTechCategory('haskell')).toBeNull()
  })
})
