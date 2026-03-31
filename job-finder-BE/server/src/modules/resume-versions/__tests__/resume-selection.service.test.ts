import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ResumeItemNode, ResumeContent, PersonalInfo } from '@shared/types'

// ─── Top-level mocks (Vitest hoists vi.mock to module scope) ────

vi.mock('../../generator/personal-info.store', () => ({
  PersonalInfoStore: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({
      name: 'Test User',
      email: 'test@example.com',
      applicationInfo: 'Test'
    })
  }))
}))

vi.mock('../resume-version.publish', async (importOriginal) => {
  const original = await importOriginal() as any
  return {
    ...original,
    // Keep real buildItemTree, mock transformItemsToResumeContent
    transformItemsToResumeContent: vi.fn().mockReturnValue({
      personalInfo: { name: 'Test User', title: 'Software Engineer', summary: 'Summary', contact: { email: 'test@example.com' } },
      professionalSummary: 'A professional summary',
      experience: [{ company: 'AWS', role: 'Solutions Architect', startDate: '2022-01', endDate: null, highlights: ['Led migration', 'Built CI/CD'] }],
      skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
      education: [{ institution: 'State University', degree: 'B.S.', field: 'Computer Science' }]
    } satisfies ResumeContent)
  }
})

vi.mock('../../generator/workflow/services/content-fit.service', async (importOriginal) => {
  const original = await importOriginal() as any
  return {
    ...original,
    estimateContentFit: vi.fn().mockReturnValue({
      mainColumnLines: 40,
      sidebarLines: 10,
      fits: true,
      overflow: 0,
      suggestions: []
    })
  }
})

import {
  parseSelectionResponse,
  filterTreeToSelection,
  trimToFit,
  expandToFit,
  expandOneStep,
  trimOneStep,
  AISelectionError,
  ResumeSelectionService,
  PoolNotFoundError,
  JobMatchNotFoundError,
} from '../resume-selection.service'

// ─── parseSelectionResponse ─────────────────────────────────────

describe('parseSelectionResponse', () => {
  const validResponse = {
    narrative_id: 'n-1', resume_title: 'Software Engineer',
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
    expect(result.resume_title).toBe('')
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
      narrative_id: 'n-1', resume_title: 'Software Engineer',
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
      narrative_id: 'n-1', resume_title: 'Software Engineer',
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
      narrative_id: 'n-1', resume_title: 'Software Engineer',
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
      resume_title: 'Engineer',
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

  it('does not modify content that already fits', () => {
    const content: ResumeContent = {
      ...baseContent,
      experience: [
        makeExp('A', '2024-01', ['a', 'b']),
        makeExp('B', '2023-01', ['c']),
      ],
    }

    const result = trimToFit(content)
    expect(result.experience).toHaveLength(2)
    expect(result.experience[0].highlights).toEqual(['a', 'b'])
    expect(result.experience[1].highlights).toEqual(['c'])
  })

  it('returns original when no experience entries', () => {
    const result = trimToFit(baseContent)
    expect(result.experience).toEqual([])
  })

  it('trims skill categories to 3 when still overflowing after project removal', async () => {
    // Force estimateContentFit to return fits: false so all trim phases run
    const { estimateContentFit } = await import('../../generator/workflow/services/content-fit.service')
    const overflowResult = {
      mainColumnLines: 70,
      sidebarLines: 20,
      fits: false,
      overflow: 14,
      suggestions: []
    }
    vi.mocked(estimateContentFit).mockReturnValue(overflowResult)

    const manyHighlights = Array.from({ length: 8 }, (_, i) => `Bullet ${i + 1}`)
    const content: ResumeContent = {
      ...baseContent,
      experience: [
        makeExp('A', '2024-01', [...manyHighlights]),
        makeExp('B', '2023-01', [...manyHighlights]),
        makeExp('C', '2022-01', [...manyHighlights]),
        makeExp('D', '2021-01', [...manyHighlights]),
      ],
      skills: Array.from({ length: 8 }, (_, i) => ({
        category: `Cat ${i}`,
        items: ['A', 'B', 'C', 'D', 'E', 'F']
      })),
    }

    const result = trimToFit(content)
    expect(result.skills!.length).toBeLessThanOrEqual(3)

    // Restore default mock so later tests aren't affected
    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 40,
      sidebarLines: 10,
      fits: true,
      overflow: 0,
      suggestions: []
    })
  })
})

// ─── parseSelectionResponse — additional edge cases ─────────────

