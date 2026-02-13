import type { ResumeContent } from '@shared/types'

/**
 * Content fitting service for single-page resume optimization.
 *
 * Two-column layout (updated):
 * - Left sidebar (2in / ~25%): Avatar, Contact, Skills, Education
 * - Right main area (~5.5in / 75%): Name/Title header, Summary, Experience
 *
 * Letter page: 11in height - 1.0in total margins (0.5in × 2) = 10.0in usable
 * Main column at 10px font with 1.45 line-height ≈ 66 lines raw,
 * minus padding (20px top + 20px bottom ≈ 3 lines) = ~63 lines.
 * Use 55 as conservative max to account for section gaps, footer, etc.
 *
 * Margin value (0.5in) must stay in sync with:
 *   - DEFAULT_MARGIN in html-pdf.service.ts
 *   - @page margin and .page height in html-style.ts
 */

export interface FitEstimate {
  mainColumnLines: number
  sidebarLines: number
  fits: boolean
  overflow: number // negative = room to spare, positive = overflow lines
  suggestions: string[]
}

// Height constants (in approximate line units at 10px font)
const LAYOUT = {
  // Main column
  HEADER_LINES: 4,            // Name + title + border spacing
  SUMMARY_CHARS_PER_LINE: 75, // ~75 chars per line in narrower main column
  SUMMARY_MIN_LINES: 2,
  SECTION_TITLE_LINES: 2,     // Section title + spacing

  // Experience
  EXP_HEADER_LINES: 2,        // Role title + company line
  EXP_BULLET_LINES: 1.3,      // Each bullet ~1.3 lines avg (wrapped)
  EXP_TECH_LINES: 1,          // Technologies line
  EXP_SPACING: 1.5,           // Space between entries

  // Projects
  PROJECT_HEADER_LINES: 2,    // Project name + link line
  PROJECT_BULLET_LINES: 1.3,  // Each highlight ~1.3 lines avg
  PROJECT_TECH_LINES: 1,      // Technologies line
  PROJECT_SPACING: 1.5,       // Space between entries

  // Sidebar
  SIDEBAR_HEADER_LINES: 8,    // Avatar + spacing
  CONTACT_ITEM_LINES: 1.5,    // Each contact item
  SKILL_CATEGORY_LINES: 3,    // Label + tags (more wrapped in narrow sidebar)
  EDUCATION_ENTRY_LINES: 2.5, // Degree + school + date
  SIDEBAR_SECTION_SPACING: 2, // Space between sidebar sections

  // Page limits (conservative — accounts for 0.5in margins, padding, footer)
  MAIN_COLUMN_MAX_LINES: 55,
  SIDEBAR_MAX_LINES: 55,
}

