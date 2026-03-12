import type { ResumeContent } from '@shared/types'

/**
 * Content fitting service for single-page resume optimization.
 *
 * Single-column ATS layout:
 *   All content flows in one column — header, summary, experience,
 *   skills, projects, education — top to bottom.
 *
 * Letter page: 11in height - 1.0in total margins (0.6in top + 0.4in bottom) = 10.0in usable (960px)
 * Line unit: bullet text 10.5px × 1.35 line-height = 14.175px → 960 / 14.175 ≈ 67.7 raw lines.
 * Safety margin of ~0.7 lines → 67 max. The estimator itself trends conservative,
 * so minimal additional safety is needed.
 *
 * Constants are derived from actual CSS pixel heights in html-ats-style.ts,
 * converted to the 14.175px line unit. Keep in sync with @page margin and
 * element spacing there.
 *
 * CSS margin collapse: adjacent block-level margins collapse to max(prev_mb, next_mt).
 * The algorithm tracks each section's trailing margin and corrects for this
 * at section boundaries to avoid double-counting.
 */

export interface FitEstimate {
  mainColumnLines: number
  sidebarLines: number
  fits: boolean
  overflow: number // negative = room to spare, positive = overflow lines
  suggestions: string[]
}

// Characters per line at 11px Calibri in single-column layout (~7in / 672px content width)
// Calibrated via Playwright rendering: body text ~122 cpl, bullets ~126 cpl at 10.5px.
const CHARS_PER_LINE = 120
const BULLET_CHARS_PER_LINE = 126

// Skill rows: 10.5px base but category label is bold (~10-15% wider).
// Effective chars ≈ 100 to account for bold label + comma-separated items.
const SKILL_CHARS_PER_LINE = 100

// Heuristic averages for functions that don't have actual text to measure
const AVG_LINES_PER_BULLET = 1.5

// Summary CSS uses line-height: 1.4 but the line unit is based on 1.35.
// Each summary line costs 15.4px / 14.175px ≈ 1.09 line-units.
const SUMMARY_LINE_SCALE = 1.09

// Section heading margins in line units, used for CSS margin collapse corrections.
const SECTION_HEADING_MT = 0.71  // margin-top: 10px / 14.175px
const SECTION_HEADING_MB = 0.42  // margin-bottom: 6px / 14.175px

