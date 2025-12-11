import { describe, it, expect } from 'vitest'
import {
  validateResumeContent,
  validateCoverLetterContent
} from '../ai-output-schema'

describe('AI Output Schema Validation', () => {
  describe('validateResumeContent', () => {
    it('validates well-formed resume JSON', () => {
      const validResume = JSON.stringify({
        personalInfo: {
          name: 'John Doe',
          title: 'Software Engineer',
          summary: 'Experienced developer',
          contact: {
            email: 'john@example.com',
            location: 'San Francisco'
          }
        },
        professionalSummary: 'A skilled software engineer with 5 years experience.',
        experience: [
          {
            company: 'Tech Corp',
            role: 'Senior Developer',
            location: 'SF',
            startDate: '2020-01',
            endDate: null,
            highlights: ['Built features', 'Led team'],
            technologies: ['TypeScript', 'React']
          }
        ],
        skills: [
          { category: 'Languages', items: ['TypeScript', 'Python'] }
        ],
        education: [
          { institution: 'MIT', degree: 'BS Computer Science' }
        ]
      })

      const result = validateResumeContent(validResume)
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.recovered).toBeFalsy()
    })

    it('extracts JSON from markdown code block', () => {
      const wrappedJson = '```json\n{"personalInfo": {"title": "Dev"}, "professionalSummary": "Test", "experience": []}\n```'

      const result = validateResumeContent(wrappedJson)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.recoveryActions).toContain('Extracted JSON from markdown code block or surrounding text')
    })

    it('extracts JSON from surrounding text', () => {
      const wrappedJson = 'Here is the resume:\n{"personalInfo": {"title": "Dev"}, "professionalSummary": "Test", "experience": []}\nHope this helps!'

      const result = validateResumeContent(wrappedJson)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
    })

    it('normalizes skills from string array to category format', () => {
      const resumeWithFlatSkills = JSON.stringify({
        professionalSummary: 'Test',
        experience: [],
        skills: ['TypeScript', 'React', 'Node.js']
      })

      const result = validateResumeContent(resumeWithFlatSkills)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.recoveryActions).toContain('Normalized skills format')
      expect(result.data?.skills).toEqual([
        { category: 'Skills', items: ['TypeScript', 'React', 'Node.js'] }
      ])
    })

    it('normalizes experience with alternative field names', () => {
      const resumeWithAltFields = JSON.stringify({
        professionalSummary: 'Test',
        experience: [
          {
            companyName: 'Acme Inc',  // alternative for 'company'
            title: 'Engineer',         // alternative for 'role'
            from: '2020-01',           // alternative for 'startDate'
            to: '2022-01',             // alternative for 'endDate'
            bullets: ['Did stuff']     // alternative for 'highlights'
          }
        ]
      })

      const result = validateResumeContent(resumeWithAltFields)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.data?.experience[0].company).toBe('Acme Inc')
      expect(result.data?.experience[0].role).toBe('Engineer')
      expect(result.data?.experience[0].startDate).toBe('2020-01')
      expect(result.data?.experience[0].endDate).toBe('2022-01')
      expect(result.data?.experience[0].highlights).toEqual(['Did stuff'])
    })

    it('maps "summary" to "professionalSummary"', () => {
      const resumeWithSummary = JSON.stringify({
        summary: 'This is my professional summary',
        experience: []
      })

      const result = validateResumeContent(resumeWithSummary)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.recoveryActions).toContain('Mapped "summary" to "professionalSummary"')
    })

    it('provides defaults for missing fields', () => {
      const minimalResume = JSON.stringify({
        experience: []
      })

      const result = validateResumeContent(minimalResume)
      expect(result.success).toBe(true)
      expect(result.data?.personalInfo).toBeDefined()
      expect(result.data?.professionalSummary).toBe('')
      expect(result.data?.skills).toEqual([])
      expect(result.data?.education).toEqual([])
    })

    it('returns error for completely invalid JSON', () => {
      const invalidJson = 'This is not JSON at all!'

      const result = validateResumeContent(invalidJson)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('JSON parse error')
    })

    it('handles endDate "Present" as null', () => {
      const resumeWithPresent = JSON.stringify({
        professionalSummary: 'Test',
        experience: [
          {
            company: 'Current Job',
            role: 'Developer',
            startDate: '2023-01',
            endDate: 'Present',
            highlights: []
          }
        ]
      })

      const result = validateResumeContent(resumeWithPresent)
      expect(result.success).toBe(true)
      expect(result.data?.experience[0].endDate).toBeNull()
    })
  })

  describe('validateCoverLetterContent', () => {
    it('validates well-formed cover letter JSON', () => {
      const validCoverLetter = JSON.stringify({
        greeting: 'Dear Hiring Manager,',
        openingParagraph: 'I am writing to apply for...',
        bodyParagraphs: [
          'In my current role...',
          'I have experience with...'
        ],
        closingParagraph: 'Thank you for your consideration.',
        signature: 'Best regards,'
      })

      const result = validateCoverLetterContent(validCoverLetter)
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.recovered).toBeFalsy()
    })

    it('extracts JSON from markdown code block', () => {
      const wrappedJson = '```json\n{"greeting": "Hello,", "openingParagraph": "Test", "bodyParagraphs": [], "closingParagraph": "Thanks", "signature": "Best,"}\n```'

      const result = validateCoverLetterContent(wrappedJson)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
    })

    it('normalizes bodyParagraphs from string to array', () => {
      const coverLetterWithString = JSON.stringify({
        greeting: 'Hello,',
        openingParagraph: 'Opening',
        bodyParagraphs: 'This is a single paragraph that should become an array',
        closingParagraph: 'Closing',
        signature: 'Best,'
      })

      const result = validateCoverLetterContent(coverLetterWithString)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.recoveryActions).toContain('Normalized bodyParagraphs format')
      expect(Array.isArray(result.data?.bodyParagraphs)).toBe(true)
      expect(result.data?.bodyParagraphs[0]).toBe('This is a single paragraph that should become an array')
    })

    it('handles missing bodyParagraphs', () => {
      const coverLetterMissingBody = JSON.stringify({
        greeting: 'Hello,',
        openingParagraph: 'Opening',
        closingParagraph: 'Closing',
        signature: 'Best,'
      })

      const result = validateCoverLetterContent(coverLetterMissingBody)
      expect(result.success).toBe(true)
      expect(result.data?.bodyParagraphs).toEqual([])
    })

    it('extracts bodyParagraphs from "body" field', () => {
      const coverLetterWithBody = JSON.stringify({
        greeting: 'Hello,',
        openingParagraph: 'Opening',
        body: ['First paragraph', 'Second paragraph'],
        closingParagraph: 'Closing',
        signature: 'Best,'
      })

      const result = validateCoverLetterContent(coverLetterWithBody)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.recoveryActions).toContain('Extracted bodyParagraphs from "body" field')
      expect(result.data?.bodyParagraphs).toEqual(['First paragraph', 'Second paragraph'])
    })

    it('maps alternative field names', () => {
      const coverLetterWithAltFields = JSON.stringify({
        greeting: 'Hello,',
        opening: 'Opening paragraph',      // alternative for 'openingParagraph'
        bodyParagraphs: ['Body'],
        closing: 'Closing paragraph',      // alternative for 'closingParagraph'
        signOff: 'Cheers,'                 // alternative for 'signature'
      })

      const result = validateCoverLetterContent(coverLetterWithAltFields)
      expect(result.success).toBe(true)
      expect(result.recovered).toBe(true)
      expect(result.data?.openingParagraph).toBe('Opening paragraph')
      expect(result.data?.closingParagraph).toBe('Closing paragraph')
      expect(result.data?.signature).toBe('Cheers,')
    })

    it('provides defaults for missing fields', () => {
      const minimalCoverLetter = JSON.stringify({})

      const result = validateCoverLetterContent(minimalCoverLetter)
      expect(result.success).toBe(true)
      expect(result.data?.greeting).toBe('Hello,')
      expect(result.data?.openingParagraph).toBe('')
      expect(result.data?.bodyParagraphs).toEqual([])
      expect(result.data?.closingParagraph).toBe('')
      expect(result.data?.signature).toBe('Best,')
    })

    it('filters empty strings from bodyParagraphs', () => {
      const coverLetterWithEmptyParagraphs = JSON.stringify({
        greeting: 'Hello,',
        openingParagraph: 'Opening',
        bodyParagraphs: ['Valid paragraph', '', '   ', 'Another valid'],
        closingParagraph: 'Closing',
        signature: 'Best,'
      })

      const result = validateCoverLetterContent(coverLetterWithEmptyParagraphs)
      expect(result.success).toBe(true)
      expect(result.data?.bodyParagraphs).toEqual(['Valid paragraph', 'Another valid'])
    })

    it('handles bodyParagraphs with object items containing text', () => {
      const coverLetterWithObjectParagraphs = JSON.stringify({
        greeting: 'Hello,',
        openingParagraph: 'Opening',
        bodyParagraphs: [
          { text: 'First paragraph text' },
          { content: 'Second paragraph content' },
          'Third as plain string'
        ],
        closingParagraph: 'Closing',
        signature: 'Best,'
      })

      const result = validateCoverLetterContent(coverLetterWithObjectParagraphs)
      expect(result.success).toBe(true)
      expect(result.data?.bodyParagraphs).toContain('First paragraph text')
      expect(result.data?.bodyParagraphs).toContain('Second paragraph content')
      expect(result.data?.bodyParagraphs).toContain('Third as plain string')
    })

    it('returns error for completely invalid JSON', () => {
      const invalidJson = 'Not valid JSON!'

      const result = validateCoverLetterContent(invalidJson)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.[0]).toContain('JSON parse error')
    })
  })
})
