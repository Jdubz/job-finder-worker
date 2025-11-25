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

export function buildResumePrompt(
  payload: GenerateDocumentPayload,
  personalInfo: PersonalInfo,
  contentItems: ContentItem[] = [],
  jobMatch: JobMatch | null = null
): string {
  const prompts = promptsRepo.getPrompts()

  // Extract experience and skills from content items (preserve structure so the model has enough detail)
  const experience = contentItems
    .filter((item) => item.role && item.title)
    .map((item) => {
      const bullets = (item.description || '')
        .split(/\r?\n/)
        .filter((line) => line.trim().length)
        .map((line) => line.replace(/^[-•]\s*/, '').trim())
        .map((line) => `    - ${line}`)
        .join('\n')

      const skills = item.skills ?? []

      return [
        `- Role: ${item.role}`,
        `  Company: ${item.title}${item.location ? ` (${item.location})` : ''}`,
        `  Dates: ${item.startDate || 'unspecified'} - ${item.endDate || 'Present'}`,
        bullets ? `  Highlights:\n${bullets}` : null,
        skills && skills.length ? `  Skills: ${skills.join(', ')}` : null,
        item.website ? `  Website: ${item.website}` : null
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const skills = [...new Set(contentItems.flatMap(item => item.skills || []))].join(', ')

  const variables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    userExperience: experience || 'No experience data available',
    userSkills: skills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.companyInfo || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || '',
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: jobMatch?.resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const prompt = replaceVariables(prompts.resumeGeneration, variables)

  const dataBlock = `\n\nINPUT DATA (authoritative — use exactly this):\nCandidate: ${variables.candidateName}\nTarget Role: ${variables.jobTitle}\nCompany: ${variables.companyName}\nJob Description:\n${variables.jobDescription}\n\nExperience:\n${experience || 'None'}\n\nSkills:\n${skills || 'None'}\n\nAdditional Instructions:\n${variables.additionalInstructions || 'None'}`

  // Append JSON format instruction for structured output and forbid follow-up questions
  return (
    prompt +
    dataBlock +
    '\n\nUse ONLY the experience and skills provided above. Do NOT ask for more information.' +
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

  // Extract experience and skills from content items
  const experience = contentItems
    .filter(item => item.role && item.title)
    .map(item => `${item.role} at ${item.title}${item.description ? ': ' + item.description : ''}`)
    .join('\n')

  const skills = [...new Set(contentItems.flatMap(item => item.skills || []))].join(', ')

  const variables: PromptVariables = {
    candidateName: personalInfo.name ?? 'the candidate',
    jobTitle: payload.job.role,
    companyName: payload.job.company,
    jobDescription: payload.job.jobDescriptionText || 'No job description provided',
    userExperience: experience || 'No experience data available',
    userSkills: skills || 'No skills data available',
    additionalInstructions: payload.preferences?.emphasize?.join(', ') || '',
    companyInfo: jobMatch?.companyInfo || '',
    matchedSkills: jobMatch?.matchedSkills?.join(', ') || '',
    keyStrengths: jobMatch?.keyStrengths?.join(', ') || '',
    atsKeywords: jobMatch?.resumeIntakeData?.atsKeywords?.join(', ') || ''
  }

  const prompt = replaceVariables(prompts.coverLetterGeneration, variables)

  // Append JSON format instruction for structured output
  return prompt + '\n\nReturn the result as a JSON object with keys: greeting, openingParagraph, bodyParagraphs[], closingParagraph, signature.'
}
