import type { ResumeContent } from '@shared/types'

/**
 * Content fitting service for single-page resume optimization.
 *
 * Single-column ATS layout:
 *   All content flows in one column — header, summary, experience,
 *   skills, projects, education — top to bottom.
 *
 * Letter page: 11in height - 1.2in total margins (0.6in × 2) = 9.8in usable (940.8px)
 * Dominant line height: bullet text 10.5px × 1.45 = 15.225px → 940.8 / 15.225 ≈ 62 raw lines.
 * With safety margin → 60 max.
 *
 * Margin value (0.6in top/bottom, 0.75in left/right) must stay in sync
 * with @page margin in html-ats-style.ts.
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
const AVG_LINES_PER_BULLET = 2
const AVG_LINES_PER_TECH = 1.5

/** Estimate how many rendered lines a text string occupies. */
function textToLines(text: string, charsPerLine: number): number {
  if (!text || text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

const LAYOUT = {
  HEADER_LINES: 4,             // Name + title + rule + contact row
  SUMMARY_MIN_LINES: 2,
  SECTION_TITLE_LINES: 2,      // Heading + bottom border + spacing

  EXP_HEADER_LINES: 2,         // Role title + company line
  EXP_SPACING: 1.5,            // Space between entries

  PROJECT_HEADER_LINES: 2,     // Project name + link line
  PROJECT_SPACING: 1.5,

  SKILL_CATEGORY_LINES: 1.5,   // "Category: item, item, item" on one line
  EDUCATION_ENTRY_LINES: 2,    // Degree + school

  MAX_LINES: 60,
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
      mainLines += textToLines(bullet, BULLET_CHARS_PER_LINE)
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
          mainLines += textToLines(h, BULLET_CHARS_PER_LINE)
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

  // Calculate overflow
  const overflow = mainLines - LAYOUT.MAX_LINES

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
    mainColumnLines: Math.round(mainLines),
    sidebarLines: 0,
    fits: overflow <= 0,
    overflow: Math.round(overflow),
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
    maxBulletsPerExperience: 6,
    maxSummaryWords: 50,
    maxSkillCategories: 5,
    maxProjects: 2,
    maxBulletsPerProject: 2
  }
}

/**
 * Quick check if content is likely to fit.
 */
export function willFitOnePage(content: ResumeContent): boolean {
  const expCount = content.experience?.length || 0
  const totalBullets = content.experience?.reduce((sum, e) => sum + (e.highlights?.length || 0), 0) || 0
  const summaryWords = (content.professionalSummary || '').split(/\s+/).length

  return expCount <= 5 && totalBullets <= 20 && summaryWords <= 75
}

/**
 * Column balance analysis — kept for backward compatibility.
 * In single-column layout, balance is about total content vs page height.
 */
export interface ColumnBalance {
  sidebarLines: number
  mainLines: number
  difference: number
  balanced: boolean
  suggestion: string
}

export function analyzeColumnBalance(content: ResumeContent): ColumnBalance {
  const estimate = estimateContentFit(content)

  let suggestion = ''
  if (estimate.overflow > 0) {
    suggestion = `Content overflows by ~${estimate.overflow} lines. Reduce bullets or experience entries.`
  } else if (estimate.overflow < -15) {
    const absD = Math.abs(estimate.overflow)
    const bulletsNeeded = Math.ceil(absD / AVG_LINES_PER_BULLET)
    suggestion = `Page has ~${absD} lines of empty space. Add ${bulletsNeeded} more bullet points.`
  }

  return {
    sidebarLines: 0,
    mainLines: estimate.mainColumnLines,
    difference: estimate.overflow,
    balanced: Math.abs(estimate.overflow) <= 10,
    suggestion
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
  // Reserve ~6 lines for education, rest for skills
  const availableForSkills = Math.max(0, remainingLines - 6 - LAYOUT.SECTION_TITLE_LINES)
  return Math.max(3, Math.min(6, Math.floor(availableForSkills / LAYOUT.SKILL_CATEGORY_LINES)))
}

/**
 * Get content guidance for AI prompt.
 */
export function getBalancedContentGuidance(experienceCount: number = 4): string {
  const recommendedSkillCats = getRecommendedSkillCategories(experienceCount, 3)

  return `CONTENT BUDGET GUIDANCE:
- Include ${experienceCount} experience entries (use all available if you have ${experienceCount} or fewer). Aim for 4-5 bullets per entry to fill the page; use up to 6 when fewer entries are available.
- Use ${recommendedSkillCats} skill categories with 3-5 items each
- Include 2-3 education entries
- Only include projects if they fill genuine skill gaps not covered by work experience. Prefer an empty projects section over irrelevant projects.
- All content is single-column — skills and education are in the main flow, not a sidebar.`
}
