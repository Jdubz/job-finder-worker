import { describe, it, expect } from 'vitest'
import type { ResumeItemNode, PersonalInfo } from '@shared/types'
import { transformItemsToResumeContent, buildItemTree } from '../resume-version.publish'

const personalInfo: PersonalInfo = {
  name: 'Josh Wentworth',
  email: 'josh@example.com',
  title: 'Senior Software Engineer',
  location: 'Portland, OR',
  website: 'https://joshwentworth.com',
  linkedin: 'https://linkedin.com/in/joshw',
  github: 'https://github.com/jdubz',
  applicationInfo: ''
}

const now = new Date()

function makeItem(overrides: Partial<ResumeItemNode> & { id: string }): ResumeItemNode {
  return {
    resumeVersionId: 'rv-test',
    parentId: null,
    orderIndex: 0,
    aiContext: null,
    title: null,
    role: null,
    location: null,
    website: null,
    startDate: null,
    endDate: null,
    description: null,
    skills: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'test@test.com',
    updatedBy: 'test@test.com',
    children: [],
    ...overrides
  }
}

describe('transformItemsToResumeContent', () => {
  it('maps narrative items to professionalSummary', () => {
    const items: ResumeItemNode[] = [
      makeItem({ id: '1', aiContext: 'narrative', description: 'Experienced engineer with 8+ years...' })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.professionalSummary).toBe('Experienced engineer with 8+ years...')
    expect(result.personalInfo.summary).toBe('Experienced engineer with 8+ years...')
  })

  it('maps work items with highlight children to experience', () => {
    const items: ResumeItemNode[] = [
      makeItem({
        id: '1',
        aiContext: 'work',
        title: 'Amazon Web Services',
        role: 'Solutions Architect',
        location: 'Portland, OR',
        startDate: '2022-01',
        endDate: '2025-03',
        skills: ['TypeScript', 'AWS'],
        children: [
          makeItem({ id: '1a', parentId: '1', aiContext: 'highlight', description: 'Led migration of 50 services', orderIndex: 0 }),
          makeItem({ id: '1b', parentId: '1', aiContext: 'highlight', description: 'Built CI/CD pipeline', orderIndex: 1 })
        ]
      })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.experience).toHaveLength(1)
    expect(result.experience[0].company).toBe('Amazon Web Services')
    expect(result.experience[0].role).toBe('Solutions Architect')
    expect(result.experience[0].startDate).toBe('2022-01')
    expect(result.experience[0].highlights).toEqual([
      'Led migration of 50 services',
      'Built CI/CD pipeline'
    ])
    expect(result.experience[0].technologies).toEqual(['TypeScript', 'AWS'])
  })

  it('maps project items to projects', () => {
    const items: ResumeItemNode[] = [
      makeItem({
        id: '1',
        aiContext: 'project',
        title: 'Job Finder',
        description: 'AI-powered job search platform',
        website: 'https://github.com/jdubz/job-finder',
        skills: ['React', 'Node.js'],
        children: [
          makeItem({ id: '1a', parentId: '1', aiContext: 'highlight', description: 'Built MCP integration', orderIndex: 0 })
        ]
      })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.projects).toHaveLength(1)
    expect(result.projects![0].name).toBe('Job Finder')
    expect(result.projects![0].link).toBe('https://github.com/jdubz/job-finder')
    expect(result.projects![0].highlights).toEqual(['Built MCP integration'])
  })

  it('maps skills items to skills categories', () => {
    const items: ResumeItemNode[] = [
      makeItem({ id: '1', aiContext: 'skills', title: 'Languages', skills: ['TypeScript', 'Python', 'Go'] }),
      makeItem({ id: '2', aiContext: 'skills', title: 'Frameworks', skills: ['React', 'Express', 'FastAPI'], orderIndex: 1 })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.skills).toHaveLength(2)
    expect(result.skills![0]).toEqual({ category: 'Languages', items: ['TypeScript', 'Python', 'Go'] })
    expect(result.skills![1]).toEqual({ category: 'Frameworks', items: ['React', 'Express', 'FastAPI'] })
  })

  it('maps education items', () => {
    const items: ResumeItemNode[] = [
      makeItem({
        id: '1',
        aiContext: 'education',
        title: 'University of Oregon',
        role: 'BS Computer Science',
        description: 'Computer Science',
        startDate: '2010-09',
        endDate: '2014-06'
      })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.education).toHaveLength(1)
    expect(result.education![0].institution).toBe('University of Oregon')
    expect(result.education![0].degree).toBe('BS Computer Science')
    expect(result.education![0].field).toBe('Computer Science')
  })

  it('processes section containers by recursing into children', () => {
    const items: ResumeItemNode[] = [
      makeItem({
        id: 'exp-section',
        aiContext: 'section',
        title: 'Experience',
        children: [
          makeItem({
            id: 'work1',
            parentId: 'exp-section',
            aiContext: 'work',
            title: 'Acme Corp',
            role: 'Engineer',
            startDate: '2020-01',
            children: [
              makeItem({ id: 'h1', parentId: 'work1', aiContext: 'highlight', description: 'Built APIs', orderIndex: 0 })
            ]
          })
        ]
      })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.experience).toHaveLength(1)
    expect(result.experience[0].company).toBe('Acme Corp')
    expect(result.experience[0].highlights).toEqual(['Built APIs'])
  })

  it('sets personalInfo contact fields from PersonalInfo', () => {
    const items: ResumeItemNode[] = []
    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.personalInfo.name).toBe('Josh Wentworth')
    expect(result.personalInfo.title).toBe('Senior Software Engineer')
    expect(result.personalInfo.contact.email).toBe('josh@example.com')
    expect(result.personalInfo.contact.github).toBe('https://github.com/jdubz')
  })

  it('handles a full resume structure in order', () => {
    const items: ResumeItemNode[] = [
      makeItem({ id: 'summary', aiContext: 'narrative', description: 'Full-stack engineer.', orderIndex: 0 }),
      makeItem({
        id: 'exp',
        aiContext: 'section',
        title: 'Experience',
        orderIndex: 1,
        children: [
          makeItem({ id: 'w1', parentId: 'exp', aiContext: 'work', title: 'Co A', role: 'Lead', startDate: '2023-01', orderIndex: 0, children: [] }),
          makeItem({ id: 'w2', parentId: 'exp', aiContext: 'work', title: 'Co B', role: 'Senior', startDate: '2020-01', orderIndex: 1, children: [] })
        ]
      }),
      makeItem({ id: 'sk', aiContext: 'skills', title: 'Core', skills: ['TS', 'React'], orderIndex: 2 }),
      makeItem({ id: 'ed', aiContext: 'education', title: 'MIT', role: 'BS CS', orderIndex: 3 })
    ]

    const result = transformItemsToResumeContent(items, personalInfo)
    expect(result.professionalSummary).toBe('Full-stack engineer.')
    expect(result.experience).toHaveLength(2)
    expect(result.experience[0].company).toBe('Co A')
    expect(result.experience[1].company).toBe('Co B')
    expect(result.skills).toHaveLength(1)
    expect(result.education).toHaveLength(1)
  })
})

describe('buildItemTree', () => {
  it('builds nested tree from flat array', () => {
    const flat = [
      { ...makeItem({ id: 'root', orderIndex: 0 }), children: undefined } as any,
      { ...makeItem({ id: 'child', parentId: 'root', orderIndex: 0 }), children: undefined } as any,
      { ...makeItem({ id: 'grandchild', parentId: 'child', orderIndex: 0 }), children: undefined } as any
    ]

    const tree = buildItemTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('root')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children![0].id).toBe('child')
    expect(tree[0].children![0].children).toHaveLength(1)
    expect(tree[0].children![0].children![0].id).toBe('grandchild')
  })

  it('handles multiple roots', () => {
    const flat = [
      { ...makeItem({ id: 'a', orderIndex: 0 }), children: undefined } as any,
      { ...makeItem({ id: 'b', orderIndex: 1 }), children: undefined } as any
    ]

    const tree = buildItemTree(flat)
    expect(tree).toHaveLength(2)
  })

  it('handles empty array', () => {
    expect(buildItemTree([])).toEqual([])
  })
})
