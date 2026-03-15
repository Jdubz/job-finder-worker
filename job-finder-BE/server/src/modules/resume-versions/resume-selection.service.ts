/**
 * Resume Selection Service — AI-driven content selection from the resume pool.
 *
 * Flow:
 * 1. Load all pool items as a tree
 * 2. Build a structured prompt listing each item by ID + job context
 * 3. AI returns JSON specifying which item IDs to include
 * 4. Filter the pool tree to only selected items
 * 5. Transform via transformItemsToResumeContent()
 * 6. Validate with estimateContentFit() — trim if overflow
 * 7. Render PDF via HtmlPdfService
 * 8. Cache in tailored_resumes table
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ResumeContent, ResumeItemNode, ContentFitEstimate, TimestampJson, PersonalInfo } from '@shared/types'
import type { JobMatchWithListing } from '@shared/types'
import { ResumeVersionRepository } from './resume-version.repository'
import { buildItemTree, transformItemsToResumeContent } from './resume-version.publish'
import { estimateContentFit, LAYOUT } from '../generator/workflow/services/content-fit.service'
import { HtmlPdfService } from '../generator/workflow/services/html-pdf.service'
import { PersonalInfoStore } from '../generator/personal-info.store'
import { InferenceClient } from '../generator/ai/inference-client'
import { JobMatchRepository } from '../job-matches/job-match.repository'
import { env } from '../../config/env'
import { logger } from '../../logger'

const defaultArtifactsDir = path.resolve('/data/artifacts')
const artifactsRoot = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : defaultArtifactsDir
const TAILORED_DIR = 'resumes/tailored'

// ─── Error classes ──────────────────────────────────────────────

export class PoolNotFoundError extends Error {
  constructor(message = 'Resume pool not found. Run migration 063.') {
    super(message)
    this.name = 'PoolNotFoundError'
  }
}

export class JobMatchNotFoundError extends Error {
  constructor(jobMatchId: string) {
    super(`Job match not found: ${jobMatchId}`)
    this.name = 'JobMatchNotFoundError'
  }
}

export class PersonalInfoMissingError extends Error {
  constructor(message = 'Personal info not configured.') {
    super(message)
    this.name = 'PersonalInfoMissingError'
  }
}

export class AISelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AISelectionError'
  }
}

// ─── Types ──────────────────────────────────────────────────────

interface SelectionResult {
  narrative_id: string
  resume_title: string // Generalized job title for the resume header (e.g. "Software Engineer")
  experience_ids: string[]
  highlight_selections: Record<string, string[]> // work ID → highlight IDs
  skill_ids: string[]
  project_ids: string[]
  education_ids: string[]
  reasoning: string
}

export interface TailorResult {
  id: string
  jobMatchId: string
  contentFit: ContentFitEstimate | null
  pdfPath: string | null
  reasoning: string | null
  selectedItemIds: string[]
  createdAt: TimestampJson
  cached: boolean
}

// ─── Service ────────────────────────────────────────────────────

export class ResumeSelectionService {
  private repo: ResumeVersionRepository
  private jobMatchRepo: JobMatchRepository
  private inferenceClient: InferenceClient

  constructor(
    repo?: ResumeVersionRepository,
    jobMatchRepo?: JobMatchRepository,
    inferenceClient?: InferenceClient
  ) {
    this.repo = repo ?? new ResumeVersionRepository()
    this.jobMatchRepo = jobMatchRepo ?? new JobMatchRepository()
    this.inferenceClient = inferenceClient ?? new InferenceClient()
  }

  /**
   * Select content from the pool for a specific job match (no PDF generation).
   * Used by the generator workflow to produce ResumeContent for review.
   */
  async selectContent(jobMatchId: string): Promise<ResumeContent> {
    const { resumeContent } = await this.buildSelectedContent(jobMatchId)
    return resumeContent
  }

  /**
   * Core pipeline: load pool, run AI selection, filter tree, validate fit.
   * Shared by selectContent (review workflow) and tailor (auto-tailor + cache).
   */
  private async buildSelectedContent(jobMatchId: string): Promise<{
    resumeContent: ResumeContent
    personalInfo: PersonalInfo
    selection: SelectionResult
    selectedTree: ResumeItemNode[]
    fit: ReturnType<typeof estimateContentFit>
    match: JobMatchWithListing
  }> {
    const pool = this.repo.getPoolVersion()
    if (!pool) throw new PoolNotFoundError()

    const items = this.repo.listItems(pool.id)
    if (items.length === 0) throw new PoolNotFoundError('Resume pool has no items.')

    const tree = buildItemTree(items)

    const match = this.jobMatchRepo.getByIdWithListing(jobMatchId)
    if (!match) throw new JobMatchNotFoundError(jobMatchId)

    const personalInfoStore = new PersonalInfoStore()
    const personalInfo = await personalInfoStore.get()
    if (!personalInfo) throw new PersonalInfoMissingError()

    const prompt = buildSelectionPrompt(tree, match)
    const result = await this.inferenceClient.execute('document', prompt, undefined, {
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.3,
      max_tokens: 4096
    })

    const selection = parseSelectionResponse(result.output)
    logger.info({ jobMatchId, model: result.model }, 'AI selection completed')

    const selectedTree = filterTreeToSelection(tree, selection)
    const jobTitle = selection.resume_title || match.listing?.title
    let resumeContent = transformItemsToResumeContent(selectedTree, personalInfo, jobTitle)

    let fit = estimateContentFit(resumeContent)
    if (!fit.fits) {
      resumeContent = trimToFit(resumeContent)
      fit = estimateContentFit(resumeContent)
    }

    return { resumeContent, personalInfo, selection, selectedTree, fit, match }
  }

  /**
   * Tailor the pool resume for a specific job match.
   * Returns cached result if available, otherwise runs AI selection.
   */
  async tailor(jobMatchId: string, force = false): Promise<TailorResult> {
    // Check cache first (unless forced)
    if (!force) {
      const cached = this.repo.getCachedTailoredResume(jobMatchId)
      if (cached) {
        // Verify cached PDF still exists on disk
        let pdfValid = false
        if (cached.pdfPath) {
          const absPath = path.join(artifactsRoot, cached.pdfPath)
          try {
            await fs.access(absPath)
            pdfValid = true
          } catch {
            logger.warn({ jobMatchId, pdfPath: cached.pdfPath }, 'Cached tailored PDF missing from disk, regenerating')
          }
        }
        if (pdfValid) {
          logger.info({ jobMatchId }, 'Returning cached tailored resume')
          const fitEstimate = cached.contentFit as ContentFitEstimate | null
          return {
            id: cached.id,
            jobMatchId: cached.jobMatchId,
            contentFit: fitEstimate,
            pdfPath: cached.pdfPath,
            reasoning: cached.reasoning,
            selectedItemIds: cached.selectedItems,
            createdAt: cached.createdAt,
            cached: true
          }
        }
      }
    }

    const { resumeContent, personalInfo, selection, selectedTree, fit } = await this.buildSelectedContent(jobMatchId)

    const fitEstimate: ContentFitEstimate = {
      mainColumnLines: fit.mainColumnLines,
      maxLines: LAYOUT.MAX_LINES,
      usagePercent: Math.round((fit.mainColumnLines / LAYOUT.MAX_LINES) * 100),
      pageCount: fit.fits ? 1 : Math.ceil(fit.mainColumnLines / LAYOUT.MAX_LINES),
      fits: fit.fits,
      overflow: fit.overflow,
      suggestions: fit.suggestions
    }

    // Render PDF
    const htmlPdf = new HtmlPdfService()
    const pdfBuffer = await htmlPdf.renderResume(resumeContent, personalInfo)

    const tailoredDir = path.join(artifactsRoot, TAILORED_DIR)
    await fs.mkdir(tailoredDir, { recursive: true })

    // ATS-friendly filename: Firstname-Lastname-Resume_<id>.pdf
    const namePart = (personalInfo.name || 'Resume').replace(/[^a-zA-Z0-9 -]/g, '').replace(/\s+/g, '-')
    const filename = `${namePart}-Resume_${jobMatchId}.pdf`
    const relativePath = `${TAILORED_DIR}/${filename}`
    const absolutePath = path.join(tailoredDir, filename)
    await fs.writeFile(absolutePath, pdfBuffer)

    // Collect selected item IDs
    const selectedItemIds = collectItemIds(selectedTree)

    // Cache result
    const saved = this.repo.saveTailoredResume({
      jobMatchId,
      resumeContent,
      selectedItems: selectedItemIds,
      pdfPath: relativePath,
      pdfSizeBytes: pdfBuffer.length,
      contentFit: fitEstimate,
      reasoning: selection.reasoning
    })

    return {
      id: saved.id,
      jobMatchId: saved.jobMatchId,
      contentFit: fitEstimate,
      pdfPath: saved.pdfPath,
      reasoning: saved.reasoning,
      selectedItemIds,
      createdAt: saved.createdAt,
      cached: false
    }
  }
}

