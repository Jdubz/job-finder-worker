import type { TimestampLike } from './firestore.types'

export type ContentItemVisibility = 'published' | 'draft' | 'archived'

export interface ContentItem {
  id: string
  userId: string
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
  visibility: ContentItemVisibility
  createdAt: TimestampLike
  updatedAt: TimestampLike
  createdBy: string
  updatedBy: string
}

export type ContentItemNode = ContentItem & {
  children?: ContentItemNode[]
}

export type CreateContentItemData = {
  userId: string
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
  visibility?: ContentItemVisibility
}

export type UpdateContentItemData = Partial<Omit<CreateContentItemData, 'userId'>> & {
  visibility?: ContentItemVisibility
}

export interface ListContentItemsOptions {
  userId?: string
  parentId?: string | null
  visibility?: ContentItemVisibility
  includeDrafts?: boolean
  limit?: number
  offset?: number
}
