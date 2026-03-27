/**
 * Resume Selection Service — AI-driven content selection from the resume pool.
 *
 * Flow:
 * 1. Load all pool items as a tree
 * 2. Build a structured prompt listing each item by ID + job context
 * 3. AI returns JSON specifying which item IDs to include
 * 4. Filter the pool tree to only selected items
 * 5. Transform via transformItemsToResumeContent()
 * 6. Render-measure fit loop: Chromium measures .page height, expand/trim one step at a time
 * 7. Render final PDF in the same browser session
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
import { RenderMeasureService, USABLE_HEIGHT_PX, type MeasureResult } from '../generator/workflow/services/render-measure.service'
import { PersonalInfoStore } from '../generator/personal-info.store'
import { InferenceClient } from '../generator/ai/inference-client'
import { JobMatchRepository } from '../job-matches/job-match.repository'
import { SelectionCacheService, computePoolItemsHash, type SelectionResult } from './selection-cache.service'
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

export type { SelectionResult } from './selection-cache.service'

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
  private selectionCache: SelectionCacheService

  constructor(
    repo?: ResumeVersionRepository,
    jobMatchRepo?: JobMatchRepository,
    inferenceClient?: InferenceClient,
    selectionCache?: SelectionCacheService
  ) {
    this.repo = repo ?? new ResumeVersionRepository()
    this.jobMatchRepo = jobMatchRepo ?? new JobMatchRepository()
    this.inferenceClient = inferenceClient ?? new InferenceClient()
    this.selectionCache = selectionCache ?? new SelectionCacheService()
  }

  /**
   * Select content from the pool for a specific job match (no PDF generation).
   * Used by the generator workflow to produce ResumeContent for review.
   * Uses estimation-based fitting (good enough for human review).
   */
  async selectContent(jobMatchId: string): Promise<ResumeContent> {
    const { resumeContent } = await this.buildFittedContent(jobMatchId)
    return resumeContent
  }

  /**
   * Load pool, run AI selection (or cache), return raw results with no fitting applied.
   * Used by tailor() which applies its own render-measure loop.
   */
  private async buildRawSelection(jobMatchId: string): Promise<{
    tree: ResumeItemNode[]
    selection: SelectionResult
    personalInfo: PersonalInfo
    jobTitle: string | undefined
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

    // ── Selection cache lookup ──────────────────────────────────
    const poolItemsHash = computePoolItemsHash(items)
    const cacheResult = await this.selectionCache.lookup(match, poolItemsHash)

    let selection: SelectionResult

    if (cacheResult.tier !== 'miss') {
      selection = cacheResult.selection
      logger.info(
        {
          jobMatchId,
          tier: cacheResult.tier,
          similarity: 'similarity' in cacheResult ? cacheResult.similarity : undefined,
        },
        'Selection cache hit — skipping AI call'
      )

      // Safety check: verify cached selection produces a non-empty tree
      const testTree = filterTreeToSelection(tree, selection)
      if (testTree.length === 0) {
        logger.warn(
          { jobMatchId, tier: cacheResult.tier },
          'Cached selection produced empty tree (stale IDs?), falling back to AI'
        )
        selection = await this.runAISelection(tree, match, jobMatchId, poolItemsHash)
      }
    } else {
      selection = await this.runAISelection(tree, match, jobMatchId, poolItemsHash, cacheResult.embedding)
    }

    const jobTitle = selection.resume_title || match.listing?.title
    return { tree, selection, personalInfo, jobTitle, match }
  }

  /**
   * Load pool + AI selection, then apply estimation-based expand/trim.
   * Used by selectContent() (non-PDF review path).
   */
  private async buildFittedContent(jobMatchId: string): Promise<{
    resumeContent: ResumeContent
    personalInfo: PersonalInfo
    selection: SelectionResult
    selectedTree: ResumeItemNode[]
    fit: ReturnType<typeof estimateContentFit>
    match: JobMatchWithListing
  }> {
    const { tree, selection: rawSelection, personalInfo, jobTitle, match } =
      await this.buildRawSelection(jobMatchId)

    let selection = rawSelection
    let selectedTree = filterTreeToSelection(tree, selection)
    let resumeContent = transformItemsToResumeContent(selectedTree, personalInfo, jobTitle)

    let fit = estimateContentFit(resumeContent)
    if (!fit.fits) {
      resumeContent = trimToFit(resumeContent)
      fit = estimateContentFit(resumeContent)
    }

    // Expand to fill the page when there's significant spare space
    if (fit.overflow < -EXPAND_THRESHOLD) {
      const preExpandResumeContent = resumeContent
      const preExpandSelection = selection
      const preExpandSelectedTree = selectedTree
      const preExpandFit = fit

      const expanded = expandToFit(tree, selection, personalInfo, jobTitle)
      resumeContent = expanded.resumeContent
      selection = expanded.selection
      selectedTree = filterTreeToSelection(tree, selection)
      fit = estimateContentFit(resumeContent)

      // Safety: if expansion caused overflow, roll back to pre-expansion state
      if (!fit.fits) {
        resumeContent = preExpandResumeContent
        selection = preExpandSelection
        selectedTree = preExpandSelectedTree
        fit = preExpandFit
      }
    }

    return { resumeContent, personalInfo, selection, selectedTree, fit, match }
  }

  /**
   * Run AI selection and store the result in the selection cache.
   */
  private async runAISelection(
    tree: ResumeItemNode[],
    match: JobMatchWithListing,
    jobMatchId: string,
    poolItemsHash: string,
    precomputedEmbedding?: number[]
  ): Promise<SelectionResult> {
    const prompt = buildSelectionPrompt(tree, match)
    const result = await this.inferenceClient.execute('document', prompt, undefined, {
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.3,
    })

    const selection = parseSelectionResponse(result.output)
    logger.info({ jobMatchId, model: result.model }, 'AI selection completed')

    // Store in selection cache (fire-and-forget — store() handles its own error logging)
    this.selectionCache.store(match, poolItemsHash, selection, precomputedEmbedding)

    return selection
  }

  /**
   * Tailor the pool resume for a specific job match.
   * Uses a Chromium render-measure loop for pixel-perfect page fitting.
   * Returns cached result if available, otherwise runs AI selection + fit loop.
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

    const { tree, selection: rawSelection, personalInfo, jobTitle } =
      await this.buildRawSelection(jobMatchId)

    // ── Render-measure fit loop ──────────────────────────────────
    const LINE_UNIT_PX = 14.175
    const TOLERANCE_PX = 5 // ~0.35 lines — spacing distribution fills the rest
    const MAX_ITERATIONS = 20

    const renderer = new RenderMeasureService()
    let selection = rawSelection
    let resumeContent: ResumeContent
    let measurement: MeasureResult
    let pdfBuffer: Buffer

    /** Transform a selection into content and measure its rendered height. */
    const measureSelection = async (sel: SelectionResult) => {
      const content = transformItemsToResumeContent(
        filterTreeToSelection(tree, sel), personalInfo, jobTitle
      )
      const m = await renderer.measure(content, personalInfo)
      return { content, measurement: m }
    }

    try {
      await renderer.init()

      // Build initial content and measure
      ;({ content: resumeContent, measurement } = await measureSelection(selection))
      let iterations = 0

      // Phase 1: Trim if overflowing
      while (!measurement.fits && iterations < MAX_ITERATIONS) {
        const trimmed = trimOneStep(tree, selection)
        if (!trimmed) break
        selection = trimmed
        ;({ content: resumeContent, measurement } = await measureSelection(selection))
        iterations++
      }

      // If still overflowing after trim exhaustion, log a warning.
      // The PDF will render as-is (possibly multi-page) rather than failing the job application.
      if (!measurement.fits) {
        logger.warn(
          { jobMatchId, contentHeightPx: measurement.contentHeightPx, sparePx: measurement.sparePx },
          'Render-measure loop: content still overflows after exhausting trim options'
        )
      }

      // Phase 2: Expand while there's room for another bullet (only if not overflowing)
      while (measurement.fits && measurement.sparePx > TOLERANCE_PX && iterations < MAX_ITERATIONS) {
        const expanded = expandOneStep(tree, selection)
        if (!expanded) break // pool exhausted

        // Speculatively measure the expansion
        const { content: expandedContent, measurement: expandedMeasure } =
          await measureSelection(expanded)

        if (!expandedMeasure.fits) break // would overflow — stop without accepting

        selection = expanded
        resumeContent = expandedContent
        measurement = expandedMeasure
        iterations++
      }

      logger.info(
        { jobMatchId, iterations, contentHeightPx: measurement.contentHeightPx, sparePx: measurement.sparePx },
        'Render-measure fit loop completed'
      )

      // Render final PDF, distributing any remaining spare space to fill the page exactly
      pdfBuffer = await renderer.renderPdfFilled(resumeContent, personalInfo, measurement.sparePx)
    } finally {
      await renderer.dispose()
    }

    // Build fit estimate from actual measured values
    const fitEstimate: ContentFitEstimate = {
      mainColumnLines: Math.round(measurement.contentHeightPx / LINE_UNIT_PX),
      maxLines: LAYOUT.MAX_LINES,
      usagePercent: Math.round((measurement.contentHeightPx / USABLE_HEIGHT_PX) * 100),
      pageCount: measurement.fits ? 1 : Math.ceil(measurement.contentHeightPx / USABLE_HEIGHT_PX),
      fits: measurement.fits,
      overflow: -Math.round(measurement.sparePx / LINE_UNIT_PX),
      suggestions: [],
    }

    const tailoredDir = path.join(artifactsRoot, TAILORED_DIR)
    await fs.mkdir(tailoredDir, { recursive: true })

    // ATS-friendly filename: Firstname-Lastname-Resume_<id>.pdf
    const namePart = (personalInfo.name || 'Resume').replace(/[^a-zA-Z0-9 -]/g, '').replace(/\s+/g, '-')
    const filename = `${namePart}-Resume_${jobMatchId}.pdf`
    const relativePath = `${TAILORED_DIR}/${filename}`
    const absolutePath = path.join(tailoredDir, filename)
    await fs.writeFile(absolutePath, pdfBuffer)

    // Collect selected item IDs
    const selectedTree = filterTreeToSelection(tree, selection)
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

