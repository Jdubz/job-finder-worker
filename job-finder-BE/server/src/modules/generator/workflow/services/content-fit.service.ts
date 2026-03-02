import type { ResumeContent } from '@shared/types'

/**
 * Content fitting service for single-page resume optimization.
 *
 * Single-column ATS layout:
 *   All content flows in one column — header, summary, experience,
 *   skills, projects, education — top to bottom.
 *
 * Letter page: 11in height - 1.2in total margins (0.6in × 2) = 9.8in usable (940.8px)
 * Line unit: bullet text 10.5px × 1.35 line-height = 14.175px → 940.8 / 14.175 ≈ 66 raw lines.
 * Safety margin of 3 lines → 63 max.
 *
 * Constants are derived from actual CSS pixel heights in html-ats-style.ts,
 * converted to the 14.175px line unit. Keep in sync with @page margin and
 * element spacing there.
 */

export interface FitEstimate {
  mainColumnLines: number
  sidebarLines: number
  fits: boolean
  overflow: number // negative = room to spare, positive = overflow lines
  suggestions: string[]
}

// Characters per line at 11px Calibri in single-column layout (~7in / 672px content width)
// Body: 672px / 5.8px avg char width ≈ 116; bullets at 10.5px: (672-16) / 5.5 ≈ 119
const CHARS_PER_LINE = 110
const BULLET_CHARS_PER_LINE = 105

// Heuristic averages for functions that don't have actual text to measure
const AVG_LINES_PER_BULLET = 1.5
const AVG_LINES_PER_TECH = 1.5

