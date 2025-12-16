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

import { FORM_FILL_WORKFLOW_PROMPT } from "./prompts/form-fill-workflow.js"

/**
 * Hardcoded safety rules appended to every form fill prompt.
 * These rules are NON-NEGOTIABLE and cannot be edited via the UI.
 *
 * DO NOT move these to the database - they must remain immutable.
 */
export const FORM_FILL_SAFETY_RULES = `STRICT FORM-FILL SAFETY RULES (NON-NEGOTIABLE - DO NOT ignore):
- Only fill answers that are clearly present in the provided user profile or job context.
- Company/job-specific motivation questions ("Why this company/role?" or "How do your skills align?") ARE allowed—answer them concisely using the job description + profile. Avoid fluff.
- DO NOT answer personal/subjective traps unrelated to the job (school grades, childhood, family, personal philosophies, unrelated medical/political questions); leave those EMPTY.
- If a value is missing or ambiguous, leave the field EMPTY and call done after all known fields are filled.
- DO NOT fabricate data, guess, or infer beyond the profile/context. No made-up dates, companies, addresses, IDs, or demographic answers.
- For multi-choice fields, only select an option that exactly matches provided info; otherwise leave it blank/unselected.
- If asked for uploads, only use the provided resume/cover letter URLs; NEVER invent files.`

/**
 * Get the complete form fill prompt (workflow + safety rules).
 * This is the ONLY way to get the form fill prompt for use with the agent.
 *
 * @returns Combined prompt with workflow instructions + safety rules
 */
export function getFormFillPrompt(): string {
  return `${FORM_FILL_WORKFLOW_PROMPT.trim()}\n\n\n${FORM_FILL_SAFETY_RULES}`
}

/**
 * @deprecated Use getFormFillPrompt() instead. This function exists for backwards compatibility.
 * @param workflowPrompt - Ignored; workflow is now hardcoded
 * @returns Combined prompt with workflow instructions + safety rules
 */
export function buildFormFillPrompt(_workflowPrompt?: string): string {
  return getFormFillPrompt()
}