EXPERIENCE-FIRST PRIORITY (follow this order strictly):
1. Include the 4 most recent professional work experience entries (by start date). If the pool has fewer than 4, include all of them. Work experience is the most valuable section — never drop a work entry to make room for projects.
2. Maximize bullets for each work entry. Most recent role: 5-6 highlights. Second role: 4-5. Third role: 3-4. Fourth role: 2-3. Select highlights that best match the job description.
3. FILL THE PAGE. A good resume uses all available space on 1 page. If you have room after experience, add more bullets before considering projects.
4. Only include projects (0-2) if the candidate's work experience does NOT cover a key requirement from the job description AND a project directly fills that gap. If work experience already covers the job's core requirements, return "project_ids": [].
5. Include 3-5 skill categories and all education entries.

VARIANT HIGHLIGHTS: Some work entries contain multiple highlights that describe the SAME project or responsibility from different technical perspectives (e.g., a frontend-focused bullet and a backend-focused bullet about the same product). When you see highlights that clearly overlap in subject matter under the same work entry, select AT MOST ONE — the variant that best matches this job's tech stack and focus area. Different projects at the same company are NOT variants and can all be selected.

CONTENT BUDGET (must fit on 1 page):
- Exactly 1 narrative/summary
- Up to 4 experience entries (most recent by start date; include all if fewer than 4 exist)
- 3-5 skill categories
- 0-2 projects (ONLY for genuine skill gaps not covered by work experience)
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
              lines.push(`${indent}  [${child.id}] HIGHLIGHT: ${child.description ?? '(no description)'}`)
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
              lines.push(`${indent}  [${child.id}] HIGHLIGHT: ${child.description ?? '(no description)'}`)
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

