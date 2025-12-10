import { Router } from 'express'
import { asyncHandler } from '../utils/async-handler'
import { success } from '../utils/api-response'
import { ConfigRepository } from '../modules/config/config.repository'
import { ContentItemRepository } from '../modules/content-items/content-item.repository'
import type { PersonalInfo, EEOInfo, ContentItem } from '@shared/types'
import { logger } from '../logger'

interface ApplicatorProfileResponse {
  profileText: string
}

/**
 * Format date range for work history
 */
function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate) return ''
  const end = endDate || 'Present'
  return `${startDate} - ${end}`
}

/**
 * Format EEO information in a compact, readable format
 */
function formatEEOInfo(eeo: EEOInfo | undefined): string {
  if (!eeo) return ''

  const parts: string[] = []

  if (eeo.gender && eeo.gender !== 'decline_to_identify') {
    parts.push(`Gender: ${eeo.gender}`)
  }
  if (eeo.race && eeo.race !== 'decline_to_identify') {
    const raceLabel = eeo.race.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    parts.push(`Race: ${raceLabel}`)
  }
  if (eeo.hispanicLatino && eeo.hispanicLatino !== 'decline_to_identify') {
    parts.push(`Hispanic/Latino: ${eeo.hispanicLatino}`)
  }
  if (eeo.veteranStatus && eeo.veteranStatus !== 'decline_to_identify') {
    const vetLabel = eeo.veteranStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    parts.push(`Veteran Status: ${vetLabel}`)
  }
  if (eeo.disabilityStatus && eeo.disabilityStatus !== 'decline_to_identify') {
    parts.push(`Disability Status: ${eeo.disabilityStatus}`)
  }

  return parts.length > 0 ? parts.join(', ') : ''
}

/**
 * Build hierarchical work history with roles and highlights
 */