// ─── Prompt Building ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a resume content selector. Your ONLY job is to select items from a pool of pre-written resume content to create a tailored 1-page resume for a specific job.

CRITICAL RULES:
- You MUST only return IDs of items that exist in the pool. NEVER generate, edit, or rephrase any text.
- Select content that best matches the job requirements.
- For resume_title: provide a short, generalized job title for the resume header (e.g. "Software Engineer" not "Software Engineer - React/Node.js"). Strip technologies, locations, team names, and parenthetical qualifiers.
- Your response must be valid JSON only — no markdown fences, no commentary outside the JSON.

CONTENT BUDGET (must fit on 1 page):
- Exactly 1 narrative/summary
- Max 4 experience entries
- 4-5 bullets for most recent role, 2-3 for older roles
- 3-5 skill categories
- 0-2 projects (only if they fill genuine skill gaps)
- All education entries`

function buildSelectionPrompt(
  tree: ResumeItemNode[],
  match: JobMatchWithListing
): string {
  const poolSection = buildPoolListing(tree, 0)

  // Parse customization recommendations for structured data
  const resumeFocus: string[] = []
  const keywords: string[] = []
  for (const rec of match.customizationRecommendations ?? []) {
    if (rec.startsWith('resume_focus: ')) resumeFocus.push(rec.slice(14))
    else if (rec.startsWith('keywords: ')) keywords.push(rec.slice(10))
  }

  return `## Job Context