// ─── Expand Loop ────────────────────────────────────────────────

/**
 * Minimum spare lines to preserve as safety margin during expansion.
 * The content-fit estimator can be off by 2-3 lines due to Chromium rendering
 * variance, font metric approximations, and margin collapse edge cases.
 * 5 lines (~71px) provides enough buffer to prevent page overflow.
 */
export const EXPAND_THRESHOLD = 5

/** Extra spare lines required beyond EXPAND_THRESHOLD before adding skill categories. */
const SKILL_EXPANSION_BUFFER = 2

/** Maximum number of skill categories to allow during expansion. */
const MAX_SKILL_CATEGORIES = 5

/**
 * When content fits but leaves significant blank space, add more highlights
 * from the pool to fill the page. Works at the selection level so IDs stay consistent.
 *
 * Priority: add more highlights to existing work entries (most recent first),
 * then add skill categories.
 */
export function expandToFit(
  tree: ResumeItemNode[],
  selection: SelectionResult,
  personalInfo: PersonalInfo,
  jobTitle?: string
): { resumeContent: ResumeContent; selection: SelectionResult } {
  // Build a mutable copy of the selection
  const expanded: SelectionResult = {
    ...selection,
    highlight_selections: { ...selection.highlight_selections },
  }

  const experienceIdSet = new Set(expanded.experience_ids)

  // Index: for each selected work entry, find ALL available highlights in the pool.
  // Also collect the work nodes themselves so we can sort by recency.
  const workPool = new Map<string, ResumeItemNode[]>()
  const workNodes: ResumeItemNode[] = []
  function findWorkNodes(nodes: ResumeItemNode[]) {
    for (const node of nodes) {
      if (node.aiContext === 'work' && experienceIdSet.has(node.id)) {
        const allHighlights = (node.children ?? [])
          .filter((c) => c.aiContext === 'highlight' && c.description)
          .sort((a, b) => a.orderIndex - b.orderIndex)
        workPool.set(node.id, allHighlights)
        workNodes.push(node)
      }
      if (node.aiContext === 'section' && node.children?.length) {
        findWorkNodes(node.children)
      }
      if (node.children?.length && !node.aiContext) {
        findWorkNodes(node.children)
      }
    }
  }
  findWorkNodes(tree)

  // Sort work entries by recency: most recent startDate first, then by orderIndex
  workNodes.sort((a, b) => {
    if (a.startDate && b.startDate) return b.startDate.localeCompare(a.startDate)
    return a.orderIndex - b.orderIndex
  })
  const workExpansionOrder = workNodes.map((n) => n.id)

  // Index: all available skill nodes in the pool that aren't selected
  const selectedSkillSet = new Set(expanded.skill_ids)
  const availableSkills: ResumeItemNode[] = []
  function findSkillNodes(nodes: ResumeItemNode[]) {
    for (const node of nodes) {
      if (node.aiContext === 'skills' && !selectedSkillSet.has(node.id)) {
        availableSkills.push(node)
      }
      if ((node.aiContext === 'section' || !node.aiContext) && node.children?.length) {
        findSkillNodes(node.children)
      }
    }
  }
  findSkillNodes(tree)

  // Iteratively add highlights until we run out of room or pool content
  let changed = true
  while (changed) {
    changed = false
    const selectedTree = filterTreeToSelection(tree, expanded)
    const resumeContent = transformItemsToResumeContent(selectedTree, personalInfo, jobTitle)
    const fit = estimateContentFit(resumeContent)

    if (fit.overflow >= -EXPAND_THRESHOLD) break // not enough room

    // Try adding highlights to work entries, most recent first (by startDate)
    for (const workId of workExpansionOrder) {
      const poolHighlights = workPool.get(workId)
      if (!poolHighlights) continue

      const currentIds = new Set(expanded.highlight_selections[workId] ?? [])
      const unselected = poolHighlights.filter((h) => !currentIds.has(h.id))
      if (unselected.length === 0) continue

      // Add the next unselected highlight
      const next = unselected[0]
      expanded.highlight_selections[workId] = [
        ...(expanded.highlight_selections[workId] ?? []),
        next.id,
      ]
      changed = true
      break // re-estimate after each addition
    }

    // If no work highlights to add, try adding a skill category (capped at MAX_SKILL_CATEGORIES)
    if (
      !changed &&
      availableSkills.length > 0 &&
      expanded.skill_ids.length < MAX_SKILL_CATEGORIES &&
      fit.overflow < -(EXPAND_THRESHOLD + SKILL_EXPANSION_BUFFER)
    ) {
      const nextSkill = availableSkills.shift()!
      expanded.skill_ids = [...expanded.skill_ids, nextSkill.id]
      selectedSkillSet.add(nextSkill.id)
      changed = true
    }
  }

  const finalTree = filterTreeToSelection(tree, expanded)
  const resumeContent = transformItemsToResumeContent(finalTree, personalInfo, jobTitle)
  return { resumeContent, selection: expanded }
}

