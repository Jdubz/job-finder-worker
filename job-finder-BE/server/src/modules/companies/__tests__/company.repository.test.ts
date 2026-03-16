import { beforeEach, describe, expect, it } from 'vitest'
import { CompanyRepository } from '../company.repository'
import type { CreateCompanyInput } from '../company.repository'
import { getDb } from '../../../db/sqlite'

describe('CompanyRepository', () => {
  const repo = new CompanyRepository()
  const db = getDb()

  beforeEach(() => {
    db.prepare('DELETE FROM companies').run()
  })

  const createTestCompany = (overrides: Partial<CreateCompanyInput> = {}) => {
    const company = repo.create({
      name: 'Acme Corp',
      website: 'https://acme.com',
      about: 'A test company',
      techStack: ['TypeScript', 'React'],
      industry: 'Technology',
      ...overrides
    })
    // repo.create always returns a company with an id
    return company as typeof company & { id: string }
  }

  describe('create', () => {
    it('creates a company with generated ID', () => {
      const company = createTestCompany()

      expect(company.id).toBeDefined()
      expect(company.name).toBe('Acme Corp')
      expect(company.website).toBe('https://acme.com')
      expect(company.about).toBe('A test company')
      expect(company.techStack).toEqual(['TypeScript', 'React'])
      expect(company.createdAt).toBeInstanceOf(Date)
      expect(company.updatedAt).toBeInstanceOf(Date)
    })

    it('uses provided ID when given', () => {
      const company = repo.create({
        id: 'custom-id',
        name: 'Custom Co',
        website: '',
        techStack: []
      })

      expect(company.id).toBe('custom-id')
    })
  })

  describe('getById', () => {
    it('returns company by ID', () => {
      const created = createTestCompany()
      const fetched = repo.getById(created.id)

      expect(fetched).not.toBeNull()
      expect(fetched!.name).toBe('Acme Corp')
    })

    it('returns null for non-existent ID', () => {
      expect(repo.getById('nonexistent')).toBeNull()
    })
  })

  describe('list', () => {
    it('returns paginated results', () => {
      createTestCompany({ name: 'Alpha' })
      createTestCompany({ name: 'Beta' })
      createTestCompany({ name: 'Gamma' })

      const { items, total } = repo.list({ limit: 2 })

      expect(items).toHaveLength(2)
      expect(total).toBe(3)
    })

    it('filters by industry', () => {
      createTestCompany({ name: 'Tech Co', industry: 'Technology' })
      createTestCompany({ name: 'Health Co', industry: 'Healthcare' })

      const { items } = repo.list({ industry: 'Technology' })

      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Tech Co')
    })

    it('filters by search term (name)', () => {
      createTestCompany({ name: 'Alpha Corp' })
      createTestCompany({ name: 'Beta Inc' })

      const { items } = repo.list({ search: 'alpha' })

      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Alpha Corp')
    })

    it('sorts by name ascending', () => {
      createTestCompany({ name: 'Charlie' })
      createTestCompany({ name: 'Alpha' })
      createTestCompany({ name: 'Beta' })

      const { items } = repo.list({ sortBy: 'name', sortOrder: 'asc' })

      expect(items[0].name).toBe('Alpha')
      expect(items[1].name).toBe('Beta')
      expect(items[2].name).toBe('Charlie')
    })

    it('supports offset pagination', () => {
      createTestCompany({ name: 'A' })
      createTestCompany({ name: 'B' })
      createTestCompany({ name: 'C' })

      const { items } = repo.list({ sortBy: 'name', sortOrder: 'asc', limit: 2, offset: 1 })

      expect(items).toHaveLength(2)
      expect(items[0].name).toBe('B')
    })
  })

  describe('update', () => {
    it('updates specific fields', () => {
      const company = createTestCompany()
      const updated = repo.update(company.id, { name: 'Acme Updated', industry: 'Finance' })

      expect(updated!.name).toBe('Acme Updated')
      expect(updated!.industry).toBe('Finance')
      expect(updated!.about).toBe('A test company') // unchanged
    })

    it('updates techStack as JSON', () => {
      const company = createTestCompany()
      const updated = repo.update(company.id, { techStack: ['Go', 'Rust'] })

      expect(updated!.techStack).toEqual(['Go', 'Rust'])
    })

    it('returns null for non-existent company', () => {
      const result = repo.update('nonexistent', { name: 'New Name' })
      expect(result).toBeNull()
    })

    it('clears fields when set to null', () => {
      const company = createTestCompany({ about: 'Some info' })
      const updated = repo.update(company.id, { about: null })

      expect(updated!.about).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes a company', () => {
      const company = createTestCompany()
      repo.delete(company.id)

      expect(repo.getById(company.id)).toBeNull()
    })
  })
})
