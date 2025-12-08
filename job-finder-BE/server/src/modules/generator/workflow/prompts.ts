import type { GenerateDocumentPayload } from './generator.workflow.service'
import type { PersonalInfo, ContentItem, JobMatchWithListing } from '@shared/types'
import { PromptsRepository } from '../../prompts/prompts.repository'
import { getBalancedContentGuidance } from './services/content-fit.service'

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

/** Format work experience item with its highlight children */
function formatWorkItem(item: ContentItem, highlights: ContentItem[]): string {
  // Format main description bullets
  const mainBullets = (item.description || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)

  // Format highlight children as additional bullets
  const highlightBullets = highlights
    .filter((h) => h.title || h.description)
    .map((h) => {
      const title = h.title || ''
      const desc = h.description
        ? h.description.split(/\r?\n/)[0]?.slice(0, 150) || ''
        : ''
      return title + (desc ? `: ${desc}` : '')
    })
    .filter(Boolean)

  const allBullets = [...mainBullets, ...highlightBullets]
  const bulletsFormatted = allBullets.length
    ? allBullets.map((b) => `    - ${b}`).join('\n')
    : ''

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
    bulletsFormatted ? `  Highlights:\n${bulletsFormatted}` : null,
    uniqueSkills.length ? `  Skills: ${uniqueSkills.join(', ')}` : null,
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
  const desc = item.description
    ? item.description.split(/\r?\n/)[0]?.slice(0, 200) || ''
    : ''

  return [
    `- Project: ${item.title || 'Untitled Project'}`,
    desc ? `  Description: ${desc}` : null,
    item.skills?.length ? `  Technologies: ${item.skills.join(', ')}` : null,
    item.website ? `  Link: ${item.website}` : null
  ]
    .filter(Boolean)
    .join('\n')
}

/** Format skills category */
function formatSkillsItem(item: ContentItem): string {
  const categoryName = item.title || 'Skills'
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

  return (
    prompt +
    dataBlock +
    '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. Do NOT ask questions or include any text outside the JSON object.' +
    '\nUse the provided experience/education/projects/skills as your only source of truth, but select only the most relevant items for this job.' +
    "\nDo NOT invent new companies, roles, dates, or technologies; every fact must come from the input data." +
    '\nRewrite bullet points in fresh language that sounds like the same person without copying sentences verbatim.' +
    '\nPrioritize accomplishments that match the job description and company tech stack.' +
    '\nIf a field is missing, leave it empty/null but still return the full JSON object.' +
    `\nReturn the result as a JSON object with this exact structure:
{
  "personalInfo": { "title": "Job Title matching target role" },
  "professionalSummary": "2-3 sentence summary",
  "experience": [{ "role": "...", "company": "...", "location": "...", "startDate": "...", "endDate": "...", "highlights": ["bullet1", "bullet2"], "technologies": ["tech1", "tech2"] }],
  "skills": [
    { "category": "Languages & Frameworks", "items": ["TypeScript", "Node.js", "React"] },
    { "category": "Databases", "items": ["MySQL", "Redis", "MongoDB"] },
    { "category": "Cloud & DevOps", "items": ["GCP", "Docker", "Kubernetes"] },
    { "category": "Tools & Integrations", "items": ["Stripe", "Twilio", "SendGrid"] }
  ],
  "education": [{ "institution": "...", "degree": "...", "field": "...", "endDate": "..." }]
}
IMPORTANT for skills: Group skills into 4-6 categories based on the role requirements. Each category needs a descriptive name and an array of skill items. DO NOT use a single "Skills" category.

${getBalancedContentGuidance(4)}`
  )
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

  return (
    prompt +
    dataBlock +
    '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. Do NOT ask questions, request clarification, or include any text outside the JSON object.' +
    '\nUse the experience, education, projects, and skills provided as your ONLY source of truth.' +
    '\nDo NOT invent new companies, roles, achievements, technologies, or skills; every claim must come from the input data above.' +
    '\nSelect the most relevant 2-3 experiences/achievements for THIS specific role and company.' +
    '\nReturn ONLY a JSON object with keys: greeting, openingParagraph, bodyParagraphs[], closingParagraph, signature.' +
    '\nThe "signature" field is the closing phrase only (e.g., "Best," or "Cheers," or "Looking forward to it,"). The candidate name is added programmatically below it.'
  )
}
