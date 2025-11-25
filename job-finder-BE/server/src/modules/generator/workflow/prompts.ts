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

  const prompt = replaceVariables(prompts.resumeGeneration, variables)

  // Append JSON format instruction for structured output
  return prompt + '\n\nReturn the result as a JSON object with keys: personalInfo, professionalSummary, experience[], skills[], education[].'
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
