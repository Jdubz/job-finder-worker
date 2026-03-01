/**
 * Form Fill Prompt Assembly
 *
 * ARCHITECTURE: Form fill prompts have two distinct parts:
 *
 * 1. WORKFLOW (hardcoded in prompts/form-fill-workflow.ts):
 *    - Contains instructions for HOW to fill forms (tool usage, field detection, workflow steps)
 *    - Imported from ./prompts/form-fill-workflow.ts
 *
 * 2. SAFETY (hardcoded, non-editable):
 *    - Defined in this file as FORM_FILL_SAFETY_RULES
 *    - Contains guardrails for WHAT the agent is allowed to fill
 *    - Automatically appended to every form fill prompt at runtime
 *    - NOT editable to ensure safety constraints cannot be bypassed
 *
 * The final prompt sent to Claude is: workflow + safety
 *
 * Use getFormFillPrompt() to get the complete assembled prompt.
 */

import { buildFormFillWorkflowPrompt } from "./prompts/form-fill-workflow.js"

/**
 * Hardcoded safety rules appended to every form fill prompt.
 * These rules are NON-NEGOTIABLE and cannot be edited via the UI.
 *
 * DO NOT move these to the database - they must remain immutable.
 */
export const FORM_FILL_SAFETY_RULES = `
============================================================
SAFETY RULES (NON-NEGOTIABLE)
============================================================

WHAT YOU MUST DO:
- Fill ALL fields where data exists in the profile - do not skip or abbreviate
- Answer job-related questions using job description + profile (e.g., "Why this role?")
- Use sensible defaults for standard questions (work authorization: YES, sponsorship: NO)
- Upload only the provided resume/cover letter files - never invent files

WHAT YOU MUST NOT DO:
- DO NOT fabricate data - no made-up dates, companies, addresses, IDs, or demographics
- DO NOT answer deeply personal trap questions unrelated to the job:
  * School grades/GPA (unless in profile)
  * Childhood, family situation, personal philosophies
  * Political, religious, or medical questions
  * Subjective self-ratings unrelated to job skills
- DO NOT guess at ambiguous multi-choice options - only select exact matches
- DO NOT assume forms will auto-populate - they won't, fill everything manually

WHEN TO LEAVE A FIELD EMPTY (RARE):
Only leave a field empty if ALL of these are true:
1. The data is genuinely NOT in the user profile
2. It cannot be reasonably answered from the job context
3. It's a personal trap question (not a standard application field)

Standard fields like name, email, work history, education should NEVER be left empty.`

/**
 * Get the complete form fill prompt (workflow + safety rules) with user context inlined.
 *
 * Embedding profile and job context directly in the prompt eliminates the need for
 * Claude to call get_user_profile/get_job_context as its first action, which avoids
 * a known Claude CLI bug with parallel MCP tool calls ("tool_use ids must be unique").
 *
 * @param userProfile - User profile text (name, experience, education, etc.)
 * @param jobContext - Job details text (title, company, description, etc.)
 * @returns Combined prompt with context + workflow instructions + safety rules
 */
export function getFormFillPrompt(userProfile: string, jobContext: string): string {
  const workflow = buildFormFillWorkflowPrompt(userProfile, jobContext)
  return `${workflow.trim()}\n\n\n${FORM_FILL_SAFETY_RULES}`
}