describe('parseSelectionResponse — additional edge cases', () => {
  it('handles extra whitespace around JSON', () => {
    const json = JSON.stringify({
      narrative_id: 'n-1',
      experience_ids: ['w-1']
    })
    const result = parseSelectionResponse('  \n' + json + '  \n')
    expect(result.narrative_id).toBe('n-1')
  })

  it('handles markdown fences with json language tag', () => {
    const json = JSON.stringify({
      narrative_id: 'n-1',
      experience_ids: ['w-1']
    })
    const fenced = '```json\n' + json + '\n```'
    const result = parseSelectionResponse(fenced)
    expect(result.narrative_id).toBe('n-1')
  })

  it('throws when narrative_id is empty string', () => {
    const invalid = { narrative_id: '', experience_ids: ['w-1'] }
    expect(() => parseSelectionResponse(JSON.stringify(invalid)))
      .toThrow(AISelectionError)
  })

  it('throws when experience_ids contains non-string values', () => {
    const invalid = { narrative_id: 'n-1', experience_ids: [123] }
    expect(() => parseSelectionResponse(JSON.stringify(invalid)))
      .toThrow(AISelectionError)
  })

  it('accepts extra fields without error', () => {
    const withExtra = {
      narrative_id: 'n-1',
      experience_ids: ['w-1'],
      extra_field: 'should be ignored'
    }
    const result = parseSelectionResponse(JSON.stringify(withExtra))
    expect(result.narrative_id).toBe('n-1')
  })
})

// ─── filterTreeToSelection — additional edge cases ──────────────

describe('filterTreeToSelection — additional edge cases', () => {
  const baseItem: ResumeItemNode = {
    id: '', resumeVersionId: 'v-1', parentId: null, orderIndex: 0,
    aiContext: null, title: null, role: null, location: null, website: null,
    startDate: null, endDate: null, description: null, skills: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    createdBy: 'test', updatedBy: 'test'
  }

  it('keeps all highlights for selected projects', () => {
    const tree: ResumeItemNode[] = [
      {
        ...baseItem, id: 'p-1', aiContext: 'project', title: 'My Project',
        children: [
          { ...baseItem, id: 'ph-1', aiContext: 'highlight', description: 'Built it' },
          { ...baseItem, id: 'ph-2', aiContext: 'highlight', description: 'Shipped it' },
        ]
      }
    ]

    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1'], highlight_selections: {},
      skill_ids: [], project_ids: ['p-1'], education_ids: [],
      reasoning: ''
    }

    const result = filterTreeToSelection(tree, selection)
    const project = result.find(n => n.id === 'p-1')
    expect(project).toBeDefined()
    // Projects keep all their highlights (no filtering)
    expect(project!.children).toHaveLength(2)
  })

  it('keeps work entry even when no highlights are selected for it', () => {
    const tree: ResumeItemNode[] = [{
      ...baseItem, id: 'sec', aiContext: 'section', title: 'Experience',
      children: [{
        ...baseItem, id: 'w-1', aiContext: 'work', title: 'Company',
        children: [
          { ...baseItem, id: 'h-1', aiContext: 'highlight', description: 'Bullet' },
        ]
      }]
    }]

    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1'],
      highlight_selections: {}, // empty — no highlights selected
      skill_ids: [], project_ids: [], education_ids: [],
      reasoning: ''
    }

    const result = filterTreeToSelection(tree, selection)
    const exp = result.find(n => n.aiContext === 'section')
    expect(exp).toBeDefined()
    const work = exp!.children![0]
    expect(work.id).toBe('w-1')
    // All highlights should be filtered out since none are in highlight_selections
    expect(work.children).toHaveLength(0)
  })

  it('preserves non-highlight children of work entries', () => {
    const tree: ResumeItemNode[] = [{
      ...baseItem, id: 'sec', aiContext: 'section', title: 'Experience',
      children: [{
        ...baseItem, id: 'w-1', aiContext: 'work', title: 'Company',
        children: [
          { ...baseItem, id: 'h-1', aiContext: 'highlight', description: 'Bullet' },
          { ...baseItem, id: 'tech-1', aiContext: 'skills', title: 'Tech', skills: ['TS'] },
        ]
      }]
    }]

    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1'],
      highlight_selections: { 'w-1': ['h-1'] },
      skill_ids: [], project_ids: [], education_ids: [],
      reasoning: ''
    }

    const result = filterTreeToSelection(tree, selection)
    const work = result[0].children![0]
    // Both h-1 (selected highlight) and tech-1 (non-highlight, kept) should survive
    expect(work.children!.map(c => c.id)).toContain('h-1')
    expect(work.children!.map(c => c.id)).toContain('tech-1')
  })

  it('handles empty tree gracefully', () => {
    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1'], highlight_selections: {},
      skill_ids: [], project_ids: [], education_ids: [],
      reasoning: ''
    }

    const result = filterTreeToSelection([], selection)
    expect(result).toEqual([])
  })
})

