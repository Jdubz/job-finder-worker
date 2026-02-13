import type { GenerateDocumentPayload } from './generator.workflow.service'
import type { PersonalInfo, ContentItem, JobMatchWithListing } from '@shared/types'
import { PromptsRepository } from '../../prompts/prompts.repository'
import { getBalancedContentGuidance } from './services/content-fit.service'
import type { FitEstimate, getContentBudget } from './services/content-fit.service'
import type { ResumeContent } from '@shared/types'

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

  return [
    `- Project: ${item.title || 'Untitled Project'}`,
    ...bullets.map((b) => `  - ${b}`),
    item.skills?.length ? `  Technologies: ${item.skills.join(', ')}` : null,
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

export function buildResumePrompt(
  payload: GenerateDocumentPayload,
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = [],
  jobMatch: JobMatchWithListing | null = null
): string {
  const prompts = promptsRepo.getPrompts()
  const content = extractFormattedContent(contentItems)

  const variables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    jobDescriptionUrl: payload.job.jobDescriptionUrl,
    companyWebsite: payload.job.companyWebsite,
    jobLocation: payload.job.location || jobMatch?.listing?.location || undefined,
    candidateLocation: personalInfo.location || '',
    userExperience: content.workFormatted || 'No experience data available',
    userSkills: content.skillsFromCategories || content.allSkills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.company?.about || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || '',
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: jobMatch?.resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const prompt = replaceVariables(prompts.resumeGeneration, variables)
  const dataBlock = buildDataBlock(variables, content)

  // Build conditional project guidance based on resumeIntakeData
  const resumeIntakeData = jobMatch?.resumeIntakeData
  let projectGuidance = ''
  if (resumeIntakeData?.projectsToInclude?.length) {
    const projectLines = resumeIntakeData.projectsToInclude
      .map((p) => `- ${p.name}: ${p.whyRelevant}\n  Emphasize: ${p.pointsToHighlight.join(', ')}`)
      .join('\n')
    projectGuidance = `

PROJECTS:
Include 1-2 projects that best showcase skills relevant to this role. Projects can be MORE
valuable than older or less-relevant work experience — if a personal project demonstrates
key skills for this role better than a work entry, prefer the project and drop the weaker
experience entry.

Prioritize projects that:
- Demonstrate technologies or skills mentioned in the job description
- Fill gaps not covered by work experience
- Show initiative, technical depth, and breadth beyond day-job responsibilities

Recommended projects for this role (from job analysis):
${projectLines}`
  } else {
    projectGuidance = `

PROJECTS:
Include 1-2 projects that best showcase skills relevant to this role. Projects can be MORE
valuable than older or less-relevant work experience — if a personal project demonstrates
key skills for this role better than a work entry, prefer the project and drop the weaker
experience entry.

Prioritize projects that:
- Demonstrate technologies or skills mentioned in the job description
- Fill gaps not covered by work experience
- Show initiative, technical depth, and breadth beyond day-job responsibilities
If no projects are relevant, return "projects": [].`
  }

  // JSON schema and output format instructions (content guidance is in database prompt)
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
- Every technology, tool, and skill you mention MUST appear in the INPUT DATA above. If a technology is not listed in the candidate's work experience, projects, or skills, do NOT include it.
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
${projectGuidance}

${getBalancedContentGuidance(4)}`

  return prompt + dataBlock + jsonSchema
}

export function buildCoverLetterPrompt(
  payload: GenerateDocumentPayload,
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = [],
  jobMatch: JobMatchWithListing | null = null
): string {
  const prompts = promptsRepo.getPrompts()
  const content = extractFormattedContent(contentItems)

  const variables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    jobDescriptionUrl: payload.job.jobDescriptionUrl,
    companyWebsite: payload.job.companyWebsite,
    jobLocation: payload.job.location || jobMatch?.listing?.location || undefined,
    candidateLocation: personalInfo.location || '',
    userExperience: content.workFormatted || 'No experience data available',
    userSkills: content.allSkills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.company?.about || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || content.allSkills,
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: jobMatch?.resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const prompt = replaceVariables(prompts.coverLetterGeneration, variables)
  const dataBlock = buildDataBlock(variables, content, 'AUTHORITATIVE CANDIDATE DATA (use ONLY this information):')

  // Build conditional gap mitigation guidance from resumeIntakeData
  const resumeIntakeData = jobMatch?.resumeIntakeData
  let gapMitigationGuidance = ''
  if (resumeIntakeData?.gapMitigation?.length) {
    const mitigationLines = resumeIntakeData.gapMitigation
      .map((g) => `- Missing: ${g.missingSkill} → ${g.coverLetterPoint}`)
      .join('\n')
    gapMitigationGuidance = `

GAP MITIGATION:
When addressing skill gaps, reference the candidate's side projects as evidence
of hands-on experience:
${mitigationLines}
`
  }

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

  return prompt + dataBlock + gapMitigationGuidance + jsonSchema
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
- Main column lines: ${fitEstimate.mainColumnLines} (max: 55)
- Sidebar lines: ${fitEstimate.sidebarLines} (max: 55)
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
3. A relevant project is MORE valuable than a less-relevant work experience entry. Drop weaker experience entries before dropping projects that demonstrate key skills for this role.
4. Prioritize: matched skills > key strengths > ATS keywords > general experience.
5. Cut the LEAST relevant content first: redundant bullets, older/less-relevant experience entries, generic skills.
6. Keep all factual data (dates, company names, role titles) exactly as-is.
7. Reduce bullets on less-relevant roles first; keep more bullets on highly-relevant roles.
8. If projects fill genuine skill gaps for this role, keep them (trimmed if needed). If they don't, remove them.
9. Consolidate or remove the least-relevant skill categories to stay within budget.

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
