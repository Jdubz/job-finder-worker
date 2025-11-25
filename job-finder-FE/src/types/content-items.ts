import type { ContentItem, ContentItemNode, CreateContentItemData, UpdateContentItemData, ContentItemAIContext } from "@shared/types"

export type {
  ContentItem,
  ContentItemNode,
  CreateContentItemData,
  UpdateContentItemData,
  ContentItemAIContext
}

export type ContentItemFormValues = CreateContentItemData

/** AI Context options with human-readable labels for document generation */
export const AI_CONTEXT_OPTIONS: { value: ContentItemAIContext; label: string; description: string }[] = [
  { value: "work", label: "Work", description: "Employment entry (company + role)" },
  { value: "highlight", label: "Highlight", description: "Project/achievement within work" },
  { value: "project", label: "Project", description: "Personal/independent project" },
  { value: "education", label: "Education", description: "Degree, certification, course" },
  { value: "skills", label: "Skills", description: "Skill category or competency list" },
  { value: "narrative", label: "Narrative", description: "Bio, summary, overview notes" },
  { value: "section", label: "Section", description: "Container that groups children" }
]
