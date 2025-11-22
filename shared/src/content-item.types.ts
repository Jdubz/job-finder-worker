import type { TimestampLike } from './firestore.types'

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
}

export type UpdateContentItemData = Partial<CreateContentItemData> & {
}

export interface ListContentItemsOptions {
  parentId?: string | null
  limit?: number
  offset?: number
}