// ─── expandToFit ─────────────────────────────────────────────────

describe('expandToFit', () => {
  const baseItem: ResumeItemNode = {
    id: '', resumeVersionId: 'v-1', parentId: null, orderIndex: 0,
    aiContext: null, title: null, role: null, location: null, website: null,
    startDate: null, endDate: null, description: null, skills: null,
    createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2023-01-01T00:00:00.000Z',
    createdBy: 'test', updatedBy: 'test'
  }

  const personalInfo: PersonalInfo = {
    name: 'Test User',
    email: 'test@example.com',
    applicationInfo: 'Test',
  }

  // Pool tree with 2 work entries, each having 6 highlights
  const poolTree: ResumeItemNode[] = [
    { ...baseItem, id: 'n-1', aiContext: 'narrative', description: 'Summary text' },
    {
      ...baseItem, id: 'sec-exp', aiContext: 'section', title: 'Experience',
      children: [
        {
          ...baseItem, id: 'w-1', aiContext: 'work', title: 'Company A', role: 'Engineer',
          startDate: '2023-01', orderIndex: 0,
          children: [
            { ...baseItem, id: 'h-1a', aiContext: 'highlight', parentId: 'w-1', orderIndex: 0, description: 'Built platform serving 10M users' },
            { ...baseItem, id: 'h-1b', aiContext: 'highlight', parentId: 'w-1', orderIndex: 1, description: 'Led migration to microservices architecture' },
            { ...baseItem, id: 'h-1c', aiContext: 'highlight', parentId: 'w-1', orderIndex: 2, description: 'Reduced latency by 40% via caching layer' },
            { ...baseItem, id: 'h-1d', aiContext: 'highlight', parentId: 'w-1', orderIndex: 3, description: 'Implemented CI/CD pipeline with 99.9% uptime' },
            { ...baseItem, id: 'h-1e', aiContext: 'highlight', parentId: 'w-1', orderIndex: 4, description: 'Mentored team of 5 junior engineers' },
            { ...baseItem, id: 'h-1f', aiContext: 'highlight', parentId: 'w-1', orderIndex: 5, description: 'Designed event-driven system processing 1M events/day' },
          ]
        },
        {
          ...baseItem, id: 'w-2', aiContext: 'work', title: 'Company B', role: 'Junior Dev',
          startDate: '2021-01', orderIndex: 1,
          children: [
            { ...baseItem, id: 'h-2a', aiContext: 'highlight', parentId: 'w-2', orderIndex: 0, description: 'Developed REST APIs for customer portal' },
            { ...baseItem, id: 'h-2b', aiContext: 'highlight', parentId: 'w-2', orderIndex: 1, description: 'Wrote integration tests covering 90% of endpoints' },
            { ...baseItem, id: 'h-2c', aiContext: 'highlight', parentId: 'w-2', orderIndex: 2, description: 'Optimized database queries reducing response time by 30%' },
          ]
        }
      ]
    },
    {
      ...baseItem, id: 'sec-skills', aiContext: 'section', title: 'Skills',
      children: [
        { ...baseItem, id: 's-1', aiContext: 'skills', title: 'Languages', skills: ['TypeScript', 'Python'], orderIndex: 0 },
        { ...baseItem, id: 's-2', aiContext: 'skills', title: 'Frontend', skills: ['React', 'Vue'], orderIndex: 1 },
        { ...baseItem, id: 's-3', aiContext: 'skills', title: 'Cloud', skills: ['AWS', 'GCP'], orderIndex: 2 },
      ]
    },
    { ...baseItem, id: 'e-1', aiContext: 'education', title: 'University', role: 'B.S.', orderIndex: 3 },
  ]

  // Minimal selection: only 2 highlights per work entry
  const sparseSelection = {
    narrative_id: 'n-1',
    resume_title: 'Software Engineer',
    experience_ids: ['w-1', 'w-2'],
    highlight_selections: {
      'w-1': ['h-1a', 'h-1b'],
      'w-2': ['h-2a'],
    },
    skill_ids: ['s-1'],
    project_ids: [],
    education_ids: ['e-1'],
    reasoning: 'Sparse selection',
  }

  it('adds more highlights when there is significant underflow', async () => {
    const { estimateContentFit } = await import('../../generator/workflow/services/content-fit.service')

    // First call: large underflow (-10 lines spare). Subsequent calls: gradually less room.
    let callCount = 0
    vi.mocked(estimateContentFit).mockImplementation(() => {
      callCount++
      const overflow = -10 + (callCount * 2) // -8, -6, -4, -2, 0, +2...
      return {
        mainColumnLines: 67 + overflow,
        sidebarLines: 0,
        fits: overflow <= 0,
        overflow,
        suggestions: [],
      }
    })

    const { selection } = expandToFit(poolTree, sparseSelection, personalInfo, 'Software Engineer')

    // Should have added highlights to w-1 and/or w-2
    const totalOriginalHighlights = 2 + 1 // w-1: 2, w-2: 1
    const totalExpandedHighlights =
      (selection.highlight_selections['w-1']?.length ?? 0) +
      (selection.highlight_selections['w-2']?.length ?? 0)

    expect(totalExpandedHighlights).toBeGreaterThan(totalOriginalHighlights)

    // Restore mock
    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 40, sidebarLines: 0, fits: true, overflow: 0, suggestions: [],
    })
  })

  it('adds highlights to most recent work entry first', async () => {
    const { estimateContentFit } = await import('../../generator/workflow/services/content-fit.service')

    // Enough room for exactly 1 more highlight
    let callCount = 0
    vi.mocked(estimateContentFit).mockImplementation(() => {
      callCount++
      // First call (in the while loop check): underflow beyond threshold. Second call: within threshold.
      const overflow = callCount === 1 ? -8 : -3
      return {
        mainColumnLines: 67 + overflow,
        sidebarLines: 0,
        fits: true,
        overflow,
        suggestions: [],
      }
    })

    const { selection } = expandToFit(poolTree, sparseSelection, personalInfo)

    // w-1 has startDate 2023-01 (most recent), so it gets the extra highlight first
    expect(selection.highlight_selections['w-1']!.length).toBe(3) // was 2, now 3
    expect(selection.highlight_selections['w-1']).toContain('h-1c') // next in pool order
    // w-2 should be unchanged
    expect(selection.highlight_selections['w-2']!.length).toBe(1)

    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 40, sidebarLines: 0, fits: true, overflow: 0, suggestions: [],
    })
  })

  it('does not expand when content already fills the page', async () => {
    const { estimateContentFit } = await import('../../generator/workflow/services/content-fit.service')

    // No underflow — overflow is -1 (just barely fits, less than threshold)
    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 66, sidebarLines: 0, fits: true, overflow: -1, suggestions: [],
    })

    const { selection } = expandToFit(poolTree, sparseSelection, personalInfo)

    // Selection should be unchanged
    expect(selection.highlight_selections['w-1']!.length).toBe(2)
    expect(selection.highlight_selections['w-2']!.length).toBe(1)

    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 40, sidebarLines: 0, fits: true, overflow: 0, suggestions: [],
    })
  })

  it('stops expanding when pool highlights are exhausted', async () => {
    const { estimateContentFit } = await import('../../generator/workflow/services/content-fit.service')

    // Permanent large underflow — room for many more highlights than exist
    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 30, sidebarLines: 0, fits: true, overflow: -37, suggestions: [],
    })

    // Start with all highlights already selected for w-1
    const fullSelection = {
      ...sparseSelection,
      highlight_selections: {
        'w-1': ['h-1a', 'h-1b', 'h-1c', 'h-1d', 'h-1e', 'h-1f'], // all 6
        'w-2': ['h-2a', 'h-2b', 'h-2c'], // all 3
      },
    }

    const { selection } = expandToFit(poolTree, fullSelection, personalInfo)

    // No highlights to add — should add skill categories instead (s-2, s-3)
    expect(selection.skill_ids).toContain('s-2')

    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 40, sidebarLines: 0, fits: true, overflow: 0, suggestions: [],
    })
  })

  it('adds skill categories when all work highlights exhausted and room remains', async () => {
    const { estimateContentFit } = await import('../../generator/workflow/services/content-fit.service')

    // Permanent deep underflow
    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 30, sidebarLines: 0, fits: true, overflow: -37, suggestions: [],
    })

    const fullHighlightsSelection = {
      ...sparseSelection,
      highlight_selections: {
        'w-1': ['h-1a', 'h-1b', 'h-1c', 'h-1d', 'h-1e', 'h-1f'],
        'w-2': ['h-2a', 'h-2b', 'h-2c'],
      },
    }

    const { selection } = expandToFit(poolTree, fullHighlightsSelection, personalInfo)

    // Should have added s-2 and/or s-3
    expect(selection.skill_ids.length).toBeGreaterThan(1) // was ['s-1']

    vi.mocked(estimateContentFit).mockReturnValue({
      mainColumnLines: 40, sidebarLines: 0, fits: true, overflow: 0, suggestions: [],
    })
  })
})

