import type { GenerateDocumentPayload } from './generator.workflow.service'
import type { PersonalInfo, ContentItem, JobMatch } from '@shared/types'
import { PromptsRepository } from '../../prompts/prompts.repository'

const promptsRepo = new PromptsRepository()

interface PromptVariables {
  candidateName: string
  jobTitle: string
  companyName: string
  jobDescription: string
  userExperience: string
  userSkills: string
  additionalInstructions: string
  companyInfo?: string
  matchedSkills?: string
  keyStrengths?: string
  atsKeywords?: string
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

/** Check if item is work experience */
function isWorkItem(item: ContentItem): boolean {
  return item.aiContext === 'work'
}

/** Check if item is education */
function isEducationItem(item: ContentItem): boolean {
  return item.aiContext === 'education'
}

/** Check if item is a personal project */
function isProjectItem(item: ContentItem): boolean {
  return item.aiContext === 'project'
}

/** Check if item is a skills category */
function isSkillsItem(item: ContentItem): boolean {
  return item.aiContext === 'skills'
}

/** Check if item is narrative content */
function isNarrativeItem(item: ContentItem): boolean {
  return item.aiContext === 'narrative'
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
  jobMatch: JobMatch | null = null
): string {
  const prompts = promptsRepo.getPrompts()
  const childrenMap = buildChildrenMap(contentItems)

  // Get work items and their highlights
  const workItems = contentItems.filter(isWorkItem)
  const workFormatted = workItems
    .map((work) => {
      const highlights = (childrenMap.get(work.id) || []).filter(
        (child) => child.aiContext === 'highlight'
      )
      return formatWorkItem(work, highlights)
    })
    .join('\n\n')

  // Get education items
  const educationItems = contentItems.filter(isEducationItem)
  const educationFormatted = educationItems.map(formatEducationItem).join('\n')

  // Get personal projects
  const projectItems = contentItems.filter(isProjectItem)
  const projectsFormatted = projectItems.map(formatProjectItem).join('\n')

  // Get skills from skills items and all other items
  const skillsItems = contentItems.filter(isSkillsItem)
  const skillsFromCategories = skillsItems.map(formatSkillsItem).filter(Boolean).join('\n')
  const allSkills = [
    ...new Set(contentItems.flatMap((item) => item.skills || []))
  ].join(', ')

  // Get narrative for summary context
  const narrativeItems = contentItems.filter(isNarrativeItem)
  const narrativeText = narrativeItems
    .map((item) => item.description || '')
    .filter(Boolean)
    .join('\n\n')

  const variables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    userExperience: workFormatted || 'No experience data available',
    userSkills: skillsFromCategories || allSkills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.companyInfo || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || '',
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: jobMatch?.resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const prompt = replaceVariables(prompts.resumeGeneration, variables)

  const dataBlock = `

INPUT DATA (authoritative — use exactly this):
Candidate: ${variables.candidateName}
Target Role: ${variables.jobTitle}
Company: ${variables.companyName}

Job Description:
${variables.jobDescription}

Work Experience:
${workFormatted || 'None'}

Education:
${educationFormatted || 'None'}

Projects:
${projectsFormatted || 'None'}

Skills:
${skillsFromCategories || allSkills || 'None'}

Background/Narrative:
${narrativeText || 'None'}

Additional Instructions:
${variables.additionalInstructions || 'None'}`

  return (
    prompt +
    dataBlock +
    '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. Do NOT ask questions or include any text outside the JSON object.' +
    '\nUse ONLY the experience, education, projects, and skills provided above.' +
    '\nIf a field is missing, leave it empty/null but still return the full JSON object.' +
    '\nReturn the result as a JSON object with keys: personalInfo, professionalSummary, experience[], skills[], education[].'
  )
}

export function buildCoverLetterPrompt(
  payload: GenerateDocumentPayload,
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = [],
  jobMatch: JobMatch | null = null
): string {
  const prompts = promptsRepo.getPrompts()
  const childrenMap = buildChildrenMap(contentItems)

  // Get work items with brief summaries
  const workItems = contentItems.filter(isWorkItem)
  const workSummary = workItems
    .map((work) => {
      const highlights = (childrenMap.get(work.id) || [])
        .filter((child) => child.aiContext === 'highlight')
        .slice(0, 2)
        .map((h) => h.title)
        .filter(Boolean)
        .join(', ')

      const desc = work.description ? work.description.slice(0, 150) : ''
      return `${work.role} at ${work.title}${desc ? `: ${desc}` : ''}${highlights ? ` (Notable: ${highlights})` : ''}`
    })
    .join('\n')

  // Get narrative for personal touch
  const narrativeItems = contentItems.filter(isNarrativeItem)
  const narrativeText = narrativeItems
    .map((item) => item.description || '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 500)

  const allSkills = [...new Set(contentItems.flatMap((item) => item.skills || []))].join(', ')

  const variables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    userExperience: workSummary || 'No experience data available',
    userSkills: allSkills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.companyInfo || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || '',
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: jobMatch?.resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const prompt = replaceVariables(prompts.coverLetterGeneration, variables)

  const contextBlock = narrativeText
    ? `\n\nCandidate Background (use for personal touch):\n${narrativeText}`
    : ''

  return (
    prompt +
    contextBlock +
    '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. Do NOT ask questions, request clarification, or include any text outside the JSON object.' +
    '\nUse the experience and skills provided to craft a compelling cover letter.' +
    '\nReturn ONLY a JSON object with keys: greeting, openingParagraph, bodyParagraphs[], closingParagraph, signature.'
  )
}