// ─── Single-Step Operations (for render-measure loop) ───────────

/**
 * Collect selected work nodes from the pool tree, sorted by startDate descending
 * (most recent first). Shared by expandOneStep and expandToFit.
 */
function getWorkPoolIndex(
  tree: ResumeItemNode[],
  experienceIds: string[]
): { workPool: Map<string, ResumeItemNode[]>; expansionOrder: string[] } {
  const idSet = new Set(experienceIds)
  const workPool = new Map<string, ResumeItemNode[]>()
  const workNodes: ResumeItemNode[] = []

  function walk(nodes: ResumeItemNode[]) {
    for (const node of nodes) {
      if (node.aiContext === 'work' && idSet.has(node.id)) {
        const highlights = (node.children ?? [])
          .filter((c) => c.aiContext === 'highlight' && c.description)
          .sort((a, b) => a.orderIndex - b.orderIndex)
        workPool.set(node.id, highlights)
        workNodes.push(node)
      }
      if ((node.aiContext === 'section' || !node.aiContext) && node.children?.length) {
        walk(node.children)
      }
    }
  }
  walk(tree)

  workNodes.sort((a, b) => {
    if (a.startDate && b.startDate) return b.startDate.localeCompare(a.startDate)
    return a.orderIndex - b.orderIndex
  })

  return { workPool, expansionOrder: workNodes.map((n) => n.id) }
}

