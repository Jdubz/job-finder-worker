/**
 * Form Fill Safety Rules
 *
 * ARCHITECTURE: Form fill prompts have two distinct parts:
 *
 * 1. WORKFLOW (editable via database):
 *    - Stored in job_finder_config table under 'ai-prompts' -> formFill
 *    - Contains instructions for HOW to fill forms (tool usage, field detection, workflow steps)
 *    - Editable by admins through the UI to tune agent behavior
 *
 * 2. SAFETY (hardcoded, non-editable):
 *    - Defined in this file as FORM_FILL_SAFETY_RULES
 *    - Contains guardrails for WHAT the agent is allowed to fill
 *    - Automatically appended to every form fill prompt at runtime
 *    - NOT editable to ensure safety constraints cannot be bypassed
 *
 * The final prompt sent to Claude is: workflow + safety
 *
 * WHY THIS SEPARATION:
 * - Workflow changes are low-risk and benefit from iteration
 * - Safety rules are high-risk and should never be accidentally removed
 * - Clear ownership: product owns workflow, security owns safety
 */

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
 * Combines the editable workflow prompt with hardcoded safety rules.
 * This is the ONLY way to construct a form fill prompt.
 * Adds visual separation (newlines) between workflow and safety sections.
 *
 * @param workflowPrompt - The editable workflow instructions from the database
 * @returns Combined prompt with workflow + safety rules
 */
export function buildFormFillPrompt(workflowPrompt: string): string {
  if (!workflowPrompt || workflowPrompt.trim().length === 0) {
    console.warn(
      "[buildFormFillPrompt] WARNING: workflowPrompt is empty. " +
        "The resulting prompt will contain only safety rules."
    )
  }
  return `${workflowPrompt.trim()}\n\n\n${FORM_FILL_SAFETY_RULES}`
}
