// @ts-nocheck
/**
 * Generic Content Item Edit Component
 *
 * Consolidates all content-type edit components into a single, configurable component.
 * Reduces code duplication and improves maintainability.
 */

import React from "react"
import type { UpdateContentItemData, ContentItemType } from "../../../../types/content-items"
import { FormField } from "../FormField"

interface GenericContentEditProps {
  data: UpdateContentItemData
  onChange: (data: UpdateContentItemData) => void
  type: ContentItemType
}

/**
 * Field configuration for each content type
 */
const FIELD_CONFIGS = {
  company: [
    { name: "company", label: "Company Name", required: true },
    { name: "role", label: "Role", placeholder: "Senior Developer, Lead Engineer, etc." },
    { name: "location", label: "Location", placeholder: "Portland, OR · Remote" },
    { name: "website", label: "Website", type: "url", placeholder: "https://example.com" },
    { name: "startDate", label: "Start Date", type: "month", required: true },
    {
      name: "endDate",
      label: "End Date (leave empty for Present)",
      type: "month",
      placeholder: "Leave empty for Present",
    },
    {
      name: "summary",
      label: "Summary",
      type: "textarea",
      rows: 4,
      placeholder: "Brief overview of your role and responsibilities...",
    },
    {
      name: "accomplishments",
      label: "Accomplishments (one per line)",
      type: "textarea",
      rows: 6,
      placeholder:
        "Led team of 5 developers\nIncreased performance by 40%\nImplemented CI/CD pipeline",
    },
    {
      name: "technologies",
      label: "Technologies (comma-separated)",
      placeholder: "React, TypeScript, Node.js, PostgreSQL",
    },
    { name: "notes", label: "Notes (internal)", type: "textarea", rows: 2 },
  ],
  project: [
    { name: "name", label: "Project Name", required: true },
    { name: "role", label: "Role", placeholder: "Lead Developer, Contributor, etc." },
    { name: "startDate", label: "Start Date", type: "month" },
    { name: "endDate", label: "End Date", type: "month" },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      rows: 4,
      required: true,
      placeholder: "Brief description of the project...",
    },
    {
      name: "context",
      label: "Context",
      type: "textarea",
      rows: 2,
      placeholder: "Additional context or background...",
    },
    { name: "accomplishments", label: "Accomplishments (one per line)", type: "textarea", rows: 4 },
    { name: "challenges", label: "Challenges (one per line)", type: "textarea", rows: 4 },
    {
      name: "technologies",
      label: "Technologies (comma-separated)",
      placeholder: "React, Node.js, MongoDB",
    },
  ],
  education: [
    { name: "institution", label: "Institution", required: true },
    { name: "degree", label: "Degree", placeholder: "Bachelor of Science" },
    { name: "field", label: "Field of Study", placeholder: "Computer Science" },
    { name: "location", label: "Location", placeholder: "Portland, OR" },
    { name: "startDate", label: "Start Date", type: "month" },
    { name: "endDate", label: "End Date", type: "month" },
    { name: "honors", label: "Honors", placeholder: "Magna Cum Laude, Dean's List" },
    { name: "description", label: "Description", type: "textarea", rows: 3 },
  ],
  accomplishment: [
    { name: "description", label: "Description", type: "textarea", rows: 3, required: true },
    { name: "date", label: "Date", placeholder: "2024" },
    { name: "context", label: "Context", type: "textarea", rows: 2 },
    { name: "impact", label: "Impact" },
    { name: "technologies", label: "Technologies (comma-separated)" },
  ],
  skillGroup: [
    {
      name: "category",
      label: "Category",
      required: true,
      placeholder: "e.g., Programming Languages, Frameworks, Tools",
    },
    {
      name: "skills",
      label: "Skills (comma-separated)",
      type: "textarea",
      rows: 3,
      required: true,
      placeholder: "React, TypeScript, Node.js",
    },
  ],
  textSection: [
    { name: "title", label: "Title", required: true },
    { name: "content", label: "Content", type: "textarea", rows: 6, required: true },
  ],
  profileSection: [
    { name: "title", label: "Title", required: true },
    { name: "content", label: "Content", type: "textarea", rows: 6, required: true },
  ],
  timelineEvent: [
    { name: "title", label: "Title", required: true },
    { name: "date", label: "Date", placeholder: "2024" },
    { name: "description", label: "Description", type: "textarea", rows: 3, required: true },
  ],
} as const

export const GenericContentEdit: React.FC<GenericContentEditProps> = ({ data, onChange, type }) => {
  // Map kebab-case types to camelCase config keys
  const typeKey =
    type === "skill-group"
      ? "skillGroup"
      : type === "text-section"
        ? "textSection"
        : type === "profile-section"
          ? "profileSection"
          : type === "timeline-event"
            ? "timelineEvent"
            : type

  const fields = FIELD_CONFIGS[typeKey as keyof typeof FIELD_CONFIGS] || []

  const handleFieldChange = (fieldName: string, value: string) => {
    const newData = { ...data, [fieldName]: value }
    onChange(newData)
  }

  const handleArrayFieldChange = (fieldName: string, value: string) => {
    const arrayValue = value ? value.split("\n").filter((line) => line.trim()) : []
    const newData = { ...data, [fieldName]: arrayValue }
    onChange(newData)
  }

  const handleCommaSeparatedFieldChange = (fieldName: string, value: string) => {
    const arrayValue = value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
    const newData = { ...data, [fieldName]: arrayValue }
    onChange(newData)
  }

  const renderField = (field: {
    name: string
    type: string
    label: string
    required?: boolean
  }) => {
    const fieldValue = data[field.name as keyof UpdateContentItemData]

    // Handle special field types
    if (field.name === "accomplishments" || field.name === "challenges") {
      return (
        <FormField
          key={field.name}
          label={field.label}
          name={field.name}
          type={field.type}
          value={Array.isArray(fieldValue) ? fieldValue.join("\n") : ""}
          onChange={(value) => handleArrayFieldChange(field.name, value)}
          rows={field.rows}
          placeholder={field.placeholder}
          required={field.required}
        />
      )
    }

    if (field.name === "technologies" || field.name === "skills") {
      return (
        <FormField
          key={field.name}
          label={field.label}
          name={field.name}
          type={field.type}
          value={Array.isArray(fieldValue) ? fieldValue.join(", ") : ""}
          onChange={(value) => handleCommaSeparatedFieldChange(field.name, value)}
          rows={field.rows}
          placeholder={field.placeholder}
          required={field.required}
        />
      )
    }

    // Handle date fields with special logic
    if (field.name === "endDate" && fieldValue === null) {
      return (
        <FormField
          key={field.name}
          label={field.label}
          name={field.name}
          type={field.type}
          value=""
          onChange={(value) => onChange({ ...data, [field.name]: value || null })}
          placeholder={field.placeholder}
        />
      )
    }

    // Regular field
    return (
      <FormField
        key={field.name}
        label={field.label}
        name={field.name}
        type={field.type}
        value={(fieldValue as string) || ""}
        onChange={(value) => handleFieldChange(field.name, value)}
        rows={field.rows}
        placeholder={field.placeholder}
        required={field.required}
      />
    )
  }

  return <div className="flex flex-col gap-4 mb-3">{fields.map(renderField)}</div>
}
