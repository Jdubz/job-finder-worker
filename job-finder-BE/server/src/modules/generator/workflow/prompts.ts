import type { GenerateDocumentPayload } from './generator.workflow.service'
import type { PersonalInfo } from '@shared/types'

export function buildResumePrompt(payload: GenerateDocumentPayload, personalInfo: PersonalInfo): string {
  return [
    'You are an AI resume assistant.',
    `Generate a JSON resume for ${personalInfo.name ?? 'the candidate'} applying to ${payload.job.company} as ${
      payload.job.role
    }.`,
    'Return an object with keys: personalInfo, professionalSummary, experience[].',
    'Ensure experience entries highlight impact and align with the job description.',
    payload.job.jobDescriptionText ? `Job Description:\n${payload.job.jobDescriptionText}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildCoverLetterPrompt(payload: GenerateDocumentPayload, personalInfo: PersonalInfo): string {
  return [
    'You are an AI career coach.',
    `Draft a JSON cover letter for ${personalInfo.name ?? 'the candidate'} applying to ${payload.job.role} at ${
      payload.job.company
    }.`,
    'Return {"greeting","openingParagraph","bodyParagraphs":[...],"closingParagraph","signature"}.',
    payload.job.jobDescriptionText ? `Job Description:\n${payload.job.jobDescriptionText}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}