/**
 * Add one highlight from the pool to the selection.
 * Priority: most recent work entry first (by startDate), then older entries,
 * then skill categories.
 * Returns a new SelectionResult, or null if nothing can be added.
 */
export function expandOneStep(
  tree: ResumeItemNode[],
  selection: SelectionResult
): SelectionResult | null {
  const { workPool, expansionOrder } = getWorkPoolIndex(tree, selection.experience_ids)

  // Try adding a highlight to work entries (most recent first)
  for (const workId of expansionOrder) {
    const poolHighlights = workPool.get(workId)
    if (!poolHighlights) continue

    const currentIds = new Set(selection.highlight_selections[workId] ?? [])
    const unselected = poolHighlights.filter((h) => !currentIds.has(h.id))
    if (unselected.length === 0) continue

    return {
      ...selection,
      highlight_selections: {
        ...selection.highlight_selections,
        [workId]: [...(selection.highlight_selections[workId] ?? []), unselected[0].id],
      },
    }
  }

  // No work highlights available — try adding a skill category
  if (selection.skill_ids.length < MAX_SKILL_CATEGORIES) {
    const selectedSkillSet = new Set(selection.skill_ids)
    const availableSkill = findFirstAvailableSkill(tree, selectedSkillSet)
    if (availableSkill) {
      return {
        ...selection,
        skill_ids: [...selection.skill_ids, availableSkill.id],
      }
    }
  }

  return null // pool exhausted
}

/**
 * Remove one highlight from the selection.
 * Priority: remove from the OLDEST work entry first (preserving recent experience depth).
 * Within an entry, removes the last highlight (lowest priority by position).
 * Falls back to removing projects, then skill categories.
 * Returns a new SelectionResult, or null if at minimum content.
 */
export function trimOneStep(
  tree: ResumeItemNode[],
  selection: SelectionResult
): SelectionResult | null {
  const { expansionOrder } = getWorkPoolIndex(tree, selection.experience_ids)
  // Reverse: oldest first for trimming
  const trimOrder = [...expansionOrder].reverse()

  // Try removing a highlight from work entries (oldest first)
  for (const workId of trimOrder) {
    const highlights = selection.highlight_selections[workId] ?? []
    if (highlights.length > 1) {
      return {
        ...selection,
        highlight_selections: {
          ...selection.highlight_selections,
          [workId]: highlights.slice(0, -1),
        },
      }
    }
  }

  // Remove a project
  if (selection.project_ids.length > 0) {
    return {
      ...selection,
      project_ids: selection.project_ids.slice(0, -1),
    }
  }

  // Remove the last skill category
  if (selection.skill_ids.length > 1) {
    return {
      ...selection,
      skill_ids: selection.skill_ids.slice(0, -1),
    }
  }

  return null // at minimum content
}

/** Find the first skill node in the tree that isn't already selected. */
function findFirstAvailableSkill(
  nodes: ResumeItemNode[],
  selectedIds: Set<string>
): ResumeItemNode | null {
  for (const node of nodes) {
    if (node.aiContext === 'skills' && !selectedIds.has(node.id)) return node
    if ((node.aiContext === 'section' || !node.aiContext) && node.children?.length) {
      const found = findFirstAvailableSkill(node.children, selectedIds)
      if (found) return found
    }
  }
  return null
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