// ─── expandOneStep ───────────────────────────────────────────────

describe('expandOneStep', () => {
  const baseItem: ResumeItemNode = {
    id: '', resumeVersionId: 'v-1', parentId: null, orderIndex: 0,
    aiContext: null, title: null, role: null, location: null, website: null,
    startDate: null, endDate: null, description: null, skills: null,
    createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2023-01-01T00:00:00.000Z',
    createdBy: 'test', updatedBy: 'test'
  }

  const poolTree: ResumeItemNode[] = [
    {
      ...baseItem, id: 'sec-exp', aiContext: 'section', title: 'Experience',
      children: [
        {
          ...baseItem, id: 'w-1', aiContext: 'work', title: 'Company A',
          startDate: '2023-01', orderIndex: 0,
          children: [
            { ...baseItem, id: 'h-1a', aiContext: 'highlight', parentId: 'w-1', orderIndex: 0, description: 'Bullet A1' },
            { ...baseItem, id: 'h-1b', aiContext: 'highlight', parentId: 'w-1', orderIndex: 1, description: 'Bullet A2' },
            { ...baseItem, id: 'h-1c', aiContext: 'highlight', parentId: 'w-1', orderIndex: 2, description: 'Bullet A3' },
          ]
        },
        {
          ...baseItem, id: 'w-2', aiContext: 'work', title: 'Company B',
          startDate: '2021-01', orderIndex: 1,
          children: [
            { ...baseItem, id: 'h-2a', aiContext: 'highlight', parentId: 'w-2', orderIndex: 0, description: 'Bullet B1' },
            { ...baseItem, id: 'h-2b', aiContext: 'highlight', parentId: 'w-2', orderIndex: 1, description: 'Bullet B2' },
          ]
        }
      ]
    },
    {
      ...baseItem, id: 'sec-skills', aiContext: 'section', title: 'Skills',
      children: [
        { ...baseItem, id: 's-1', aiContext: 'skills', title: 'Languages', skills: ['TS'], orderIndex: 0 },
        { ...baseItem, id: 's-2', aiContext: 'skills', title: 'Cloud', skills: ['AWS'], orderIndex: 1 },
      ]
    },
    {
      ...baseItem, id: 'sec-projects', aiContext: 'section', title: 'Projects',
      children: [
        { ...baseItem, id: 'p-1', aiContext: 'project', title: 'Side Project', description: 'A cool project', orderIndex: 0 },
      ]
    },
  ]

  const selection = {
    narrative_id: 'n-1', resume_title: 'Engineer',
    experience_ids: ['w-1', 'w-2'],
    highlight_selections: { 'w-1': ['h-1a'], 'w-2': ['h-2a'] },
    skill_ids: ['s-1'], project_ids: [], education_ids: ['e-1'],
    reasoning: '',
  }

  it('adds a highlight to the most recent work entry first', () => {
    const result = expandOneStep(poolTree, selection)
    expect(result).not.toBeNull()
    // w-1 (2023) is more recent than w-2 (2021), so it gets the highlight
    expect(result!.highlight_selections['w-1']).toContain('h-1b')
    expect(result!.highlight_selections['w-2']).toEqual(['h-2a']) // unchanged
  })

  it('falls back to older work entry when most recent is exhausted', () => {
    const fullW1 = {
      ...selection,
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a'] },
    }
    const result = expandOneStep(poolTree, fullW1)
    expect(result).not.toBeNull()
    expect(result!.highlight_selections['w-2']).toContain('h-2b')
  })

  it('adds a skill category when all work highlights exhausted', () => {
    const allHighlights = {
      ...selection,
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
    }
    const result = expandOneStep(poolTree, allHighlights)
    expect(result).not.toBeNull()
    expect(result!.skill_ids).toContain('s-2')
  })

  it('adds a new work entry with its first highlight when highlights and skills exhausted', () => {
    // Add a 3rd unselected work entry to the pool
    const extendedPool: ResumeItemNode[] = [
      {
        ...baseItem, id: 'sec-exp', aiContext: 'section', title: 'Experience',
        children: [
          ...poolTree[0].children!,
          {
            ...baseItem, id: 'w-3', aiContext: 'work', title: 'Company C',
            startDate: '2019-01', orderIndex: 2,
            children: [
              { ...baseItem, id: 'h-3a', aiContext: 'highlight', parentId: 'w-3', orderIndex: 0, description: 'Bullet C1' },
            ]
          },
        ]
      },
      ...poolTree.slice(1),
    ]

    const allHighlightsAndSkills = {
      ...selection,
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
      skill_ids: ['s-1', 's-2', 's-3', 's-4', 's-5'],
    }
    const result = expandOneStep(extendedPool, allHighlightsAndSkills)
    expect(result).not.toBeNull()
    expect(result!.experience_ids).toContain('w-3')
    expect(result!.highlight_selections['w-3']).toEqual(['h-3a'])
  })

  it('skips work entries without any highlights', () => {
    const poolWithEmptyWork: ResumeItemNode[] = [
      {
        ...baseItem, id: 'sec-exp', aiContext: 'section', title: 'Experience',
        children: [
          ...poolTree[0].children!,
          // Work entry with no highlight children
          { ...baseItem, id: 'w-empty', aiContext: 'work', title: 'Empty Corp', startDate: '2018-01', orderIndex: 3, children: [] },
        ]
      },
      ...poolTree.slice(1),
    ]

    const allHighlightsAndSkills = {
      ...selection,
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
      skill_ids: ['s-1', 's-2', 's-3', 's-4', 's-5'],
    }
    const result = expandOneStep(poolWithEmptyWork, allHighlightsAndSkills)
    expect(result).not.toBeNull()
    // Should skip w-empty (no highlights) and add project instead
    expect(result!.experience_ids).not.toContain('w-empty')
    expect(result!.project_ids).toContain('p-1')
  })

  it('adds a project when work entries and skills are exhausted', () => {
    const allExhaustedExceptProjects = {
      ...selection,
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
      skill_ids: ['s-1', 's-2', 's-3', 's-4', 's-5'],
    }
    const result = expandOneStep(poolTree, allExhaustedExceptProjects)
    expect(result).not.toBeNull()
    expect(result!.project_ids).toContain('p-1')
  })

  it('respects MAX_EXPERIENCE_ENTRIES cap', () => {
    const atMaxExperience = {
      ...selection,
      experience_ids: ['w-1', 'w-2', 'w-x1', 'w-x2', 'w-x3'], // 5 entries = MAX
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
      skill_ids: ['s-1', 's-2', 's-3', 's-4', 's-5'],
    }
    // Should skip work entry expansion and go to projects
    const result = expandOneStep(poolTree, atMaxExperience)
    expect(result).not.toBeNull()
    expect(result!.experience_ids).toHaveLength(5) // unchanged
    expect(result!.project_ids).toContain('p-1')
  })

  it('returns null when pool is fully exhausted', () => {
    const allExhausted = {
      ...selection,
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
      skill_ids: ['s-1', 's-2', 's-3', 's-4', 's-5'],
      project_ids: ['p-1'],
    }
    const result = expandOneStep(poolTree, allExhausted)
    expect(result).toBeNull()
  })
})