function buildWorkHistory(items: ContentItem[]): string {
  // Build tree structure
  const itemMap = new Map<string, ContentItem>()
  const children = new Map<string, ContentItem[]>()

  items.forEach(item => {
    itemMap.set(item.id, item)
    if (item.parentId) {
      const siblings = children.get(item.parentId) || []
      siblings.push(item)
      children.set(item.parentId, siblings)
    }
  })

  // Get top-level work items (companies)
  const workItems = items
    .filter(item => !item.parentId && item.aiContext === 'work')
    .sort((a, b) => {
      // Sort by start date descending (most recent first)
      const dateA = a.startDate || ''
      const dateB = b.startDate || ''
      return dateB.localeCompare(dateA)
    })

  const sections: string[] = []

  for (const work of workItems) {
    const lines: string[] = []

    // Company header
    const company = work.title || 'Company'
    const role = work.role || ''
    const dates = formatDateRange(work.startDate, work.endDate)
    const location = work.location || ''

    lines.push(`## ${company}${role ? ` - ${role}` : ''}`)
    if (dates) lines.push(dates)
    if (location) lines.push(location)

    // Description
    if (work.description) {
      lines.push('')
      lines.push(work.description)
    }

    // Skills
    if (work.skills && work.skills.length > 0) {
      lines.push('')
      lines.push(`Skills: ${work.skills.join(', ')}`)
    }

    // Highlights (child items)
    const highlights = (children.get(work.id) || [])
      .filter(item => item.aiContext === 'highlight')
      .sort((a, b) => (a.order || 0) - (b.order || 0))

    if (highlights.length > 0) {
      lines.push('')
      lines.push('Highlights:')
      highlights.forEach(highlight => {
        if (highlight.description) {
          lines.push(`- ${highlight.description}`)
        }
      })
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * Build education section
 */
function buildEducation(items: ContentItem[]): string {
  const educationItems = items
    .filter(item => !item.parentId && item.aiContext === 'education')
    .sort((a, b) => {
      const dateA = a.startDate || ''
      const dateB = b.startDate || ''
      return dateB.localeCompare(dateA)
    })

  const sections: string[] = []

  for (const edu of educationItems) {
    const lines: string[] = []
    const institution = edu.title || 'Institution'
    const degree = edu.role || ''
    const dates = formatDateRange(edu.startDate, edu.endDate)

    lines.push(`${institution}${degree ? ` - ${degree}` : ''}`)
    if (dates) lines.push(dates)
    if (edu.description) lines.push(edu.description)

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * Aggregate all skills from content items
 */
function aggregateSkills(items: ContentItem[]): string {
  const allSkills = new Set<string>()

  items.forEach(item => {
    if (item.skills && item.skills.length > 0) {
      item.skills.forEach(skill => allSkills.add(skill))
    }
  })

  return Array.from(allSkills).sort().join(', ')
}

export function buildApplicatorRouter() {
  const router = Router()
  const configRepo = new ConfigRepository()
  const contentRepo = new ContentItemRepository()

  /**
   * GET /api/applicator/profile
   *
   * Returns complete user profile data formatted as plain text optimized for AI prompt injection.
   * This endpoint reduces token usage by pre-formatting data instead of sending raw JSON.
   *
   * Response includes:
   * - Personal contact information
   * - EEO demographic data (if provided)
   * - Complete work history with highlights
   * - Education history
   * - Aggregated skills summary
   *
   * Authentication: Required (session or dev token)
   * Rate Limiting: None (internal tool usage only)
   */
  router.get(
    '/profile',
    asyncHandler(async (_req, res) => {
      logger.info('Fetching applicator profile')

      // Fetch personal info from config
      const personalInfoConfig = configRepo.get<PersonalInfo>('personal-info')
      const personalInfo = personalInfoConfig?.payload

      if (!personalInfo) {
        logger.warn('Personal info not configured')
      }

      // Fetch all content items for work history, education, skills
      const contentItems = contentRepo.list()

      // Build formatted profile text
      const sections: string[] = []

      // Personal Information Section
      if (personalInfo) {
        const personalLines: string[] = ['# Personal Information']

        if (personalInfo.name) personalLines.push(`Name: ${personalInfo.name}`)
        if (personalInfo.email) personalLines.push(`Email: ${personalInfo.email}`)
        if (personalInfo.phone) personalLines.push(`Phone: ${personalInfo.phone}`)
        if (personalInfo.location) personalLines.push(`Location: ${personalInfo.location}`)
        if (personalInfo.website) personalLines.push(`Website: ${personalInfo.website}`)
        if (personalInfo.github) personalLines.push(`GitHub: ${personalInfo.github}`)
        if (personalInfo.linkedin) personalLines.push(`LinkedIn: ${personalInfo.linkedin}`)
        if (personalInfo.summary) {
          personalLines.push('')
          personalLines.push('Summary:')
          personalLines.push(personalInfo.summary)
        }

        sections.push(personalLines.join('\n'))

        // EEO Information (optional, separate section)
        const eeoText = formatEEOInfo(personalInfo.eeo)
        if (eeoText) {
          sections.push(`# EEO Information\n${eeoText}`)
        }
      }

      // Work Experience Section
      const workHistory = buildWorkHistory(contentItems)
      if (workHistory) {
        sections.push(`# Work Experience\n\n${workHistory}`)
      }

      // Education Section
      const education = buildEducation(contentItems)
      if (education) {
        sections.push(`# Education\n\n${education}`)
      }

      // Skills Summary Section
      const skills = aggregateSkills(contentItems)
      if (skills) {
        sections.push(`# Skills\n${skills}`)
      }

      // Combine all sections
      const profileText = sections.join('\n\n---\n\n')

      const response: ApplicatorProfileResponse = {
        profileText
      }

      logger.info(
        {
          textLength: profileText.length,
          sectionCount: sections.length,
          itemCount: contentItems.length
        },
        'Generated applicator profile'
      )

      res.json(success(response))
    })
  )

  return router
}
