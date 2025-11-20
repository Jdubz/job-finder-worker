import type {
  ContentItem,
  ContentItemNode,
  ContentItemVisibility,
  CreateContentItemData,
  UpdateContentItemData
} from "@shared/types"

export type {
  ContentItem,
  ContentItemNode,
  ContentItemVisibility,
  CreateContentItemData,
  UpdateContentItemData
}

export type ContentItemFormValues = Omit<CreateContentItemData, "userId">
