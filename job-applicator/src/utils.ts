import * as path from "path"

// Configuration from environment (can be overridden in tests)
export const getConfig = () => ({
  CDP_PORT: process.env.CDP_PORT || "9222",
  API_URL: process.env.JOB_FINDER_API_URL || "http://localhost:3000/api",
  ARTIFACTS_DIR: process.env.GENERATOR_ARTIFACTS_DIR || "/data/artifacts",
})

// Normalize URL for comparison (origin + pathname only)
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

// Resolve document file path from API URL
export function resolveDocumentPath(documentUrl: string, artifactsDir?: string): string {
  const config = getConfig()
  const baseDir = artifactsDir ?? config.ARTIFACTS_DIR

  // documentUrl is like "/api/generator/artifacts/2025-12-04/filename.pdf"
  // Extract the relative path after /api/generator/artifacts/
  const prefix = "/api/generator/artifacts/"
  if (documentUrl.startsWith(prefix)) {
    const relativePath = documentUrl.substring(prefix.length)
    return path.join(baseDir, relativePath)
  }
  // If it's already an absolute path, return as-is
  if (path.isAbsolute(documentUrl)) {
    return documentUrl
  }
  // Otherwise treat as relative to artifacts dir
  return path.join(baseDir, documentUrl)
}

// EEO display values for form filling
export const EEO_DISPLAY: Record<string, Record<string, string>> = {
  race: {
    american_indian_alaska_native: "American Indian or Alaska Native",
    asian: "Asian",
    black_african_american: "Black or African American",
    native_hawaiian_pacific_islander: "Native Hawaiian or Other Pacific Islander",
    white: "White",
    two_or_more_races: "Two or More Races",
    decline_to_identify: "Decline to Self-Identify",
  },
  hispanicLatino: {
    yes: "Yes",
    no: "No",
    decline_to_identify: "Decline to Self-Identify",
  },
  gender: {
    male: "Male",
    female: "Female",
    decline_to_identify: "Decline to Self-Identify",
  },
  veteranStatus: {
    not_protected_veteran: "I am not a protected veteran",
    protected_veteran: "I identify as one or more of the classifications of a protected veteran",
    disabled_veteran: "I am a disabled veteran",
    decline_to_identify: "Decline to Self-Identify",
  },
  disabilityStatus: {
    yes: "Yes, I Have A Disability, Or Have A History/Record Of Having A Disability",
    no: "No, I Don't Have A Disability",
    decline_to_identify: "Decline to Self-Identify",
  },
}

// Format EEO value for display
export function formatEEOValue(field: string, value: string | undefined): string {
  if (!value) return "Not provided - skip this field"
  return EEO_DISPLAY[field]?.[value] || value
}

// Types
export interface ContentItem {
  id: string
  title?: string
  role?: string
  location?: string
  startDate?: string
  endDate?: string
  description?: string
  skills?: string[]
  children?: ContentItem[]
}

export interface PersonalInfo {
  name: string
  email: string
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
  summary?: string
  eeo?: EEOInfo
}

export interface EEOInfo {
  race?: string
  hispanicLatino?: string
  gender?: string
  veteranStatus?: string
  disabilityStatus?: string
}

export interface FormField {
  selector: string | null
  type: string
  label: string | null
  placeholder: string | null
  required: boolean
  options: SelectOption[] | null
}

export interface SelectOption {
  value: string
  text: string
}

export interface FillInstruction {
  selector: string
  value: string
}

export interface EnhancedFillInstruction {
  selector: string
  value: string | null
  status: "filled" | "skipped"
  reason?: string
  label?: string
}

export interface FormFillSummary {
  totalFields: number
  filledCount: number
  skippedCount: number
  skippedFields: Array<{ label: string; reason: string }>
  duration: number
}

export interface JobExtraction {
  title: string | null
  description: string | null
  location: string | null
  techStack: string | null
  companyName: string | null
}

// Format work history for prompt
export function formatWorkHistory(items: ContentItem[], indent = 0): string {
  const lines: string[] = []
  for (const item of items) {
    const prefix = "  ".repeat(indent)
    if (item.title) {
      lines.push(`${prefix}- ${item.title}${item.role ? ` (${item.role})` : ""}`)
      if (item.startDate || item.endDate) {
        lines.push(`${prefix}  Period: ${item.startDate || "?"} - ${item.endDate || "present"}`)
      }
      if (item.location) lines.push(`${prefix}  Location: ${item.location}`)
      if (item.description) lines.push(`${prefix}  ${item.description}`)
      if (item.skills?.length) lines.push(`${prefix}  Skills: ${item.skills.join(", ")}`)
      if (item.children?.length) {
        lines.push(formatWorkHistory(item.children, indent + 1))
      }
    }
  }
  return lines.join("\n")
}

// Build basic form fill prompt
export function buildPrompt(fields: FormField[], profile: PersonalInfo, workHistory: ContentItem[]): string {
  const profileStr = `
Name: ${profile.name}
Email: ${profile.email}
Phone: ${profile.phone || "Not provided"}
Location: ${profile.location || "Not provided"}
Website: ${profile.website || "Not provided"}
GitHub: ${profile.github || "Not provided"}
LinkedIn: ${profile.linkedin || "Not provided"}
`.trim()

  const workHistoryStr = workHistory.length > 0 ? formatWorkHistory(workHistory) : "Not provided"
  const fieldsJson = JSON.stringify(fields, null, 2)

  return `Fill this job application form. Return ONLY a JSON array of fill instructions.

## User Profile
${profileStr}

## Work History / Experience
${workHistoryStr}

## Form Fields
${fieldsJson}

## Instructions
Return a JSON array where each item has:
- "selector": the CSS selector from the form fields above
- "value": the value to fill

Rules:
1. Only fill fields you're confident about
2. Skip file upload fields (type="file")
3. Skip cover letter or free-text fields asking "why do you want this job"
4. For select dropdowns, use the "value" property from the options array (not the "text")
5. Return ONLY valid JSON array, no markdown, no explanation

Example output:
[{"selector": "#email", "value": "john@example.com"}, {"selector": "#phone", "value": "555-1234"}]`
}