// ─── trimOneStep ─────────────────────────────────────────────────

describe('trimOneStep', () => {
  const baseItem: ResumeItemNode = {
    id: '', resumeVersionId: 'v-1', parentId: null, orderIndex: 0,
    aiContext: null, title: null, role: null, location: null, website: null,
    startDate: null, endDate: null, description: null, skills: null,
    createdAt: '2023-01-01T00:00:00.000Z', updatedAt: '2023-01-01T00:00:00.000Z',
    createdBy: 'test', updatedBy: 'test'
  }

  const poolTree: ResumeItemNode[] = [
    {
      ...baseItem, id: 'sec-exp', aiContext: 'section', title: 'Experience',
      children: [
        { ...baseItem, id: 'w-1', aiContext: 'work', title: 'Recent', startDate: '2023-01', orderIndex: 0 },
        { ...baseItem, id: 'w-2', aiContext: 'work', title: 'Old', startDate: '2021-01', orderIndex: 1 },
      ]
    },
  ]

  it('removes a highlight from the oldest work entry first', () => {
    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1', 'w-2'],
      highlight_selections: { 'w-1': ['h-1a', 'h-1b', 'h-1c'], 'w-2': ['h-2a', 'h-2b'] },
      skill_ids: ['s-1'], project_ids: [], education_ids: ['e-1'],
      reasoning: '',
    }

    const result = trimOneStep(poolTree, selection)
    expect(result).not.toBeNull()
    // w-2 is oldest, so it loses a highlight
    expect(result!.highlight_selections['w-2']).toEqual(['h-2a']) // was ['h-2a', 'h-2b']
    // w-1 unchanged
    expect(result!.highlight_selections['w-1']).toEqual(['h-1a', 'h-1b', 'h-1c'])
  })

  it('removes project when all work entries are at 1 highlight', () => {
    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1', 'w-2'],
      highlight_selections: { 'w-1': ['h-1a'], 'w-2': ['h-2a'] },
      skill_ids: ['s-1'], project_ids: ['p-1', 'p-2'], education_ids: [],
      reasoning: '',
    }

    const result = trimOneStep(poolTree, selection)
    expect(result).not.toBeNull()
    expect(result!.project_ids).toEqual(['p-1']) // removed last project
  })

  it('removes skill category after projects exhausted', () => {
    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1', 'w-2'],
      highlight_selections: { 'w-1': ['h-1a'], 'w-2': ['h-2a'] },
      skill_ids: ['s-1', 's-2'], project_ids: [], education_ids: [],
      reasoning: '',
    }

    const result = trimOneStep(poolTree, selection)
    expect(result).not.toBeNull()
    expect(result!.skill_ids).toEqual(['s-1']) // removed last skill
  })

  it('returns null at minimum content', () => {
    const selection = {
      narrative_id: 'n-1', resume_title: 'Engineer',
      experience_ids: ['w-1', 'w-2'],
      highlight_selections: { 'w-1': ['h-1a'], 'w-2': ['h-2a'] },
      skill_ids: ['s-1'], project_ids: [], education_ids: [],
      reasoning: '',
    }

    const result = trimOneStep(poolTree, selection)
    expect(result).toBeNull()
  })
})