/** Estimate how many rendered lines a text string occupies. */
function textToLines(text: string, charsPerLine: number): number {
  if (!text || text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

export const LAYOUT = {
  // Header: name(22px×1.35) + 2mb + title(13px×1.35) + 6mb + rule(2+5mb) + contact(10px×1.6 + 10mb) ≈ 88px
  HEADER_LINES: 6,
  SUMMARY_MIN_LINES: 2,
  // Section heading: 10mt + text(13px×1.35) + 2pb + 1.5border + 6mb ≈ 37px
  SECTION_TITLE_LINES: 2.5,

  // Experience: role(11.5px×1.35) + company(10.5px×1.35 + 2mb) + UL 2mt ≈ 34px
  EXP_HEADER_LINES: 2.5,
  EXP_SPACING: 1,              // exp-entry margin-bottom 12px ≈ 0.85 lines
  BULLET_OVERHEAD: 0.1,        // li margin-bottom 1px per bullet ≈ 0.07 lines

  PROJECT_HEADER_LINES: 2,     // Project name + link line
  PROJECT_SPACING: 0.5,        // project-entry margin-bottom 6px ≈ 0.42 lines

  SKILL_CATEGORY_LINES: 1.2,   // 10.5px text + 2px margin ≈ 16px
  // Education: degree(11px×1.35) + school(10.5px×1.35) + 4mb ≈ 33px
  EDUCATION_ENTRY_LINES: 2.5,

  MAX_LINES: 63,               // 66 raw - 3 safety for rounding / browser variance
}

export function estimateContentFit(content: ResumeContent): FitEstimate {
  const suggestions: string[] = []

  // All content in one column
  let mainLines = LAYOUT.HEADER_LINES

  // Summary
  const summaryText = content.professionalSummary || ''
  const summaryLines = Math.max(
    LAYOUT.SUMMARY_MIN_LINES,
    textToLines(summaryText, CHARS_PER_LINE)
  )
  mainLines += LAYOUT.SECTION_TITLE_LINES + summaryLines

  // Experience
  mainLines += LAYOUT.SECTION_TITLE_LINES
  for (const exp of content.experience || []) {
    mainLines += LAYOUT.EXP_HEADER_LINES
    for (const bullet of exp.highlights || []) {
      mainLines += textToLines(bullet, BULLET_CHARS_PER_LINE) + LAYOUT.BULLET_OVERHEAD
    }
    const techText = (exp.technologies || []).join(', ')
    if (techText) {
      mainLines += textToLines(techText, CHARS_PER_LINE)
    }
    mainLines += LAYOUT.EXP_SPACING
  }

  // Skills (in main column for single-column layout)
  const skillCategories = content.skills?.length || 0
  if (skillCategories > 0) {
    mainLines += LAYOUT.SECTION_TITLE_LINES
    mainLines += skillCategories * LAYOUT.SKILL_CATEGORY_LINES
  }

  // Projects
  const projectCount = content.projects?.length || 0
  if (projectCount > 0) {
    mainLines += LAYOUT.SECTION_TITLE_LINES
    for (const proj of content.projects || []) {
      mainLines += LAYOUT.PROJECT_HEADER_LINES
      const highlights = proj.highlights || []
      if (highlights.length > 0) {
        for (const h of highlights) {
          mainLines += textToLines(h, BULLET_CHARS_PER_LINE) + LAYOUT.BULLET_OVERHEAD
        }
      } else if (proj.description) {
        mainLines += textToLines(proj.description, BULLET_CHARS_PER_LINE)
      }
      const techText = (proj.technologies || []).join(', ')
      if (techText) {
        mainLines += textToLines(techText, CHARS_PER_LINE)
      }
      mainLines += LAYOUT.PROJECT_SPACING
    }
  }

  // Education
  const eduCount = content.education?.length || 0
  if (eduCount > 0) {
    mainLines += LAYOUT.SECTION_TITLE_LINES
    mainLines += eduCount * LAYOUT.EDUCATION_ENTRY_LINES
  }

  // Round up fractional lines conservatively before computing overflow
  const roundedMainLines = Math.ceil(mainLines)
  const overflow = roundedMainLines - LAYOUT.MAX_LINES

  // Suggestions
  if (overflow > 0) {
    const expCount = content.experience?.length || 0
    const totalBullets = content.experience?.reduce((sum, e) => sum + (e.highlights?.length || 0), 0) || 0
    const avgBullets = expCount > 0 ? totalBullets / expCount : 0

    if (expCount > 4) {
      suggestions.push(`Reduce experience entries from ${expCount} to 4`)
    } else if (avgBullets > 3) {
      suggestions.push(`Reduce bullets per experience from ~${avgBullets.toFixed(1)} to 3`)
    }
    if (summaryLines > 3) {
      suggestions.push(`Shorten summary to ~${CHARS_PER_LINE * 2} chars`)
    }
    if (skillCategories > 5) {
      suggestions.push(`Consolidate skill categories from ${skillCategories} to 4-5`)
    }
  }

  return {
    mainColumnLines: roundedMainLines,
    sidebarLines: 0,
    fits: overflow <= 0,
    overflow,
    suggestions
  }
}

/**
 * Generate content budget constraints for AI prompt.
 * Returns max counts that should fit on one page.
 */
export function getContentBudget(): {
  maxExperiences: number
  maxBulletsPerExperience: number
  maxSummaryWords: number
  maxSkillCategories: number
  maxProjects: number
  maxBulletsPerProject: number
} {
  return {
    maxExperiences: 4,
    maxBulletsPerExperience: 5,
    maxSummaryWords: 70,
    maxSkillCategories: 5,
    maxProjects: 2,
    maxBulletsPerProject: 2
  }
}

/**
 * Get recommended skill category count based on main column content.
 */
export function getRecommendedSkillCategories(experienceCount: number, avgBulletsPerExp: number): number {
  const mainLines = LAYOUT.HEADER_LINES +
    LAYOUT.SECTION_TITLE_LINES + 3 + // Summary ~3 lines
    LAYOUT.SECTION_TITLE_LINES +
    experienceCount * (LAYOUT.EXP_HEADER_LINES + avgBulletsPerExp * AVG_LINES_PER_BULLET + AVG_LINES_PER_TECH + LAYOUT.EXP_SPACING)

  const remainingLines = LAYOUT.MAX_LINES - mainLines
  // Reserve education section: title + ~2 entries
  const eduReserve = LAYOUT.SECTION_TITLE_LINES + 2 * LAYOUT.EDUCATION_ENTRY_LINES
  const availableForSkills = Math.max(0, remainingLines - eduReserve - LAYOUT.SECTION_TITLE_LINES)
  return Math.max(3, Math.min(6, Math.floor(availableForSkills / LAYOUT.SKILL_CATEGORY_LINES)))
}

/**
 * Get tiered bullet allocation guidance based on experience count.
 * More recent roles get more bullets; older roles get fewer.
 */
export function getTieredBulletGuidance(experienceCount: number): string {
  const tiers = [
    'Most recent role: 4-5 bullets',
    'Second role: 3-4 bullets',
    'Third role: 2-3 bullets',
    'Fourth+ role: 2 bullets'
  ]
  return tiers.slice(0, Math.min(experienceCount, tiers.length)).join('\n  - ')
}

/**
 * Get content guidance for AI prompt.
 */
export function getBalancedContentGuidance(experienceCount: number = 4): string {
  const recommendedSkillCats = getRecommendedSkillCategories(experienceCount, 3)

  return `CONTENT BUDGET GUIDANCE:
- Include ${experienceCount} experience entries (use all available if you have ${experienceCount} or fewer). Allocate bullets by recency:
  - ${getTieredBulletGuidance(experienceCount)}
- Use ${recommendedSkillCats} skill categories with 3-5 items each
- Summary: 2-4 sentences (50-70 words)
- Include 2-3 education entries
- Only include projects if they fill genuine skill gaps not covered by work experience. Prefer an empty projects section over irrelevant projects.
- All content is single-column — skills and education are in the main flow, not a sidebar.`
}
