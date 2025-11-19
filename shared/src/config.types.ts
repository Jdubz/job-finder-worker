import type { TimestampLike } from "./firestore.types"

export interface JobFinderConfigEntry<TPayload = unknown> {
  id: string
  payload: TPayload
  updatedAt: string
}

export interface PromptConfig {
  resumeGeneration: string
  coverLetterGeneration: string
  jobScraping: string
  jobMatching: string
  updatedAt?: TimestampLike
  updatedBy?: string | null
}

export const DEFAULT_PROMPTS: PromptConfig = {
  resumeGeneration: `You are an expert resume writer. Generate a professional resume based on the following information:

Job Description: {{jobDescription}}
Job Title: {{jobTitle}}
Company: {{companyName}}

User Experience:
{{userExperience}}

User Skills:
{{userSkills}}

Additional Instructions: {{additionalInstructions}}

Create a tailored resume that highlights relevant experience and skills for this specific role.`,

  coverLetterGeneration: `You are an expert cover letter writer. Generate a compelling cover letter based on:

Job Description: {{jobDescription}}
Job Title: {{jobTitle}}
Company: {{companyName}}

User Experience:
{{userExperience}}

Match Reason: {{matchReason}}

Additional Instructions: {{additionalInstructions}}

Write a personalized cover letter that demonstrates enthusiasm and fit for the role.`,

  jobScraping: `Extract job posting information from the provided HTML content.

HTML Content: {{htmlContent}}

Extract and return structured data including:
- Job Title
- Company Name
- Location
- Job Type (Full-time, Part-time, Contract, etc.)
- Salary Range (if available)
- Job Description
- Required Skills
- Qualifications
- Benefits

Return the data in JSON format.`,

  jobMatching: `Analyze the job match score and provide reasoning.

Job Description: {{jobDescription}}
User Resume: {{userResume}}
User Skills: {{userSkills}}

Evaluate:
1. Skills alignment (technical and soft skills)
2. Experience relevance
3. Role fit
4. Growth potential

Provide:
- Match score (0-100)
- Match reason (why this is a good fit)
- Strengths (what makes the candidate strong)
- Concerns (potential gaps or mismatches)
- Customization recommendations (what to emphasize)`
}
