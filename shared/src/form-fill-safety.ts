/**
 * @deprecated Form fill functionality has been moved to the job-applicator Electron app.
 *
 * The form fill prompt (workflow + safety rules) is now self-contained in:
 * - job-applicator/src/prompts/form-fill-workflow.ts (workflow instructions)
 * - job-applicator/src/form-fill-safety.ts (safety rules + assembly)
 *
 * This file is kept for backwards compatibility but should not be used for new code.
 */

/**
 * @deprecated Safety rules are now defined in job-applicator/src/form-fill-safety.ts
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
 * @deprecated Use job-applicator/src/form-fill-safety.ts getFormFillPrompt() instead.
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
