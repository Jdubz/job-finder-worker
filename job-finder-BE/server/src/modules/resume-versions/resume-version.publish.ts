import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResumeContent, PersonalInfo, ResumeItem, ResumeItemNode } from '@shared/types'
import { HtmlPdfService } from '../generator/workflow/services/html-pdf.service'
import { PersonalInfoStore } from '../generator/personal-info.store'
import { ResumeVersionRepository, ResumeVersionNotFoundError } from './resume-version.repository'
import { env } from '../../config/env'

const defaultArtifactsDir = path.resolve('/data/artifacts')
const artifactsRoot = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : defaultArtifactsDir
const RESUMES_DIR = 'resumes'

/**
 * Transform a nested tree of ResumeItemNodes into the ResumeContent structure
 * expected by the existing HTML/PDF pipeline.
 */
export function transformItemsToResumeContent(
  items: ResumeItemNode[],
  personalInfo: PersonalInfo
): ResumeContent {
  const experience: ResumeContent['experience'] = []
  const projects: NonNullable<ResumeContent['projects']> = []
  const skills: NonNullable<ResumeContent['skills']> = []
  const education: NonNullable<ResumeContent['education']> = []
  let professionalSummary = ''

  function processNode(node: ResumeItemNode) {
    switch (node.aiContext) {
      case 'narrative':
        // Use the first narrative as the professional summary
        if (!professionalSummary && node.description) {
          professionalSummary = node.description
        }
        break

      case 'work':
        experience.push({
          company: node.title ?? '',
          role: node.role ?? '',
          location: node.location ?? undefined,
          startDate: node.startDate ?? '',
          endDate: node.endDate ?? null,
          description: node.description ?? undefined,
          highlights: (node.children ?? [])
            .filter((c) => c.aiContext === 'highlight' && c.description)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((c) => c.description as string),
          technologies: node.skills ?? undefined
        })
        break

      case 'project':
        projects.push({
          name: node.title ?? '',
          description: node.description ?? '',
          highlights: (node.children ?? [])
            .filter((c) => c.aiContext === 'highlight' && c.description)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((c) => c.description as string),
          technologies: node.skills ?? undefined,
          link: node.website ?? undefined
        })
        break

      case 'skills':
        skills.push({
          category: node.title ?? '',
          items: node.skills ?? []
        })
        break

      case 'education':
        education.push({
          institution: node.title ?? '',
          degree: node.role ?? '',
          field: node.description ?? undefined,
          startDate: node.startDate ?? undefined,
          endDate: node.endDate ?? undefined
        })
        break

      case 'section':
        // Section containers: process children only
        for (const child of (node.children ?? []).sort((a, b) => a.orderIndex - b.orderIndex)) {
          processNode(child)
        }
        break

      default:
        // Unknown context: recurse into children
        for (const child of (node.children ?? []).sort((a, b) => a.orderIndex - b.orderIndex)) {
          processNode(child)
        }
        break
    }
  }

  // Process top-level items in order
  for (const item of items.sort((a, b) => a.orderIndex - b.orderIndex)) {
    processNode(item)
  }

  return {
    personalInfo: {
      name: personalInfo.name,
      title: personalInfo.title ?? '',
      summary: professionalSummary,
      contact: {
        email: personalInfo.email,
        location: personalInfo.location,
        website: personalInfo.website,
        linkedin: personalInfo.linkedin,
        github: personalInfo.github
      }
    },
    professionalSummary,
    experience,
    projects: projects.length > 0 ? projects : undefined,
    skills: skills.length > 0 ? skills : undefined,
    education: education.length > 0 ? education : undefined
  }
}

/**
 * Build the nested item tree from a flat list (same logic as content-items).
 */
export function buildItemTree(items: ResumeItem[]): ResumeItemNode[] {
  const map = new Map<string, ResumeItemNode>()
  const roots: ResumeItemNode[] = []

  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] })
  })

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children?.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

/**
 * Publish a resume version: render items → ResumeContent → PDF, store at stable path.
 */
export async function publishResumeVersion(
  slug: string,
  publishedBy: string,
  repo?: ResumeVersionRepository
): Promise<{ pdfPath: string; pdfSizeBytes: number }> {
  const repository = repo ?? new ResumeVersionRepository()

  const version = repository.getVersionBySlug(slug)
  if (!version) throw new ResumeVersionNotFoundError(`Resume version not found: ${slug}`)

  const items = repository.listItems(version.id)
  if (items.length === 0) {
    throw new Error(`Cannot publish: resume version "${slug}" has no items`)
  }

  const personalInfoStore = new PersonalInfoStore()
  const personalInfo = await personalInfoStore.get()
  if (!personalInfo) {
    throw new Error('Cannot publish: personal info not configured. Set it in Settings > Personal Info.')
  }

  const tree = buildItemTree(items)
  const resumeContent = transformItemsToResumeContent(tree, personalInfo)

  const htmlPdf = new HtmlPdfService()
  const pdfBuffer = await htmlPdf.renderResume(resumeContent, personalInfo)

  // Store at stable path: resumes/{slug}.pdf (overwritten on each publish)
  const resumesDir = path.join(artifactsRoot, RESUMES_DIR)
  await fs.mkdir(resumesDir, { recursive: true })

  const filename = `${slug}.pdf`
  const relativePath = `${RESUMES_DIR}/${filename}`
  const absolutePath = path.join(resumesDir, filename)
  await fs.writeFile(absolutePath, pdfBuffer)

  repository.updateVersionPublish(slug, relativePath, pdfBuffer.length, publishedBy)

  return { pdfPath: relativePath, pdfSizeBytes: pdfBuffer.length }
}

/**
 * Get the absolute file path for a published resume version PDF.
 */
export function getResumePdfAbsolutePath(pdfPath: string): string {
  return path.join(artifactsRoot, pdfPath)
}