// ─── ResumeSelectionService — integration tests ─────────────────

describe('ResumeSelectionService', () => {
  const baseItem: ResumeItemNode = {
    id: '', resumeVersionId: 'pool-v', parentId: null, orderIndex: 0,
    aiContext: null, title: null, role: null, location: null, website: null,
    startDate: null, endDate: null, description: null, skills: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    createdBy: 'test', updatedBy: 'test'
  }

  const poolItems = [
    { ...baseItem, id: 'n-1', aiContext: 'narrative', description: 'Full-stack engineer with 8+ years experience', orderIndex: 0 },
    { ...baseItem, id: 'w-1', aiContext: 'work', title: 'AWS', role: 'Solutions Architect', startDate: '2022-01', orderIndex: 1, parentId: null },
    { ...baseItem, id: 'h-1', aiContext: 'highlight', description: 'Led migration of 50 services', parentId: 'w-1', orderIndex: 0 },
    { ...baseItem, id: 'h-2', aiContext: 'highlight', description: 'Built CI/CD pipeline', parentId: 'w-1', orderIndex: 1 },
    { ...baseItem, id: 's-1', aiContext: 'skills', title: 'Languages', skills: ['TypeScript', 'Python'], orderIndex: 2 },
    { ...baseItem, id: 'e-1', aiContext: 'education', title: 'State University', role: 'B.S. Computer Science', orderIndex: 3 },
  ]

  const validAIResponse = JSON.stringify({
    narrative_id: 'n-1',
    resume_title: 'Software Engineer',
    experience_ids: ['w-1'],
    highlight_selections: { 'w-1': ['h-1', 'h-2'] },
    skill_ids: ['s-1'],
    project_ids: [],
    education_ids: ['e-1'],
    reasoning: 'Selected AWS experience for cloud role'
  })

  const mockMatch = {
    id: 'match-1',
    listing: {
      id: 'listing-1',
      title: 'Senior Software Engineer',
      companyName: 'TechCo',
      description: 'We are looking for a senior engineer...',
      location: 'Remote',
      url: 'https://example.com/job'
    },
    matchedSkills: ['TypeScript', 'Python'],
    missingSkills: ['Go'],
    customizationRecommendations: [
      'resume_focus: Highlight cloud infrastructure experience',
      'keywords: microservices, CI/CD'
    ]
  }

  function createMockRepo(hasPool = true) {
    return {
      getPoolVersion: vi.fn().mockReturnValue(hasPool ? { id: 'pool-v', slug: 'pool' } : null),
      listItems: vi.fn().mockReturnValue(poolItems),
      getCachedTailoredResume: vi.fn().mockReturnValue(null),
      saveTailoredResume: vi.fn().mockImplementation((data: any) => ({
        id: 'tailored-1',
        jobMatchId: data.jobMatchId,
        pdfPath: data.pdfPath,
        reasoning: data.reasoning,
        selectedItems: data.selectedItems,
        createdAt: new Date().toISOString()
      }))
    }
  }

  function createMockJobMatchRepo(match: any = mockMatch) {
    return {
      getByIdWithListing: vi.fn().mockReturnValue(match)
    }
  }

  function createMockInferenceClient(response = validAIResponse) {
    return {
      execute: vi.fn().mockResolvedValue({
        output: response,
        model: 'claude-document',
        agentId: 'test'
      })
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('selectContent', () => {
    it('throws PoolNotFoundError when pool does not exist', async () => {
      const service = new ResumeSelectionService(
        createMockRepo(false) as any,
        createMockJobMatchRepo() as any,
        createMockInferenceClient() as any
      )

      await expect(service.selectContent('test-user', 'match-1')).rejects.toThrow(PoolNotFoundError)
    })

    it('throws JobMatchNotFoundError when job match does not exist', async () => {
      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo(null) as any,
        createMockInferenceClient() as any
      )

      await expect(service.selectContent('test-user', 'nonexistent')).rejects.toThrow(JobMatchNotFoundError)
    })

    it('throws PoolNotFoundError when pool has no items', async () => {
      const repo = createMockRepo()
      repo.listItems.mockReturnValue([])

      const service = new ResumeSelectionService(
        repo as any,
        createMockJobMatchRepo() as any,
        createMockInferenceClient() as any
      )

      await expect(service.selectContent('test-user', 'match-1')).rejects.toThrow(PoolNotFoundError)
    })

    it('calls inference client with document task type', async () => {
      const client = createMockInferenceClient()
      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        client as any
      )

      await service.selectContent('test-user', 'match-1')

      expect(client.execute).toHaveBeenCalledWith(
        'document',
        expect.any(String),
        undefined,
        expect.objectContaining({ temperature: 0.3 })
      )
    })

    it('includes job context in the prompt', async () => {
      const client = createMockInferenceClient()
      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        client as any
      )

      await service.selectContent('test-user', 'match-1')

      const prompt = client.execute.mock.calls[0][1]
      expect(prompt).toContain('Senior Software Engineer')
      expect(prompt).toContain('TechCo')
      expect(prompt).toContain('TypeScript')
    })

    it('returns ResumeContent on success', async () => {
      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        createMockInferenceClient() as any
      )

      const result = await service.selectContent('test-user', 'match-1')

      expect(result.personalInfo).toBeDefined()
      expect(result.experience).toBeDefined()
      expect(result.skills).toBeDefined()
    })

    it('throws AISelectionError when AI returns invalid response', async () => {
      const client = createMockInferenceClient('this is not valid json at all')
      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        client as any
      )

      await expect(service.selectContent('test-user', 'match-1')).rejects.toThrow(AISelectionError)
    })

    it('skips AI call on selection cache hit', async () => {
      const client = createMockInferenceClient()
      const mockCache = {
        lookup: vi.fn().mockResolvedValue({
          tier: 'tech-fingerprint',
          selection: JSON.parse(validAIResponse),
        }),
        store: vi.fn().mockResolvedValue(undefined),
      }

      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        client as any,
        mockCache as any
      )

      await service.selectContent('test-user', 'match-1')

      expect(client.execute).not.toHaveBeenCalled()
      expect(mockCache.lookup).toHaveBeenCalled()
    })

    it('falls back to AI when cached selection produces empty tree', async () => {
      const client = createMockInferenceClient()
      const staleSelection = {
        narrative_id: 'nonexistent-id',
        resume_title: 'Stale',
        experience_ids: ['nonexistent-exp'],
        highlight_selections: {},
        skill_ids: [],
        project_ids: [],
        education_ids: [],
        reasoning: 'stale',
      }
      const mockCache = {
        lookup: vi.fn().mockResolvedValue({
          tier: 'tech-fingerprint',
          selection: staleSelection,
        }),
        store: vi.fn().mockResolvedValue(undefined),
      }

      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        client as any,
        mockCache as any
      )

      await service.selectContent('test-user', 'match-1')

      // Should have called AI as fallback since cached IDs don't match pool
      expect(client.execute).toHaveBeenCalled()
    })

    it('calls AI and stores result on cache miss', async () => {
      const client = createMockInferenceClient()
      const mockCache = {
        lookup: vi.fn().mockResolvedValue({ tier: 'miss' }),
        store: vi.fn().mockResolvedValue(undefined),
      }

      const service = new ResumeSelectionService(
        createMockRepo() as any,
        createMockJobMatchRepo() as any,
        client as any,
        mockCache as any
      )

      await service.selectContent('test-user', 'match-1')

      expect(client.execute).toHaveBeenCalled()
      expect(mockCache.store).toHaveBeenCalled()
    })
  })
})
