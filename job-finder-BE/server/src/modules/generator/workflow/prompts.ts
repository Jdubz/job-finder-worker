import type { GenerateDocumentPayload } from './generator.workflow.service'
import type { PersonalInfo, ContentItem, JobMatchWithListing } from '@shared/types'
import { PromptsRepository } from '../../prompts/prompts.repository'
import { getBalancedContentGuidance } from './services/content-fit.service'
import type { FitEstimate, getContentBudget } from './services/content-fit.service'
import type { ResumeContent, CoverLetterContent } from '@shared/types'

const promptsRepo = new PromptsRepository()

interface PromptVariables {
  candidateName: string
  jobTitle: string
  companyName: string
  jobDescription: string
  jobDescriptionUrl?: string
  companyWebsite?: string
  jobLocation?: string
  userExperience: string
  userSkills: string
  additionalInstructions: string
  companyInfo?: string
  matchedSkills?: string
  keyStrengths?: string
  atsKeywords?: string
  candidateLocation?: string
}

function replaceVariables(template: string, variables: PromptVariables): string {
  return template
    .replace(/\{\{candidateName\}\}/g, variables.candidateName)
    .replace(/\{\{jobTitle\}\}/g, variables.jobTitle)
    .replace(/\{\{companyName\}\}/g, variables.companyName)
    .replace(/\{\{jobDescription\}\}/g, variables.jobDescription)
    .replace(/\{\{userExperience\}\}/g, variables.userExperience)
    .replace(/\{\{userSkills\}\}/g, variables.userSkills)
    .replace(/\{\{additionalInstructions\}\}/g, variables.additionalInstructions)
    .replace(/\{\{companyInfo\}\}/g, variables.companyInfo || '')
    .replace(/\{\{matchedSkills\}\}/g, variables.matchedSkills || '')
    .replace(/\{\{keyStrengths\}\}/g, variables.keyStrengths || '')
    .replace(/\{\{atsKeywords\}\}/g, variables.atsKeywords || '')
    .replace(/\{\{jobLocation\}\}/g, variables.jobLocation || '')
    .replace(/\{\{companyWebsite\}\}/g, variables.companyWebsite || '')
    .replace(/\{\{jobDescriptionUrl\}\}/g, variables.jobDescriptionUrl || '')
    .replace(/\{\{candidateLocation\}\}/g, variables.candidateLocation || '')
}

/** Build a lookup of children by parent ID */
function buildChildrenMap(items: ContentItem[]): Map<string | null, ContentItem[]> {
  const map = new Map<string | null, ContentItem[]>()
  for (const item of items) {
    const parentId = item.parentId ?? null
    if (!map.has(parentId)) {
      map.set(parentId, [])
    }
    map.get(parentId)!.push(item)
  }
  return map
}

/** Content item type predicates */
type AiContextType = 'work' | 'education' | 'project' | 'skills' | 'narrative' | 'highlight'

function filterByContext(items: ContentItem[], context: AiContextType): ContentItem[] {
  return items.filter((item) => item.aiContext === context)
}

/** Extracted content from content items, formatted for prompts */
interface FormattedContent {
  workFormatted: string
  educationFormatted: string
  projectsFormatted: string
  narrativeText: string
  skillsFromCategories: string
  allSkills: string
}

/**
 * Extract and format all content items for use in prompts.
 * This is shared between resume and cover letter prompt builders.
 */
function extractFormattedContent(contentItems: ContentItem[]): FormattedContent {
  const childrenMap = buildChildrenMap(contentItems)

  // Work items with highlights
  const workItems = filterByContext(contentItems, 'work')
  const workFormatted = workItems
    .map((work) => {
      const highlights = (childrenMap.get(work.id) || []).filter(
        (child) => child.aiContext === 'highlight'
      )
      return formatWorkItem(work, highlights)
    })
    .join('\n\n')

  // Education
  const educationFormatted = filterByContext(contentItems, 'education')
    .map(formatEducationItem)
    .join('\n')

  // Projects
  const projectsFormatted = filterByContext(contentItems, 'project')
    .map(formatProjectItem)
    .join('\n')

  // Narrative
  const narrativeText = filterByContext(contentItems, 'narrative')
    .map((item) => item.description || '')
    .filter(Boolean)
    .join('\n\n')

  // Skills
  const skillsFromCategories = filterByContext(contentItems, 'skills')
    .map(formatSkillsItem)
    .filter(Boolean)
    .join('\n')

  const allSkills = [...new Set(contentItems.flatMap((item) => item.skills || []))].join(', ')

  return {
    workFormatted,
    educationFormatted,
    projectsFormatted,
    narrativeText,
    skillsFromCategories,
    allSkills
  }
}

/**
 * Build the authoritative data block for AI prompts.
 */