/** Estimate how many rendered lines a text string occupies. */
function textToLines(text: string, charsPerLine: number): number {
  if (!text || text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

export const LAYOUT = {
  // Header: name + title + rule + contact. Calibrated: ~88px = 6.21 lines
  HEADER_LINES: 6.25,
  // Contact-row margin-bottom (10px / 14.175px) included within HEADER_LINES
  HEADER_TRAILING_MARGIN: 0.71,
  SUMMARY_MIN_LINES: 1,
  // Section heading: 10mt + text(13px×1.35) + 2pb + 1.5border + 6mb ≈ 37px → 2.6 lines
  SECTION_TITLE_LINES: 2.6,

  // Experience: role(15.5px) + company(14.2px) + gap(2px) = 31.7px → 2.24 lines
  EXP_HEADER_LINES: 2.25,
  EXP_SPACING: 0.85,            // exp-entry margin-bottom 12px / 14.175px ≈ 0.85 lines
  EXP_DESC_OVERHEAD: 0.14,      // exp-desc margin 2px / 14.175px (margin-collapse with company)
  BULLET_OVERHEAD: 0.07,        // li margin-bottom 1px per bullet = 0.071 lines

  // Project name (+ optional inline link): 14.85px + 2px gap = 16.85px → 1.19 lines
  PROJECT_HEADER_LINES: 1.2,
  PROJECT_SPACING: 0.5,        // project-entry margin-bottom 6px ≈ 0.42 lines

  SKILL_CATEGORY_OVERHEAD: 0.15, // 2px margin-bottom per skill-row ≈ 0.14 lines
  // Education: degree + school = ~29px → 2.05 lines
  EDUCATION_ENTRY_LINES: 2.1,
  EDUCATION_SPACING: 0.3,      // 4px margin-bottom per edu-entry ≈ 0.28 lines
  EDU_NOTES_OVERHEAD: 0.07,    // .edu-notes margin-top 1px / 14.175px

  MAX_LINES: 67,               // ~67.7 raw - 0.7 safety for browser variance
}

/**
 * Subtract CSS margin collapse overlap at section boundaries.
 * When a section's trailing margin (already counted in mainLines) is followed
 * by a section heading (whose margin-top is in SECTION_TITLE_LINES), CSS
 * collapses them to max(prev_mb, heading_mt). We subtract min(prev_mb, heading_mt).
 */
function marginCollapseAdj(prevTrailingMargin: number): number {
  return -Math.min(prevTrailingMargin, SECTION_HEADING_MT)
}

export function estimateContentFit(content: ResumeContent): FitEstimate {
  const suggestions: string[] = []

  // Track the trailing margin of the previous section (in line units) that was
  // already counted in mainLines. Used for CSS margin collapse correction
  // before each section heading.
  let mainLines = LAYOUT.HEADER_LINES
  let prevMargin = LAYOUT.HEADER_TRAILING_MARGIN

  // Summary — heading margin collapses with header's contact-row margin-bottom
  mainLines += marginCollapseAdj(prevMargin)
  const summaryText = content.professionalSummary || ''
  const rawSummaryLines = Math.max(
    LAYOUT.SUMMARY_MIN_LINES,
    textToLines(summaryText, CHARS_PER_LINE)
  )
  const summaryLines = rawSummaryLines * SUMMARY_LINE_SCALE
  const summaryTrailingMargin = 2 / 14.175 // summary .summary margin-bottom: 2px
  mainLines += LAYOUT.SECTION_TITLE_LINES + summaryLines + summaryTrailingMargin
  prevMargin = summaryTrailingMargin

  // Experience
  mainLines += marginCollapseAdj(prevMargin)
  mainLines += LAYOUT.SECTION_TITLE_LINES
  for (const exp of content.experience || []) {
    mainLines += LAYOUT.EXP_HEADER_LINES
    if (exp.description) {
      mainLines += textToLines(exp.description, CHARS_PER_LINE) + LAYOUT.EXP_DESC_OVERHEAD
    }
    for (const bullet of exp.highlights || []) {
      mainLines += textToLines(bullet, BULLET_CHARS_PER_LINE) + LAYOUT.BULLET_OVERHEAD
    }
    mainLines += LAYOUT.EXP_SPACING
  }
  // When experience has entries, trailing margin is the last entry's EXP_SPACING.
  // When empty, the section heading still renders — its margin-bottom is the trailing margin.
  prevMargin = (content.experience?.length ?? 0) > 0 ? LAYOUT.EXP_SPACING : SECTION_HEADING_MB

  // Skills (in main column for single-column layout)
  const skillCategories = content.skills?.length || 0
  if (skillCategories > 0) {
    mainLines += marginCollapseAdj(prevMargin)
    mainLines += LAYOUT.SECTION_TITLE_LINES
    for (const skill of content.skills!) {
      const rowText = `${skill.category}: ${skill.items.join(', ')}`
      mainLines += textToLines(rowText, SKILL_CHARS_PER_LINE) + LAYOUT.SKILL_CATEGORY_OVERHEAD
    }
    prevMargin = LAYOUT.SKILL_CATEGORY_OVERHEAD
  }

  // Projects
  const projectCount = content.projects?.length || 0
  if (projectCount > 0) {
    mainLines += marginCollapseAdj(prevMargin)
    mainLines += LAYOUT.SECTION_TITLE_LINES
    for (const proj of content.projects || []) {
      mainLines += LAYOUT.PROJECT_HEADER_LINES
      const highlights = proj.highlights || []
      if (highlights.length > 0) {
        if (proj.description) {
          mainLines += textToLines(proj.description, CHARS_PER_LINE)
        }
        for (const h of highlights) {
          mainLines += textToLines(h, BULLET_CHARS_PER_LINE) + LAYOUT.BULLET_OVERHEAD
        }
      } else if (proj.description) {
        mainLines += textToLines(proj.description, BULLET_CHARS_PER_LINE)
      }
      mainLines += LAYOUT.PROJECT_SPACING
    }
    prevMargin = LAYOUT.PROJECT_SPACING
  }

  // Education
  const eduCount = content.education?.length || 0
  if (eduCount > 0) {
    mainLines += marginCollapseAdj(prevMargin)
    mainLines += LAYOUT.SECTION_TITLE_LINES
    for (const edu of content.education!) {
      mainLines += LAYOUT.EDUCATION_ENTRY_LINES
      // edu-notes: when degree contains "in" and field exists, field renders as extra notes line
      if (edu.field && edu.degree?.includes(' in ')) {
        mainLines += textToLines(edu.field, CHARS_PER_LINE) + LAYOUT.EDU_NOTES_OVERHEAD
      }
      mainLines += LAYOUT.EDUCATION_SPACING
    }
    prevMargin = LAYOUT.EDUCATION_SPACING
  }

  // Trim trailing margin of the last section — in print CSS, bottom margin at
  // the page boundary doesn't force a page break.
  mainLines -= prevMargin

  const roundedMainLines = Math.round(mainLines)
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
  // Average skill row: ~1.15 lines text + 0.15 overhead = ~1.3 lines
  const AVG_SKILL_CATEGORY_LINES = 1.3

  const mainLines = LAYOUT.HEADER_LINES +
    LAYOUT.SECTION_TITLE_LINES + 3 * SUMMARY_LINE_SCALE + // Summary ~3 lines (scaled)
    LAYOUT.SECTION_TITLE_LINES +
    experienceCount * (LAYOUT.EXP_HEADER_LINES + avgBulletsPerExp * AVG_LINES_PER_BULLET + LAYOUT.EXP_SPACING)

  const remainingLines = LAYOUT.MAX_LINES - mainLines
  // Reserve education section: title + ~2 entries
  const eduReserve = LAYOUT.SECTION_TITLE_LINES + 2 * (LAYOUT.EDUCATION_ENTRY_LINES + LAYOUT.EDUCATION_SPACING)
  const availableForSkills = Math.max(0, remainingLines - eduReserve - LAYOUT.SECTION_TITLE_LINES)
  return Math.max(3, Math.min(6, Math.floor(availableForSkills / AVG_SKILL_CATEGORY_LINES)))
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
