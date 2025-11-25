import type { TimestampLike } from './time.types'

/**
 * Context hint for how a content item should be used in document generation.
 * - work: Employment entry (company + role). Children are highlights.
 * - highlight: Project/achievement within work context
 * - project: Personal/independent project
 * - education: Degree, certification, course
 * - skills: Skill category or competency list
 * - narrative: Bio, summary, overview, closing notes
 * - section: Container that groups children (item itself excluded from generation)
 */
export type ContentItemAIContext = 'work' | 'highlight' | 'project' | 'education' | 'skills' | 'narrative' | 'section'

export interface ContentItem {
  id: string
  parentId: string | null
  order: number
  title?: string | null
  role?: string | null
  location?: string | null
  website?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  skills?: string[] | null
  /** Context for document generation: experience, education, project, skill, overview */
  aiContext?: ContentItemAIContext | null
  createdAt: TimestampLike
  updatedAt: TimestampLike
  createdBy: string
  updatedBy: string
}

export type ContentItemNode = ContentItem & {
  children?: ContentItemNode[]
}

export type CreateContentItemData = {
  parentId?: string | null
  order?: number
  title?: string | null
  role?: string | null
  location?: string | null
  website?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  skills?: string[] | null
  aiContext?: ContentItemAIContext | null
}

export type UpdateContentItemData = Partial<CreateContentItemData> & {
}

export interface ListContentItemsOptions {
  parentId?: string | null
  limit?: number
  offset?: number
}