// Build enhanced form fill prompt with EEO and job context
export function buildEnhancedPrompt(
  fields: FormField[],
  profile: PersonalInfo,
  workHistory: ContentItem[],
  jobMatch: Record<string, unknown> | null
): string {
  const eeoSection = profile.eeo
    ? `
## EEO Information (US Equal Employment Opportunity)
Race: ${formatEEOValue("race", profile.eeo.race)}
Hispanic/Latino: ${formatEEOValue("hispanicLatino", profile.eeo.hispanicLatino)}
Gender: ${formatEEOValue("gender", profile.eeo.gender)}
Veteran Status: ${formatEEOValue("veteranStatus", profile.eeo.veteranStatus)}
Disability Status: ${formatEEOValue("disabilityStatus", profile.eeo.disabilityStatus)}
`
    : "\n## EEO Information\nNot provided - skip EEO fields\n"

  const jobContextSection = jobMatch
    ? `
## Job-Specific Context
Company: ${(jobMatch.listing as Record<string, unknown>)?.companyName || "Unknown"}
Role: ${(jobMatch.listing as Record<string, unknown>)?.title || "Unknown"}
Matched Skills: ${(jobMatch.matchedSkills as string[])?.join(", ") || "N/A"}
ATS Keywords: ${(jobMatch.resumeIntakeData as Record<string, unknown>)?.atsKeywords?.toString() || "N/A"}
`
    : ""

  return `Fill this job application form. Return a JSON array with status for each field.

## CRITICAL SAFETY RULES
1. NEVER fill or interact with submit/apply buttons
2. Skip any field that would submit the form
3. The user must manually click the final submit button

## User Profile
Name: ${profile.name}
Email: ${profile.email}
Phone: ${profile.phone || "Not provided"}
Location: ${profile.location || "Not provided"}
Website: ${profile.website || "Not provided"}
GitHub: ${profile.github || "Not provided"}
LinkedIn: ${profile.linkedin || "Not provided"}
Summary: ${profile.summary || "Not provided"}
${eeoSection}
## Work History / Experience
${workHistory.length > 0 ? formatWorkHistory(workHistory) : "Not provided"}
${jobContextSection}
## Form Fields
${JSON.stringify(fields, null, 2)}

## Response Format
Return a JSON array. For EACH form field, include a status and label:
[
  {"selector": "#email", "label": "Email Address", "value": "user@example.com", "status": "filled"},
  {"selector": "#coverLetter", "label": "Cover Letter", "value": null, "status": "skipped", "reason": "Requires custom text"}
]

Rules:
1. For select dropdowns, use the "value" property from options (not "text")
2. Skip file upload fields (type="file") - status: "skipped", reason: "File upload"
3. Skip submit buttons - status: "skipped", reason: "Submit button"
4. For EEO fields, use the display values provided above or skip if not provided
5. If no data available for a required field, mark status: "skipped" with reason
6. Return ONLY valid JSON array, no markdown, no explanation`
}

// Build job extraction prompt
export function buildExtractionPrompt(pageContent: string, url: string): string {
  return `Extract job listing details from this page content.

URL: ${url}

Page Content:
${pageContent}

Return a JSON object with these fields (use null if not found):
{
  "title": "Job title",
  "description": "Full job description (include requirements, responsibilities)",
  "location": "Job location (e.g., Remote, Portland, OR)",
  "techStack": "Technologies mentioned (comma-separated)",
  "companyName": "Company name"
}

Return ONLY valid JSON, no markdown, no explanation.`
}

// Validate fill instruction format
export function validateFillInstruction(item: unknown): item is FillInstruction {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FillInstruction).selector === "string" &&
    typeof (item as FillInstruction).value === "string"
  )
}

// Validate enhanced fill instruction format
export function validateEnhancedFillInstruction(item: unknown): item is EnhancedFillInstruction {
  if (typeof item !== "object" || item === null) return false
  const inst = item as EnhancedFillInstruction
  if (typeof inst.selector !== "string") return false
  if (inst.status !== "filled" && inst.status !== "skipped") return false
  if (inst.status === "filled" && inst.value !== null && typeof inst.value !== "string") return false
  return true
}

// Parse JSON array from CLI output (handles extra text around JSON)
export function parseJsonArrayFromOutput(output: string): unknown[] {
  const startIdx = output.indexOf("[")
  const endIdx = output.lastIndexOf("]")
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`No JSON array found in output: ${output.slice(0, 200)}`)
  }
  const jsonStr = output.substring(startIdx, endIdx + 1)
  const parsed = JSON.parse(jsonStr)
  if (!Array.isArray(parsed)) {
    throw new Error("Parsed JSON is not an array")
  }
  return parsed
}

// Parse JSON object from CLI output (handles extra text around JSON)
export function parseJsonObjectFromOutput(output: string): Record<string, unknown> {
  const startIdx = output.indexOf("{")
  const endIdx = output.lastIndexOf("}")
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`No JSON object found in output: ${output.slice(0, 200)}`)
  }
  const jsonStr = output.substring(startIdx, endIdx + 1)
  const parsed = JSON.parse(jsonStr)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Parsed JSON is not an object")
  }
  return parsed
}