function buildDataBlock(
  variables: PromptVariables,
  content: FormattedContent,
  header = 'INPUT DATA (authoritative — use exactly this):'
): string {
  const { workFormatted, educationFormatted, projectsFormatted, narrativeText, skillsFromCategories, allSkills } = content
  const skills = skillsFromCategories || allSkills || 'None'

  return `

${header}

Candidate: ${variables.candidateName}
Target Role: ${variables.jobTitle}
Company: ${variables.companyName}
Company Website: ${variables.companyWebsite || 'None provided'}
Job Location: ${variables.jobLocation || 'None provided'}
Job Post URL: ${variables.jobDescriptionUrl || 'None provided'}
Candidate Location: ${variables.candidateLocation || 'Unknown'}

Job Description:
${variables.jobDescription}

Work Experience:
${workFormatted || 'None'}

Education:
${educationFormatted || 'None'}

Projects:
${projectsFormatted || 'None'}

Skills:
${skills}

Background/Narrative:
${narrativeText || 'None'}

Additional Instructions:
${variables.additionalInstructions || 'None'}`
}

/** Parse a description string into a list of clean bullet points */
function parseDescriptionToBullets(description?: string | null): string[] {
  return (description || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
}

/** Format work experience item with its highlight children */
function formatWorkItem(item: ContentItem, highlights: ContentItem[]): string {
  // Format main description bullets (role-level achievements, not project-specific)
  const mainBullets = parseDescriptionToBullets(item.description)

  // Format role-level bullets (these are general to the employer, not project-specific)
  const roleBulletsFormatted = mainBullets.length
    ? '  Role-Level Achievements (general to this employer):\n' +
      mainBullets.map((b) => `    - ${b}`).join('\n')
    : ''

  // Format highlight children as SEPARATE PROJECTS with clear boundaries
  // Each highlight is a distinct project/case study - they must NOT be mixed
  const projectsFormatted = highlights
    .filter((h) => h.title || h.description)
    .map((h) => {
      const projectName = h.title || 'Unnamed Project'
      const descLines = parseDescriptionToBullets(h.description)
      const projectSkills = h.skills?.length ? `    Technologies: ${h.skills.join(', ')}` : ''

      // Only include the project block if there is actual content (descLines or projectSkills)
      if (descLines.length === 0 && !projectSkills) {
        return ''
      }

      return [
        `  [PROJECT: ${projectName}] (ID: ${h.id})`,
        `    IMPORTANT: All content below belongs ONLY to this project. Do not mix with other projects.`,
        ...descLines.map((line) => `    - ${line}`),
        projectSkills
      ].filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')

  // Collect skills from work item and highlights
  const skills = [
    ...(item.skills ?? []),
    ...highlights.flatMap((h) => h.skills ?? [])
  ]
  const uniqueSkills = [...new Set(skills)]

  return [
    `- Role: ${item.role || 'Unknown Role'}`,
    `  Company: ${item.title || 'Unknown Company'}${item.location ? ` (${item.location})` : ''}`,
    `  Dates: ${item.startDate || 'unspecified'} - ${item.endDate || 'Present'}`,
    roleBulletsFormatted || null,
    projectsFormatted ? `\n  Projects/Highlights (each is a SEPARATE case study - never combine content across projects):\n${projectsFormatted}` : null,
    uniqueSkills.length ? `  All Skills for this Role: ${uniqueSkills.join(', ')}` : null,
    item.website ? `  Website: ${item.website}` : null
  ]
    .filter(Boolean)
    .join('\n')
}

/** Format education item */
function formatEducationItem(item: ContentItem): string {
  const details = item.description
    ? item.description.split(/\r?\n/).filter((l) => l.trim()).slice(0, 2).join('; ')
    : ''

  return [
    `- Institution: ${item.title || 'Unknown'}`,
    item.role ? `  Degree/Program: ${item.role}` : null,
    item.startDate || item.endDate ? `  Dates: ${item.startDate || ''} - ${item.endDate || ''}` : null,
    details ? `  Details: ${details}` : null
  ]
    .filter(Boolean)
    .join('\n')
}

/** Format personal project item */
function formatProjectItem(item: ContentItem): string {
  const bullets = parseDescriptionToBullets(item.description)
  const skills = item.skills || []
  const skillsLower = skills.map((s) => s.toLowerCase())

  // Tag each bullet as [DOMAIN] or [GENERIC] based on whether it references project technologies.
  // This helps the AI prioritize domain-relevant highlights over generic engineering ones.
  const genericPatterns = /\b(unit test|integration test|test coverage|ci\/cd|code review|documentation|refactor|linting|deploy|monitoring)\b/i
  const taggedBullets = bullets.map((b) => {
    const lower = b.toLowerCase()
    const mentionsTech = skillsLower.some((s) => lower.includes(s))
    const isGeneric = genericPatterns.test(b)
    const tag = mentionsTech && !isGeneric ? '[DOMAIN]' : isGeneric ? '[GENERIC]' : '[OTHER]'
    return `  - ${tag} ${b}`
  })

  return [
    `- Project: ${item.title || 'Untitled Project'}`,
    ...taggedBullets,
    skills.length ? `  Technologies: ${skills.join(', ')}` : null,
    item.website ? `  Link: ${item.website}` : null
  ]
    .filter(Boolean)
    .join('\n')
}

/** Format skills category */
function formatSkillsItem(item: ContentItem): string {
  // Avoid emitting a generic "Skills" category name, which causes duplicate headers
  const categoryName = item.title && item.title.trim().length > 0 ? item.title : 'Core Capabilities'
  const skillsList = item.description
    ? item.description.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    : item.skills || []

  return skillsList.length ? `${categoryName}: ${skillsList.join(', ')}` : ''
}

/**
 * Build the stable prefix for resume generation (system message).
 * Contains: DB template instructions (with job-specific placeholders neutralized),
 * JSON schema, output rules, candidate personal info, all content items.
 * This part is identical across generations for the same user profile.
 */
export function buildResumeStablePrefix(
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = []
): string {
  const prompts = promptsRepo.getPrompts()
  const content = extractFormattedContent(contentItems)

  // Replace candidate-specific variables in the template; leave job-specific ones as neutral markers
  const stableVariables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: '[TARGET_ROLE]',
    companyName: '[TARGET_COMPANY]',
    jobDescription: '[See user message for job description]',
    jobDescriptionUrl: '',
    companyWebsite: '',
    jobLocation: '',
    candidateLocation: personalInfo.location || '',
    userExperience: content.workFormatted || 'No experience data available',
    userSkills: content.skillsFromCategories || content.allSkills || 'No skills data available',
    additionalInstructions: '[See user message for any additional instructions]',
    companyInfo: '',
    matchedSkills: '',
    keyStrengths: '',
    atsKeywords: ''
  }

  const templateInstructions = replaceVariables(prompts.resumeGeneration, stableVariables)

  const candidateDataBlock = `

CANDIDATE DATA (authoritative — use exactly this):

Candidate: ${personalInfo.name ?? 'the candidate'}
Candidate Location: ${personalInfo.location || 'Unknown'}

Work Experience:
${content.workFormatted || 'None'}

Education:
${content.educationFormatted || 'None'}

Projects:
${content.projectsFormatted || 'None'}

Skills:
${content.skillsFromCategories || content.allSkills || 'None'}

Background/Narrative:
${content.narrativeText || 'None'}`

  const jsonSchema = `
OUTPUT FORMAT (STRICT):
- You are a JSON generator. Respond with the JSON object ONLY—no prose, no markdown, no bullet lists, no explanations.
- Your very first character must be '{' and your very last character must be '}'.
- If you cannot populate a field, still include it and use the correct empty value by type:
  - string fields: ""
  - array fields: []
  - optional/object fields: null

Content rules:
- Use ONLY the provided experience, education, projects, and skills. Do NOT invent companies, roles, achievements, technologies, or skills.
- Every technology, tool, and skill you mention MUST appear in the CANDIDATE DATA above. If a technology is not listed in the candidate's work experience, projects, or skills, do NOT include it.
- Do NOT add technologies the candidate does not have (e.g., do not add AWS, Kafka, Kubernetes, etc. unless they appear in the source data).
- Rephrase and tailor the candidate's EXISTING achievements for this role — do not fabricate new ones.

Return the result as a JSON object with this exact structure:
{
  "personalInfo": { "title": "Job Title matching target role" },
  "professionalSummary": "2-3 sentence summary",
  "experience": [{ "role": "...", "company": "...", "location": "...", "startDate": "...", "endDate": "...", "highlights": ["bullet1", "bullet2"], "technologies": ["tech1", "tech2"] }],
  "projects": [{ "name": "...", "description": "...", "highlights": ["point1", "point2"], "technologies": ["tech1"], "link": "..." }],
  "skills": [
    { "category": "CategoryName", "items": ["Skill1", "Skill2", "Skill3"] }
  ],
  "education": [{ "institution": "...", "degree": "...", "field": "...", "endDate": "..." }]
}

${getBalancedContentGuidance(4)}`

  return templateInstructions + candidateDataBlock + jsonSchema
}

/**
 * Build the variable job-specific prompt for resume generation (user message).
 * Contains: target role, company, JD, matched skills, project guidance, preferences.
 */
export function buildResumeJobPrompt(
  payload: GenerateDocumentPayload,
  jobMatch: JobMatchWithListing | null = null
): string {
  const resumeIntakeData = jobMatch?.resumeIntakeData

  const parts: string[] = [
    `Generate a resume for this job:`,
    ``,
    `Target Role: ${payload.job.role}`,
    `Company: ${payload.job.company}`,
  ]

  if (payload.job.companyWebsite) parts.push(`Company Website: ${payload.job.companyWebsite}`)
  if (payload.job.location || jobMatch?.listing?.location) {
    parts.push(`Job Location: ${payload.job.location || jobMatch?.listing?.location}`)
  }
  if (payload.job.jobDescriptionUrl) parts.push(`Job Post URL: ${payload.job.jobDescriptionUrl}`)

  parts.push(``, `Job Description:`, payload.job.jobDescriptionText || 'No job description provided')

  if (jobMatch?.company?.about) {
    parts.push(``, `Company Info: ${jobMatch.company.about}`)
  }

  if (jobMatch?.matchedSkills?.length) {
    parts.push(``, `Matched Skills: ${jobMatch.matchedSkills.join(', ')}`)
  }
  if (jobMatch?.keyStrengths?.length) {
    parts.push(`Key Strengths: ${jobMatch.keyStrengths.join(', ')}`)
  }
  if (resumeIntakeData?.atsKeywords?.length) {
    parts.push(`ATS Keywords: ${resumeIntakeData.atsKeywords.join(', ')}`)
  }

  // Project guidance
  if (resumeIntakeData?.projectsToInclude?.length) {
    const projectLines = resumeIntakeData.projectsToInclude
      .map((p) => `- ${p.name}: ${p.whyRelevant}\n  Emphasize: ${p.pointsToHighlight.join(', ')}`)
      .join('\n')
    parts.push(`
EXPERIENCE PRIORITY:
- ALWAYS include ALL relevant professional work experience. Work experience is the most valuable section.
- Include as many experience entries as possible (up to the budget). Do NOT drop work experience to make room for projects.
- When you have fewer experience entries, use MORE bullets per entry (up to 5-6) to showcase depth. Fill the page with work experience first.

PROJECTS:
Projects should ONLY be included if they are HIGHLY relevant to the job description AND
the candidate lacks professional experience in that specific area. Projects exist to fill
genuine gaps — they should never replace or displace work experience.

If including projects, limit to 1-2 that directly address skill gaps:
${projectLines}

PROJECT HIGHLIGHT SELECTION (CRITICAL):
A project is included to demonstrate a SPECIFIC skill gap. Its highlights MUST prove that skill.
- Select ONLY highlights that directly demonstrate the skill gap the project fills.
- Project bullets in the CANDIDATE DATA are tagged [DOMAIN], [GENERIC], or [OTHER]. STRONGLY prefer [DOMAIN]-tagged bullets — these mention the project's core technologies. Avoid [GENERIC] bullets (testing, CI/CD, docs) unless no [DOMAIN] bullets exist.
- If the project fills an AI/ML gap, pick bullets about model integration, embeddings, vector search, inference, RAG, etc. — NOT about testing or deployment.
- Drop generic highlights (testing, documentation, refactoring) unless they are the only ones available.
- Rewrite/tailor selected highlights to emphasize the gap-filling skill when appropriate.

If the candidate's work experience already covers the key requirements, return "projects": [].`)
  } else {
    parts.push(`
EXPERIENCE PRIORITY:
- ALWAYS include ALL relevant professional work experience. Work experience is the most valuable section.
- Include as many experience entries as possible (up to the budget). Do NOT drop work experience to make room for projects.
- When you have fewer experience entries, use MORE bullets per entry (up to 5-6) to showcase depth. Fill the page with work experience first.

PROJECTS:
Projects should ONLY be included if they are HIGHLY relevant to the job description AND
the candidate lacks professional experience in that specific area. Projects exist to fill
genuine gaps — they should never replace or displace work experience.

PROJECT HIGHLIGHT SELECTION (CRITICAL):
A project is included to demonstrate a SPECIFIC skill gap. Its highlights MUST prove that skill.
- Select ONLY highlights that directly demonstrate the skill gap the project fills.
- Project bullets in the CANDIDATE DATA are tagged [DOMAIN], [GENERIC], or [OTHER]. STRONGLY prefer [DOMAIN]-tagged bullets — these mention the project's core technologies. Avoid [GENERIC] bullets (testing, CI/CD, docs) unless no [DOMAIN] bullets exist.
- If the project fills an AI/ML gap, pick bullets about model integration, embeddings, vector search, inference, RAG, etc. — NOT about testing or deployment.
- Drop generic highlights (testing, documentation, refactoring) unless they are the only ones available.
- Rewrite/tailor selected highlights to emphasize the gap-filling skill when appropriate.

If the candidate's work experience already covers the key requirements, return "projects": [].`)
  }

  if (payload.preferences?.emphasize?.length) {
    parts.push(``, `Additional Instructions: ${payload.preferences.emphasize.join(', ')}`)
  }

  return parts.join('\n')
}

/**
 * Build a complete resume prompt (combined system + user for backward compatibility).
 * Used by retry/refit paths that need a single prompt string.
 */
export function buildResumePrompt(
  payload: GenerateDocumentPayload,
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = [],
  jobMatch: JobMatchWithListing | null = null
): string {
  return buildResumeStablePrefix(personalInfo, contentItems) + '\n\n' + buildResumeJobPrompt(payload, jobMatch)
}

/**
 * Build the stable prefix for cover letter generation (system message).
 * Contains: DB template instructions, JSON schema, output rules, candidate data.
 */
export function buildCoverLetterStablePrefix(
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = []
): string {
  const prompts = promptsRepo.getPrompts()
  const content = extractFormattedContent(contentItems)

  const stableVariables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: '[TARGET_ROLE]',
    companyName: '[TARGET_COMPANY]',
    jobDescription: '[See user message for job description]',
    jobDescriptionUrl: '',
    companyWebsite: '',
    jobLocation: '',
    candidateLocation: personalInfo.location || '',
    userExperience: content.workFormatted || 'No experience data available',
    userSkills: content.allSkills || 'No skills data available',
    additionalInstructions: '[See user message for any additional instructions]',
    companyInfo: '',
    matchedSkills: '',
    keyStrengths: '',
    atsKeywords: ''
  }

  const templateInstructions = replaceVariables(prompts.coverLetterGeneration, stableVariables)

  const candidateDataBlock = `

AUTHORITATIVE CANDIDATE DATA (use ONLY this information):

Candidate: ${personalInfo.name ?? 'the candidate'}
Candidate Location: ${personalInfo.location || 'Unknown'}

Work Experience:
${content.workFormatted || 'None'}

Education:
${content.educationFormatted || 'None'}

Projects:
${content.projectsFormatted || 'None'}

Skills:
${content.skillsFromCategories || content.allSkills || 'None'}

Background/Narrative:
${content.narrativeText || 'None'}`

  const jsonSchema = `
OUTPUT FORMAT (STRICT):
- You are a JSON generator. Respond with the JSON object ONLY—no prose, no markdown, no bullet lists, no explanations.
- Your very first character must be '{' and your very last character must be '}'.
- If you cannot populate a field, still include it and use the correct empty value by type:
  - string fields: ""
  - array fields: []
  - optional/object fields: null

Content rules:
- Use ONLY the provided experience, education, projects, and skills. Do NOT invent companies, roles, achievements, technologies, or skills.
- Pick the most relevant 2-3 experiences/achievements for THIS role/company.
- The "signature" field is just the closing phrase (e.g., "Best," or "Cheers,"); the candidate name is appended separately.

Return the JSON object with exactly these keys:
{
  "greeting": "e.g., Hello Hiring Manager,",
  "openingParagraph": "1 short paragraph that proves fit and interest",
  "bodyParagraphs": ["Paragraph 1", "Paragraph 2"],
  "closingParagraph": "1 short paragraph that closes confidently",
  "signature": "e.g., Best,"
}`

  return templateInstructions + candidateDataBlock + jsonSchema
}

/**
 * Build the variable job-specific prompt for cover letter generation (user message).
 */
export function buildCoverLetterJobPrompt(
  payload: GenerateDocumentPayload,
  jobMatch: JobMatchWithListing | null = null
): string {
  const resumeIntakeData = jobMatch?.resumeIntakeData

  const parts: string[] = [
    `Generate a cover letter for this job:`,
    ``,
    `Target Role: ${payload.job.role}`,
    `Company: ${payload.job.company}`,
  ]

  if (payload.job.companyWebsite) parts.push(`Company Website: ${payload.job.companyWebsite}`)
  if (payload.job.location || jobMatch?.listing?.location) {
    parts.push(`Job Location: ${payload.job.location || jobMatch?.listing?.location}`)
  }
  if (payload.job.jobDescriptionUrl) parts.push(`Job Post URL: ${payload.job.jobDescriptionUrl}`)

  parts.push(``, `Job Description:`, payload.job.jobDescriptionText || 'No job description provided')

  if (jobMatch?.company?.about) {
    parts.push(``, `Company Info: ${jobMatch.company.about}`)
  }

  if (jobMatch?.matchedSkills?.length) {
    parts.push(``, `Matched Skills: ${jobMatch.matchedSkills.join(', ')}`)
  }
  if (jobMatch?.keyStrengths?.length) {
    parts.push(`Key Strengths: ${jobMatch.keyStrengths.join(', ')}`)
  }
  if (resumeIntakeData?.atsKeywords?.length) {
    parts.push(`ATS Keywords: ${resumeIntakeData.atsKeywords.join(', ')}`)
  }

  // Gap mitigation guidance
  if (resumeIntakeData?.gapMitigation?.length) {
    const mitigationLines = resumeIntakeData.gapMitigation
      .map((g) => `- Missing: ${g.missingSkill} → ${g.coverLetterPoint}`)
      .join('\n')
    parts.push(`
GAP MITIGATION:
When addressing skill gaps, reference the candidate's side projects as evidence
of hands-on experience:
${mitigationLines}`)
  }

  if (payload.preferences?.emphasize?.length) {
    parts.push(``, `Additional Instructions: ${payload.preferences.emphasize.join(', ')}`)
  }

  return parts.join('\n')
}

/**
 * Build a complete cover letter prompt (combined system + user for backward compatibility).
 */
export function buildCoverLetterPrompt(
  payload: GenerateDocumentPayload,
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = [],
  jobMatch: JobMatchWithListing | null = null
): string {
  return buildCoverLetterStablePrefix(personalInfo, contentItems) + '\n\n' + buildCoverLetterJobPrompt(payload, jobMatch)
}

export function buildRefitPrompt(
  firstAttempt: ResumeContent,
  fitEstimate: FitEstimate,
  contentBudget: ReturnType<typeof getContentBudget>,
  payload: GenerateDocumentPayload,
  jobMatch: JobMatchWithListing | null
): string {
  const resumeIntakeData = jobMatch?.resumeIntakeData

  // Job context
  const jobContext = [
    `Role: ${payload.job.role}`,
    `Company: ${payload.job.company}`,
    payload.job.location ? `Location: ${payload.job.location}` : null,
    payload.job.jobDescriptionText
      ? `Job Description:\n${payload.job.jobDescriptionText}`
      : null
  ].filter(Boolean).join('\n')

  // ResumeIntakeData relevance signals
  let intakeGuidance = ''
  if (resumeIntakeData) {
    const parts: string[] = []
    if (resumeIntakeData.projectsToInclude?.length) {
      const projectLines = resumeIntakeData.projectsToInclude
        .map((p) => `  - ${p.name}: ${p.whyRelevant}`)
        .join('\n')
      parts.push(`Recommended projects (from job analysis):\n${projectLines}`)
    }
    if (resumeIntakeData.skillsPriority?.length) {
      parts.push(`Skills priority order: ${resumeIntakeData.skillsPriority.join(', ')}`)
    }
    if (resumeIntakeData.experienceHighlights?.length) {
      const expLines = resumeIntakeData.experienceHighlights
        .map((e) => `  - ${e.company} (${e.title}): ${e.pointsToEmphasize.join(', ')}`)
        .join('\n')
      parts.push(`Experience relevance:\n${expLines}`)
    }
    if (parts.length) {
      intakeGuidance = `\nJOB ANALYSIS RELEVANCE SIGNALS:\n${parts.join('\n\n')}\n`
    }
  }

  // Match context
  let matchContext = ''
  if (jobMatch) {
    const parts: string[] = []
    if (jobMatch.matchedSkills?.length) {
      parts.push(`Matched skills: ${jobMatch.matchedSkills.join(', ')}`)
    }
    if (jobMatch.keyStrengths?.length) {
      parts.push(`Key strengths: ${jobMatch.keyStrengths.join(', ')}`)
    }
    if (resumeIntakeData?.atsKeywords?.length) {
      parts.push(`ATS keywords: ${resumeIntakeData.atsKeywords.join(', ')}`)
    }
    if (parts.length) {
      matchContext = `\n${parts.join('\n')}\n`
    }
  }

  return `You are a resume EDITOR, not a writer. Your job is to trim an overflowing resume to fit a single-page layout.

FIRST ATTEMPT (the resume content that overflowed):
${JSON.stringify(firstAttempt, null, 2)}

OVERFLOW DIAGNOSIS:
- Main column lines: ${fitEstimate.mainColumnLines} (max: 60)
- Sidebar lines: ${fitEstimate.sidebarLines} (max: 60)
- Overflow: ${fitEstimate.overflow} lines over limit
- Suggestions: ${fitEstimate.suggestions.length ? fitEstimate.suggestions.join('; ') : 'none'}

STRICT CONTENT BUDGET (do NOT exceed):
- Max experience entries: ${contentBudget.maxExperiences}
- Max bullets per experience: ${contentBudget.maxBulletsPerExperience}
- Max summary words: ${contentBudget.maxSummaryWords}
- Max skill categories: ${contentBudget.maxSkillCategories}
- Max projects: ${contentBudget.maxProjects}
- Max bullets per project: ${contentBudget.maxBulletsPerProject}

JOB CONTEXT:
${jobContext}
${matchContext}${intakeGuidance}
EDITORIAL INSTRUCTIONS:
1. You are an editor, not a writer. Trim content to fit the budget — do NOT rewrite bullets or invent new content.
2. Do NOT add any technologies, skills, tools, or achievements that are not in the first attempt. You may ONLY remove content, never add.
3. Work experience is MORE valuable than projects. Drop projects before dropping work experience entries. Only keep projects that fill genuine skill gaps not covered by any work experience.
4. Prioritize: matched skills > key strengths > ATS keywords > general experience.
5. Cut the LEAST relevant content first: projects, redundant bullets, generic skills, then older experience entries as a last resort.
   When trimming project highlights, drop generic bullets (testing, CI/CD, documentation) BEFORE domain-relevant ones (the core technologies the project demonstrates).
6. Keep all factual data (dates, company names, role titles) exactly as-is.
7. Reduce bullets on less-relevant roles first; keep more bullets on highly-relevant roles.
8. Consolidate or remove the least-relevant skill categories to stay within budget.

OUTPUT FORMAT (STRICT):
- Respond with the JSON object ONLY — no prose, no markdown, no explanations.
- Your very first character must be '{' and your very last character must be '}'.
- Use the exact same JSON structure as the first attempt.

Return the trimmed resume as a JSON object with this exact structure:
{
  "personalInfo": { "title": "Job Title matching target role" },
  "professionalSummary": "2-3 sentence summary",
  "experience": [{ "role": "...", "company": "...", "location": "...", "startDate": "...", "endDate": "...", "highlights": ["bullet1", "bullet2"], "technologies": ["tech1", "tech2"] }],
  "projects": [{ "name": "...", "description": "...", "highlights": ["point1", "point2"], "technologies": ["tech1"], "link": "..." }],
  "skills": [
    { "category": "CategoryName", "items": ["Skill1", "Skill2", "Skill3"] }
  ],
  "education": [{ "institution": "...", "degree": "...", "field": "...", "endDate": "..." }]
}`
}

export function buildExpandPrompt(
  currentResume: ResumeContent,
  fitEstimate: FitEstimate,
  contentBudget: ReturnType<typeof getContentBudget>,
  payload: GenerateDocumentPayload,
  jobMatch: JobMatchWithListing | null,
  contentItems: ContentItem[]
): string {
  const resumeIntakeData = jobMatch?.resumeIntakeData
  const content = extractFormattedContent(contentItems)

  // Build PromptVariables for the data block
  const variables: PromptVariables = {
    candidateName: payload.job.role, // used as context, not critical
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    jobDescriptionUrl: payload.job.jobDescriptionUrl,
    companyWebsite: payload.job.companyWebsite,
    jobLocation: payload.job.location || jobMatch?.listing?.location || undefined,
    candidateLocation: '',
    userExperience: content.workFormatted || 'No experience data available',
    userSkills: content.skillsFromCategories || content.allSkills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.company?.about || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || '',
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const dataBlock = buildDataBlock(variables, content, 'INPUT DATA (authoritative — expand using ONLY this material):')

  // Job context
  const jobContext = [
    `Role: ${payload.job.role}`,
    `Company: ${payload.job.company}`,
    payload.job.location ? `Location: ${payload.job.location}` : null,
    payload.job.jobDescriptionText
      ? `Job Description:\n${payload.job.jobDescriptionText}`
      : null
  ].filter(Boolean).join('\n')

  // Match context
  let matchContext = ''
  if (jobMatch) {
    const parts: string[] = []
    if (jobMatch.matchedSkills?.length) {
      parts.push(`Matched skills: ${jobMatch.matchedSkills.join(', ')}`)
    }
    if (jobMatch.keyStrengths?.length) {
      parts.push(`Key strengths: ${jobMatch.keyStrengths.join(', ')}`)
    }
    if (resumeIntakeData?.atsKeywords?.length) {
      parts.push(`ATS keywords: ${resumeIntakeData.atsKeywords.join(', ')}`)
    }
    if (parts.length) {
      matchContext = `\n${parts.join('\n')}\n`
    }
  }

  const spareLines = Math.abs(fitEstimate.overflow)

  return `You are a resume EXPANDER. The current resume has spare room — fill it with relevant content.

CURRENT RESUME (has spare room):
${JSON.stringify(currentResume, null, 2)}

PAGE CAPACITY:
- Main column lines: ${fitEstimate.mainColumnLines} (max: 60)
- Spare room: ${spareLines} lines available to fill
- Sidebar lines: ${fitEstimate.sidebarLines} (max: 60)

CONTENT BUDGET (do NOT exceed):
- Max experience entries: ${contentBudget.maxExperiences}
- Max bullets per experience: ${contentBudget.maxBulletsPerExperience}
- Max summary words: ${contentBudget.maxSummaryWords}
- Max skill categories: ${contentBudget.maxSkillCategories}
- Max projects: ${contentBudget.maxProjects}
- Max bullets per project: ${contentBudget.maxBulletsPerProject}

JOB CONTEXT:
${jobContext}
${matchContext}
${dataBlock}

EXPANSION INSTRUCTIONS (priority order):
1. Add more bullets to existing experience entries — draw from INPUT DATA highlights that were omitted. Add deeper detail, more impact metrics, and quantified outcomes. This is the highest priority.
2. If the INPUT DATA contains a work experience entry not already in the resume, add it as a new entry (respecting the max experience budget).
3. Lengthen existing bullets with more specifics — metrics, technologies used, business outcomes.
4. Do NOT invent new facts, achievements, companies, or technologies. Only use content from the INPUT DATA above.
5. Prioritize expansions that are relevant to the target role: matched skills > key strengths > ATS keywords > general experience.
6. Keep all existing content intact — you are ADDING, not rewriting.
7. Keep all factual data (dates, company names, role titles) exactly as-is.

OUTPUT FORMAT (STRICT):
- Respond with the JSON object ONLY — no prose, no markdown, no explanations.
- Your very first character must be '{' and your very last character must be '}'.
- Use the exact same JSON structure as the current resume.

Return the expanded resume as a JSON object with this exact structure:
{
  "personalInfo": { "title": "Job Title matching target role" },
  "professionalSummary": "2-3 sentence summary",
  "experience": [{ "role": "...", "company": "...", "location": "...", "startDate": "...", "endDate": "...", "highlights": ["bullet1", "bullet2"], "technologies": ["tech1", "tech2"] }],
  "projects": [{ "name": "...", "description": "...", "highlights": ["point1", "point2"], "technologies": ["tech1"], "link": "..." }],
  "skills": [
    { "category": "CategoryName", "items": ["Skill1", "Skill2", "Skill3"] }
  ],
  "education": [{ "institution": "...", "degree": "...", "field": "...", "endDate": "..." }]
}`
}

export function buildResumeRetryPrompt(
  originalPrompt: string,
  firstAttempt: ResumeContent | CoverLetterContent,
  feedback: string
): string {
  return `You previously generated a document that the user wants revised.

ORIGINAL GENERATION PROMPT:
${originalPrompt}

YOUR FIRST ATTEMPT (JSON):
${JSON.stringify(firstAttempt, null, 2)}

USER FEEDBACK — REVISE BASED ON THIS:
${feedback}

Generate a revised document incorporating the user's feedback.
Return ONLY valid JSON in the same schema as the first attempt.
Keep all content that the user did not mention — only change what they asked for.

OUTPUT FORMAT (STRICT):
- You are a JSON generator. Respond with the JSON object ONLY—no prose, no markdown, no bullet lists, no explanations.
- Your very first character must be '{' and your very last character must be '}'.`
}

/**
 * Build a lightweight framing prompt for cover letters when body paragraphs are cached.
 * Generates only: greeting, openingParagraph, closingParagraph, signature (~100 output tokens).
 */
export function buildCoverLetterFramingPrompt(
  personalInfo: PersonalInfo,
  payload: GenerateDocumentPayload,
  cachedBodyParagraphs: string[],
  jobMatch: JobMatchWithListing | null
): string {
  const matchContext: string[] = []
  if (jobMatch?.matchedSkills?.length) {
    matchContext.push(`Matched Skills: ${jobMatch.matchedSkills.join(', ')}`)
  }
  if (jobMatch?.keyStrengths?.length) {
    matchContext.push(`Key Strengths: ${jobMatch.keyStrengths.join(', ')}`)
  }

  return `You are generating ONLY the company-specific framing for a cover letter.
The body paragraphs are already written and cached — you do NOT generate them.

CANDIDATE: ${personalInfo.name ?? 'the candidate'}
TARGET ROLE: ${payload.job.role}
COMPANY: ${payload.job.company}
${payload.job.companyWebsite ? `COMPANY WEBSITE: ${payload.job.companyWebsite}` : ''}
${jobMatch?.company?.about ? `COMPANY INFO: ${jobMatch.company.about}` : ''}
${matchContext.length ? matchContext.join('\n') : ''}

CACHED BODY PARAGRAPHS (already written — reference these for context but do NOT reproduce):
${cachedBodyParagraphs.map((p, i) => `[${i + 1}] ${p.length > 120 ? p.slice(0, 120) + '...' : p}`).join('\n')}

Generate a JSON object with exactly these four keys:
{
  "greeting": "e.g., Dear Hiring Manager,",
  "openingParagraph": "1 short paragraph expressing interest in this specific role at this company",
  "closingParagraph": "1 short paragraph closing confidently with a call to action",
  "signature": "e.g., Best,"
}

RULES:
- The opening must mention the COMPANY NAME and TARGET ROLE specifically.
- The closing should be confident and reference this specific opportunity.
- The signature is just the closing phrase (e.g., "Best,"). The candidate name is added separately.
- Keep it concise — the body paragraphs carry the substance.

OUTPUT FORMAT (STRICT):
- Respond with the JSON object ONLY — no prose, no markdown, no explanations.
- Your very first character must be '{' and your very last character must be '}'.`
}

export function buildAdaptPrompt(
  cachedContent: unknown,
  payload: GenerateDocumentPayload,
  jobMatch: JobMatchWithListing | null,
  documentType: 'resume' | 'cover_letter'
): string {
  const resumeIntakeData = jobMatch?.resumeIntakeData

  const matchContext: string[] = []
  if (jobMatch?.matchedSkills?.length) {
    matchContext.push(`Matched Skills: ${jobMatch.matchedSkills.join(', ')}`)
  }
  if (jobMatch?.keyStrengths?.length) {
    matchContext.push(`Key Strengths: ${jobMatch.keyStrengths.join(', ')}`)
  }
  if (resumeIntakeData?.atsKeywords?.length) {
    matchContext.push(`ATS Keywords: ${resumeIntakeData.atsKeywords.join(', ')}`)
  }

  const jsonSchemaNote = documentType === 'resume'
    ? `Use the exact same JSON structure as the cached content (personalInfo, professionalSummary, experience, projects, skills, education).`
    : `Use the exact same JSON structure as the cached content (greeting, openingParagraph, bodyParagraphs, closingParagraph, signature).`

  return `You are a document ADAPTER. You have a previously generated ${documentType === 'resume' ? 'resume' : 'cover letter'} for a similar role. Make minimal adjustments to tailor it for a new job.

CACHED CONTENT (starting point — keep ~85-95% identical):
${JSON.stringify(cachedContent, null, 2)}

NEW TARGET JOB:
Role: ${payload.job.role}
Company: ${payload.job.company}
${payload.job.location ? `Location: ${payload.job.location}` : ''}
${payload.job.companyWebsite ? `Company Website: ${payload.job.companyWebsite}` : ''}

Job Description:
${payload.job.jobDescriptionText || 'No job description provided'}

${matchContext.length ? matchContext.join('\n') : ''}

ADAPTATION INSTRUCTIONS:
1. Keep the vast majority of content identical — this is an EDIT, not a rewrite.
2. Update the professional summary / opening to reference the new company name and role.
3. Re-weight bullet emphasis: prioritize highlights that match the new job's requirements.
4. Update ATS keywords in the skills section if the new job emphasizes different technologies.
5. Do NOT invent new achievements, companies, technologies, or skills that aren't already in the cached content.
6. Do NOT remove experience entries or projects — only adjust emphasis and wording.
7. Keep all factual data (dates, company names, role titles) exactly as-is.

OUTPUT FORMAT (STRICT):
- Respond with the JSON object ONLY — no prose, no markdown, no explanations.
- Your very first character must be '{' and your very last character must be '}'.
- ${jsonSchemaNote}`
}
