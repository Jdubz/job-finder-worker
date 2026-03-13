import { describe, expect, it } from 'vitest'
import {
  parseSelectionResponse,
  filterTreeToSelection,
  trimToFit,
  AISelectionError
} from '../resume-selection.service'
import type { ResumeItemNode, ResumeContent } from '@shared/types'

// ─── parseSelectionResponse ─────────────────────────────────────

describe('parseSelectionResponse', () => {
  const validResponse = {
    narrative_id: 'n-1',
    experience_ids: ['w-1', 'w-2'],
    highlight_selections: { 'w-1': ['h-1', 'h-2'] },
    skill_ids: ['s-1'],
    project_ids: ['p-1'],
    education_ids: ['e-1'],
    reasoning: 'Selected for relevance'
  }

  it('parses valid JSON', () => {
    const result = parseSelectionResponse(JSON.stringify(validResponse))
    expect(result.narrative_id).toBe('n-1')
    expect(result.experience_ids).toEqual(['w-1', 'w-2'])
    expect(result.highlight_selections).toEqual({ 'w-1': ['h-1', 'h-2'] })
    expect(result.reasoning).toBe('Selected for relevance')
  })

  it('strips markdown code fences', () => {
    const fenced = '```json\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseSelectionResponse(fenced)
    expect(result.narrative_id).toBe('n-1')
  })

  it('strips plain code fences without language tag', () => {
    const fenced = '```\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseSelectionResponse(fenced)
    expect(result.experience_ids).toEqual(['w-1', 'w-2'])
  })

  it('applies defaults for optional fields', () => {
    const minimal = { narrative_id: 'n-1', experience_ids: ['w-1'] }
    const result = parseSelectionResponse(JSON.stringify(minimal))
    expect(result.highlight_selections).toEqual({})
    expect(result.skill_ids).toEqual([])
    expect(result.project_ids).toEqual([])
    expect(result.education_ids).toEqual([])
    expect(result.reasoning).toBe('')
  })

  it('throws AISelectionError for invalid JSON', () => {
    expect(() => parseSelectionResponse('not json at all'))
      .toThrow(AISelectionError)
  })

  it('throws AISelectionError when narrative_id is missing', () => {
    const invalid = { experience_ids: ['w-1'] }
    expect(() => parseSelectionResponse(JSON.stringify(invalid)))
      .toThrow(AISelectionError)
  })

  it('throws AISelectionError when experience_ids is empty', () => {
    const invalid = { narrative_id: 'n-1', experience_ids: [] }
    expect(() => parseSelectionResponse(JSON.stringify(invalid)))
      .toThrow(AISelectionError)
  })

  it('throws AISelectionError when highlight_selections has non-array values', () => {
    const invalid = {
      narrative_id: 'n-1',
      experience_ids: ['w-1'],
      highlight_selections: { 'w-1': 'not-an-array' }
    }
    expect(() => parseSelectionResponse(JSON.stringify(invalid)))
      .toThrow(AISelectionError)
  })
})

// ─── filterTreeToSelection ──────────────────────────────────────