**Title:** ${match.listing.title}
**Company:** ${match.listing.companyName}
${match.listing.location ? `**Location:** ${match.listing.location}` : ''}

**Description:**
${match.listing.description.slice(0, 2000)}

**Matched Skills:** ${match.matchedSkills.join(', ')}
**Missing Skills:** ${match.missingSkills.join(', ')}
${resumeFocus.length > 0 ? `**Resume Focus:** ${resumeFocus.join('; ')}` : ''}
${keywords.length > 0 ? `**ATS Keywords:** ${keywords.join(', ')}` : ''}

## Resume Pool (select items by ID)

${poolSection}

## Instructions

Select the best items from the pool for this specific job. Return JSON:

{
  "narrative_id": "<id of best matching narrative>",
  "resume_title": "<generalized job title for resume header, e.g. 'Software Engineer'>",
  "experience_ids": ["<work item ids in display order>"],
  "highlight_selections": {
    "<work_id>": ["<highlight ids for that work entry>"]
  },
  "skill_ids": ["<skill category ids>"],
  "project_ids": ["<project ids, 0-2>"],
  "education_ids": ["<education ids>"],
  "reasoning": "<1-2 sentences explaining your choices>"
}`
}

function buildPoolListing(nodes: ResumeItemNode[], depth: number): string {
  const lines: string[] = []
  const indent = '  '.repeat(depth)

  for (const node of nodes.sort((a, b) => a.orderIndex - b.orderIndex)) {
    const ctx = node.aiContext ?? 'unknown'
    const idTag = `[${node.id}]`

    switch (ctx) {
      case 'narrative':
        lines.push(`${indent}${idTag} NARRATIVE: "${node.description ? node.description.slice(0, 200) + '...' : '(empty)'}"`)
        break
      case 'work':
        lines.push(`${indent}${idTag} WORK: ${node.title} / ${node.role} (${node.startDate}–${node.endDate ?? 'Present'})`)
        if (node.description) lines.push(`${indent}  desc: ${node.description.slice(0, 100)}`)
        if (node.skills?.length) lines.push(`${indent}  tech: ${node.skills.join(', ')}`)
        if (node.children?.length) {
          for (const child of node.children.sort((a, b) => a.orderIndex - b.orderIndex)) {
            if (child.aiContext === 'highlight') {
              lines.push(`${indent}  [${child.id}] HIGHLIGHT: ${child.description?.slice(0, 150) ?? '(no description)'}`)
            }
          }
        }
        break
      case 'project':
        lines.push(`${indent}${idTag} PROJECT: ${node.title}`)
        if (node.description) lines.push(`${indent}  desc: ${node.description.slice(0, 150)}`)
        if (node.skills?.length) lines.push(`${indent}  tech: ${node.skills.join(', ')}`)
        if (node.children?.length) {
          for (const child of node.children.sort((a, b) => a.orderIndex - b.orderIndex)) {
            if (child.aiContext === 'highlight') {
              lines.push(`${indent}  [${child.id}] HIGHLIGHT: ${child.description?.slice(0, 150) ?? '(no description)'}`)
            }
          }
        }
        break
      case 'skills':
        lines.push(`${indent}${idTag} SKILLS: ${node.title} → [${(node.skills ?? []).join(', ')}]`)
        break
      case 'education':
        lines.push(`${indent}${idTag} EDUCATION: ${node.title} / ${node.role}`)
        break
      case 'section':
        lines.push(`${indent}--- ${node.title ?? 'Section'} ---`)
        if (node.children?.length) {
          lines.push(buildPoolListing(node.children, depth + 1))
        }
        break
      default:
        if (node.children?.length) {
          lines.push(buildPoolListing(node.children, depth))
        }
    }
  }

  return lines.join('\n')
}

// ─── Response Parsing ───────────────────────────────────────────

const selectionSchema = z.object({
  narrative_id: z.string().min(1, 'narrative_id is required'),
  resume_title: z.string().default(''),
  experience_ids: z.array(z.string()).min(1, 'At least one experience_id is required'),
  highlight_selections: z.record(z.string(), z.array(z.string())).default({}),
  skill_ids: z.array(z.string()).default([]),
  project_ids: z.array(z.string()).default([]),
  education_ids: z.array(z.string()).default([]),
  reasoning: z.string().default('')
})

export function parseSelectionResponse(output: string): SelectionResult {
  // Strip markdown fences if present
  let cleaned = output.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    logger.error({ output: output.slice(0, 500) }, 'Failed to parse AI selection response as JSON')
    throw new AISelectionError('AI returned invalid JSON for resume selection')
  }

  const result = selectionSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    logger.error({ issues, output: output.slice(0, 500) }, 'AI selection response failed validation')
    throw new AISelectionError(`AI selection response invalid: ${issues}`)
  }

  return result.data
}

// ─── Tree Filtering ─────────────────────────────────────────────

export function filterTreeToSelection(
  tree: ResumeItemNode[],
  selection: SelectionResult
): ResumeItemNode[] {
  // Collect all selected IDs into a Set for fast lookup
  const selectedIds = new Set<string>()
  if (selection.narrative_id) selectedIds.add(selection.narrative_id)
  for (const id of selection.experience_ids) selectedIds.add(id)
  for (const ids of Object.values(selection.highlight_selections)) {
    for (const id of ids) selectedIds.add(id)
  }
  for (const id of selection.skill_ids) selectedIds.add(id)
  for (const id of selection.project_ids) selectedIds.add(id)
  for (const id of selection.education_ids) selectedIds.add(id)

  function filterNode(node: ResumeItemNode): ResumeItemNode | null {
    // For section containers, recurse and keep if any children survive
    if (node.aiContext === 'section') {
      const filteredChildren = (node.children ?? [])
        .map(filterNode)
        .filter((c): c is ResumeItemNode => c !== null)
      if (filteredChildren.length === 0) return null
      return { ...node, children: filteredChildren }
    }

    // For work entries: check if selected, then filter highlights
    if (node.aiContext === 'work') {
      if (!selectedIds.has(node.id)) return null
      const allowedHighlights = selection.highlight_selections[node.id] ?? []
      const allowedSet = new Set(allowedHighlights)
      const filteredChildren = (node.children ?? []).filter(
        (c) => c.aiContext !== 'highlight' || allowedSet.has(c.id)
      )
      return { ...node, children: filteredChildren }
    }

    // For projects: check if selected, keep all highlights
    if (node.aiContext === 'project') {
      if (!selectedIds.has(node.id)) return null
      return node
    }

    // For leaf items (narrative, skills, education): check if selected
    if (selectedIds.has(node.id)) return node

    // Unknown context with children: recurse
    if (node.children?.length) {
      const filteredChildren = (node.children)
        .map(filterNode)
        .filter((c): c is ResumeItemNode => c !== null)
      if (filteredChildren.length > 0) return { ...node, children: filteredChildren }
    }

    return null
  }

  return tree
    .map(filterNode)
    .filter((n): n is ResumeItemNode => n !== null)
}

// ─── Trim Loop ──────────────────────────────────────────────────

export function trimToFit(content: ResumeContent): ResumeContent {
  let result = { ...content }

  // Phase 1: Remove oldest experience entries (keep max 4)
  if (result.experience.length > 4) {
    result = { ...result, experience: result.experience.slice(0, 4) }
  }

  // Phase 2: Trim highlights from older roles
  if (!estimateContentFit(result).fits) {
    result = {
      ...result,
      experience: result.experience.map((exp, i) => {
        const maxBullets = i === 0 ? 5 : i === 1 ? 3 : 2
        if ((exp.highlights?.length ?? 0) > maxBullets) {
          return { ...exp, highlights: exp.highlights?.slice(0, maxBullets) }
        }
        return exp
      })
    }
  }

  // Phase 3: Trim highlights from most recent role too
  if (!estimateContentFit(result).fits) {
    result = {
      ...result,
      experience: result.experience.map((exp, i) => {
        const maxBullets = i === 0 ? 4 : i === 1 ? 3 : 2
        if ((exp.highlights?.length ?? 0) > maxBullets) {
          return { ...exp, highlights: exp.highlights?.slice(0, maxBullets) }
        }
        return exp
      })
    }
  }

  // Phase 4: Remove projects
  if (!estimateContentFit(result).fits && result.projects?.length) {
    result = { ...result, projects: undefined }
  }

  // Phase 5: Trim skill categories
  if (!estimateContentFit(result).fits && result.skills && result.skills.length > 3) {
    result = { ...result, skills: result.skills.slice(0, 3) }
  }

  // Phase 6: Further trim bullets
  if (!estimateContentFit(result).fits) {
    result = {
      ...result,
      experience: result.experience.map((exp, i) => {
        const maxBullets = i === 0 ? 3 : 2
        if ((exp.highlights?.length ?? 0) > maxBullets) {
          return { ...exp, highlights: exp.highlights?.slice(0, maxBullets) }
        }
        return exp
      })
    }
  }

  return result
}

// ─── Helpers ────────────────────────────────────────────────────

function collectItemIds(tree: ResumeItemNode[]): string[] {
  const ids: string[] = []
  function walk(nodes: ResumeItemNode[]) {
    for (const node of nodes) {
      ids.push(node.id)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(tree)
  return ids
}