export function estimateContentFit(content: ResumeContent): FitEstimate {
  const suggestions: string[] = []

  // Main column: Header + Summary + Experience
  let mainLines = LAYOUT.HEADER_LINES

  // Summary section
  const summaryChars = (content.professionalSummary || '').length
  const summaryLines = Math.max(
    LAYOUT.SUMMARY_MIN_LINES,
    Math.ceil(summaryChars / LAYOUT.SUMMARY_CHARS_PER_LINE)
  )
  mainLines += LAYOUT.SECTION_TITLE_LINES + summaryLines

  // Experience section
  mainLines += LAYOUT.SECTION_TITLE_LINES
  for (const exp of content.experience || []) {
    mainLines += LAYOUT.EXP_HEADER_LINES
    const bulletCount = exp.highlights?.length || 0
    mainLines += bulletCount * LAYOUT.EXP_BULLET_LINES
    if ((exp as any).technologies?.length) {
      mainLines += LAYOUT.EXP_TECH_LINES
    }
    mainLines += LAYOUT.EXP_SPACING
  }

  // Projects section (optional, only if projects exist)
  const projectCount = content.projects?.length || 0
  if (projectCount > 0) {
    mainLines += LAYOUT.SECTION_TITLE_LINES
    for (const proj of content.projects || []) {
      mainLines += LAYOUT.PROJECT_HEADER_LINES
      const bulletCount = proj.highlights?.length || (proj.description ? 1 : 0)
      mainLines += bulletCount * LAYOUT.PROJECT_BULLET_LINES
      if (proj.technologies?.length) {
        mainLines += LAYOUT.PROJECT_TECH_LINES
      }
      mainLines += LAYOUT.PROJECT_SPACING
    }
  }

  // Sidebar: Avatar + Contact + Skills + Education
  let sidebarLines = LAYOUT.SIDEBAR_HEADER_LINES

  // Contact section (estimate 5-6 items typically)
  sidebarLines += LAYOUT.SIDEBAR_SECTION_SPACING + 6 * LAYOUT.CONTACT_ITEM_LINES

  // Skills section
  const skillCategories = content.skills?.length || 0
  if (skillCategories > 0) {
    sidebarLines += LAYOUT.SIDEBAR_SECTION_SPACING
    sidebarLines += skillCategories * LAYOUT.SKILL_CATEGORY_LINES
  }

  // Education section
  const eduCount = content.education?.length || 0
  if (eduCount > 0) {
    sidebarLines += LAYOUT.SIDEBAR_SECTION_SPACING
    sidebarLines += eduCount * LAYOUT.EDUCATION_ENTRY_LINES
  }

  // Calculate overflow
  const mainOverflow = mainLines - LAYOUT.MAIN_COLUMN_MAX_LINES
  const sidebarOverflow = sidebarLines - LAYOUT.SIDEBAR_MAX_LINES
  const overflow = Math.max(mainOverflow, sidebarOverflow)

  // Generate suggestions if overflow
  if (mainOverflow > 0) {
    const expCount = content.experience?.length || 0
    const totalBullets = content.experience?.reduce((sum, e) => sum + (e.highlights?.length || 0), 0) || 0
    const avgBullets = expCount > 0 ? totalBullets / expCount : 0

    if (expCount > 4) {
      suggestions.push(`Reduce experience entries from ${expCount} to 4`)
    } else if (avgBullets > 3) {
      suggestions.push(`Reduce bullets per experience from ~${avgBullets.toFixed(1)} to 3`)
    }
    if (summaryLines > 3) {
      suggestions.push(`Shorten summary to ~${LAYOUT.SUMMARY_CHARS_PER_LINE * 2} chars`)
    }
  }

  if (sidebarOverflow > 0) {
    if (skillCategories > 4) {
      suggestions.push(`Consolidate skill categories from ${skillCategories} to 4`)
    }
    // Suggest combining small skill items
    const totalSkillItems = content.skills?.reduce((sum, s) => sum + s.items.length, 0) || 0
    if (totalSkillItems > 20) {
      suggestions.push(`Reduce total skills from ${totalSkillItems} to ~15-20`)
    }
  }

  return {
    mainColumnLines: Math.round(mainLines),
    sidebarLines: Math.round(sidebarLines),
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
    maxBulletsPerExperience: 4,
    maxSummaryWords: 50,
    maxSkillCategories: 5, // 4-6 range, balanced with sidebar
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

  // Quick heuristic
  return expCount <= 5 && totalBullets <= 20 && summaryWords <= 75
}

/**
 * Column balance analysis for two-column layout.
 * Returns guidance for balancing sidebar and main content heights.
 */
export interface ColumnBalance {
  sidebarLines: number
  mainLines: number
  difference: number // positive = main taller, negative = sidebar taller
  balanced: boolean
  suggestion: string
}

export function analyzeColumnBalance(content: ResumeContent): ColumnBalance {
  const estimate = estimateContentFit(content)
  const difference = estimate.mainColumnLines - estimate.sidebarLines
  const threshold = 8 // Allow ~8 lines difference before suggesting changes

  let suggestion = ''
  if (difference > threshold) {
    // Main column is too tall - suggest more sidebar content
    const skillsNeeded = Math.ceil(difference / LAYOUT.SKILL_CATEGORY_LINES)
    suggestion = `Main column is ${difference} lines taller. Add ${skillsNeeded} more skill categories or expand education.`
  } else if (difference < -threshold) {
    // Sidebar is too tall - suggest more main content
    const absD = Math.abs(difference)
    const bulletsNeeded = Math.ceil(absD / LAYOUT.EXP_BULLET_LINES)
    suggestion = `Sidebar is ${absD} lines taller. Add ${bulletsNeeded} more bullet points to experiences.`
  }

  return {
    sidebarLines: estimate.sidebarLines,
    mainLines: estimate.mainColumnLines,
    difference,
    balanced: Math.abs(difference) <= threshold,
    suggestion
  }
}

/**
 * Get recommended skill category count based on main column content.
 * Helps balance columns by suggesting appropriate sidebar content.
 */
export function getRecommendedSkillCategories(experienceCount: number, avgBulletsPerExp: number): number {
  // Estimate main column usage
  const mainLines = LAYOUT.HEADER_LINES +
    LAYOUT.SECTION_TITLE_LINES + 3 + // Summary ~3 lines
    LAYOUT.SECTION_TITLE_LINES +
    experienceCount * (LAYOUT.EXP_HEADER_LINES + avgBulletsPerExp * LAYOUT.EXP_BULLET_LINES + LAYOUT.EXP_TECH_LINES + LAYOUT.EXP_SPACING)

  // Target sidebar to match
  const targetSidebarLines = mainLines
  const baseLines = LAYOUT.SIDEBAR_HEADER_LINES +
    LAYOUT.SIDEBAR_SECTION_SPACING + 6 * LAYOUT.CONTACT_ITEM_LINES + // Contact
    LAYOUT.SIDEBAR_SECTION_SPACING + 3 * LAYOUT.EDUCATION_ENTRY_LINES // Education (~3 entries)

  const availableForSkills = targetSidebarLines - baseLines - LAYOUT.SIDEBAR_SECTION_SPACING
  const recommendedCategories = Math.max(3, Math.min(6, Math.floor(availableForSkills / LAYOUT.SKILL_CATEGORY_LINES)))

  return recommendedCategories
}

/**
 * Get content guidance for balanced columns.
 * Used in AI prompt to guide content generation.
 */
export function getBalancedContentGuidance(experienceCount: number = 4): string {
  const recommendedSkillCats = getRecommendedSkillCategories(experienceCount, 4)

  return `COLUMN BALANCE GUIDANCE:
- For ${experienceCount} experience entries with ~4 bullets each, use ${recommendedSkillCats} skill categories
- Each skill category should have 3-5 items
- Include 2-3 education entries
- Include 1-2 projects ONLY if they fill skill gaps not covered by work experience
- Aim for similar visual weight in both columns`
}