describe('filterTreeToSelection', () => {
  const baseItem: ResumeItemNode = {
    id: '', resumeVersionId: 'v-1', parentId: null, orderIndex: 0,
    aiContext: null, title: null, role: null, location: null, website: null,
    startDate: null, endDate: null, description: null, skills: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    createdBy: 'test', updatedBy: 'test'
  }

  const tree: ResumeItemNode[] = [
    { ...baseItem, id: 'n-1', aiContext: 'narrative', description: 'Summary A' },
    { ...baseItem, id: 'n-2', aiContext: 'narrative', description: 'Summary B' },
    {
      ...baseItem, id: 'sec-exp', aiContext: 'section', title: 'Experience',
      children: [
        {
          ...baseItem, id: 'w-1', aiContext: 'work', title: 'Company A',
          children: [
            { ...baseItem, id: 'h-1', aiContext: 'highlight', parentId: 'w-1', description: 'Bullet 1' },
            { ...baseItem, id: 'h-2', aiContext: 'highlight', parentId: 'w-1', description: 'Bullet 2' },
            { ...baseItem, id: 'h-3', aiContext: 'highlight', parentId: 'w-1', description: 'Bullet 3' },
          ]
        },
        {
          ...baseItem, id: 'w-2', aiContext: 'work', title: 'Company B',
          children: [
            { ...baseItem, id: 'h-4', aiContext: 'highlight', parentId: 'w-2', description: 'Bullet 4' },
          ]
        }
      ]
    },
    {
      ...baseItem, id: 'sec-skills', aiContext: 'section', title: 'Skills',
      children: [
        { ...baseItem, id: 's-1', aiContext: 'skills', title: 'Languages', skills: ['TS', 'Python'] },
        { ...baseItem, id: 's-2', aiContext: 'skills', title: 'Frontend', skills: ['React'] },
      ]
    },
    { ...baseItem, id: 'p-1', aiContext: 'project', title: 'Side Project' },
    { ...baseItem, id: 'e-1', aiContext: 'education', title: 'University' },
  ]

  it('filters tree to only selected items', () => {
    const selection = {
      narrative_id: 'n-1',
      experience_ids: ['w-1'],
      highlight_selections: { 'w-1': ['h-1', 'h-3'] },
      skill_ids: ['s-1'],
      project_ids: [],
      education_ids: ['e-1'],
      reasoning: ''
    }

    const result = filterTreeToSelection(tree, selection)

    // Should include n-1 but not n-2
    const narrativeIds = result.filter(n => n.aiContext === 'narrative').map(n => n.id)
    expect(narrativeIds).toEqual(['n-1'])

    // Experience section should survive with w-1 only
    const expSection = result.find(n => n.aiContext === 'section' && n.title === 'Experience')
    expect(expSection).toBeDefined()
    expect(expSection!.children).toHaveLength(1)
    expect(expSection!.children![0].id).toBe('w-1')

    // Only selected highlights (h-1, h-3) kept, h-2 filtered out
    const highlights = expSection!.children![0].children!
    expect(highlights.map(h => h.id)).toEqual(['h-1', 'h-3'])

    // Skills section: only s-1
    const skillsSection = result.find(n => n.aiContext === 'section' && n.title === 'Skills')
    expect(skillsSection!.children).toHaveLength(1)
    expect(skillsSection!.children![0].id).toBe('s-1')

    // No project selected
    expect(result.find(n => n.aiContext === 'project')).toBeUndefined()

    // Education included
    expect(result.find(n => n.id === 'e-1')).toBeDefined()
  })

  it('removes section containers when no children survive', () => {
    const selection = {
      narrative_id: 'n-1',
      experience_ids: ['w-1'],
      highlight_selections: { 'w-1': ['h-1'] },
      skill_ids: [],
      project_ids: [],
      education_ids: [],
      reasoning: ''
    }

    const result = filterTreeToSelection(tree, selection)

    // Skills section should be removed (no skill items selected)
    expect(result.find(n => n.title === 'Skills')).toBeUndefined()
  })

  it('returns empty array when nothing selected matches', () => {
    const selection = {
      narrative_id: 'nonexistent',
      experience_ids: ['nonexistent'],
      highlight_selections: {},
      skill_ids: [],
      project_ids: [],
      education_ids: [],
      reasoning: ''
    }

    const result = filterTreeToSelection(tree, selection)
    expect(result).toHaveLength(0)
  })
})

// ─── trimToFit ──────────────────────────────────────────────────

describe('trimToFit', () => {
  const baseContent: ResumeContent = {
    personalInfo: {
      name: 'Test User',
      title: 'Engineer',
      summary: 'A summary',
      contact: { email: 'test@example.com' }
    },
    professionalSummary: 'Professional summary',
    experience: [],
    skills: [],
  }

  const makeExp = (company: string, startDate: string, highlights: string[]) => ({
    company,
    role: 'Engineer',
    startDate,
    endDate: null as string | null,
    highlights,
  })

  it('trims experience entries to max 4', () => {
    const content: ResumeContent = {
      ...baseContent,
      experience: [
        makeExp('A', '2024-01', ['a']),
        makeExp('B', '2023-01', ['b']),
        makeExp('C', '2022-01', ['c']),
        makeExp('D', '2021-01', ['d']),
        makeExp('E', '2020-01', ['e']),
      ],
    }

    const result = trimToFit(content)
    expect(result.experience.length).toBeLessThanOrEqual(4)
  })

  it('trims highlights from older roles more aggressively', () => {
    const manyHighlights = Array.from({ length: 8 }, (_, i) => `Bullet ${i + 1}`)
    const content: ResumeContent = {
      ...baseContent,
      experience: [
        makeExp('A', '2024-01', [...manyHighlights]),
        makeExp('B', '2023-01', [...manyHighlights]),
        makeExp('C', '2022-01', [...manyHighlights]),
      ],
    }

    const result = trimToFit(content)
    const [first, second, third] = result.experience
    expect(first.highlights!.length).toBeGreaterThanOrEqual(second.highlights!.length)
    expect(second.highlights!.length).toBeGreaterThanOrEqual(third.highlights!.length)
  })

  it('removes projects when content still overflows', () => {
    const manyHighlights = Array.from({ length: 8 }, (_, i) => `Bullet ${i + 1}`)
    const content: ResumeContent = {
      ...baseContent,
      experience: [
        makeExp('A', '2024-01', [...manyHighlights]),
        makeExp('B', '2023-01', [...manyHighlights]),
        makeExp('C', '2022-01', [...manyHighlights]),
        makeExp('D', '2021-01', [...manyHighlights]),
      ],
      skills: Array.from({ length: 6 }, (_, i) => ({
        category: `Cat ${i}`,
        items: ['A', 'B', 'C', 'D', 'E', 'F']
      })),
      projects: [
        { name: 'Project', description: 'A project', highlights: ['x', 'y', 'z'], technologies: ['TS'] }
      ]
    }

    const result = trimToFit(content)
    expect(result.experience.length).toBeLessThanOrEqual(4)
  })
})
