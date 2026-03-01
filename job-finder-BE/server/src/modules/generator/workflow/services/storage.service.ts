import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { env } from '../../../../config/env'

export type ArtifactType = 'resume' | 'cover-letter' | 'image' | 'raw'

export interface UploadResult {
  storagePath: string
  filename: string
  size: number
}

export interface ArtifactMetadata {
  name: string
  company: string
  role: string
  type: ArtifactType
}

// Default to a shared, volume-backed directory inside the container
const defaultArtifactsDir = path.resolve('/data/artifacts')
const artifactsRoot = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : defaultArtifactsDir
const publicBasePath = env.GENERATOR_ARTIFACTS_PUBLIC_BASE ?? '/api/generator/artifacts'

const MAX_FILENAME_LENGTH = 55
const INITIAL_NAME_MAX_LENGTH = 28
const INITIAL_ROLE_MAX_LENGTH = 32
const MIN_ROLE_LENGTH = 8
const MIN_NAME_LENGTH = 6
const UNDERSCORE_TRUNCATION_SLOP = 10 // allow shaving a short tail after the last underscore

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

function sanitize(value: string, maxLength = 40): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (!cleaned) return 'unknown'

  return cleaned.slice(0, maxLength)
}

function generateSecureToken(): string {
  // Generate 6-byte random token (12 hex chars) - unpredictable but compact
  return randomBytes(6).toString('hex')
}

function buildFilename(metadata: ArtifactMetadata, extension = '.pdf'): string {
  const maxBaseLength = MAX_FILENAME_LENGTH - extension.length

  // Keep the final label short for forms that reject long filenames
  const typeLabel = metadata.type === 'cover-letter' ? 'letter' : metadata.type

  // Company is intentionally omitted from the filename to keep it short for form uploads
  let name = sanitize(metadata.name, INITIAL_NAME_MAX_LENGTH)
  let role = sanitize(metadata.role, INITIAL_ROLE_MAX_LENGTH)

  let base = `${name}_${role}_${typeLabel}`

  // If the base is too long, trim the role first, then the name, keeping underscores and type intact.
  if (base.length > maxBaseLength) {
    const maxRole = Math.max(MIN_ROLE_LENGTH, maxBaseLength - (name.length + typeLabel.length + 2))
    if (role.length > maxRole) {
      role = role.slice(0, maxRole)
      base = `${name}_${role}_${typeLabel}`
    }
  }

  if (base.length > maxBaseLength) {
    const maxName = Math.max(MIN_NAME_LENGTH, maxBaseLength - (role.length + typeLabel.length + 2))
    if (name.length > maxName) {
      name = name.slice(0, maxName)
      base = `${name}_${role}_${typeLabel}`
    }
  }

  if (base.length > maxBaseLength) {
    // Prefer to truncate at the last underscore if it keeps the cut near the end, for readability
    const truncated = base.slice(0, maxBaseLength)
    const lastUnderscore = truncated.lastIndexOf('_')
    if (lastUnderscore > 0 && maxBaseLength - lastUnderscore <= UNDERSCORE_TRUNCATION_SLOP) {
      base = truncated.slice(0, lastUnderscore)
    } else {
      base = truncated
    }
  }

  return `${base}${extension}`
}

function buildHumanReadablePath(
  metadata: ArtifactMetadata,
  options?: { runId?: string; extension?: string }
): { folder: string; filename: string } {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  const runFolder = sanitize(options?.runId ?? `run-${generateSecureToken()}`, 32)
  const filename = buildFilename(metadata, options?.extension)

  // Folder structure: {date}/{run}/ to avoid filename collisions across runs
  const folder = path.posix.join(date, runFolder)

  return { folder, filename }
}

function detectExtension(mime: string): string {
  if (mime === 'image/svg+xml') return '.svg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg'
  return ''
}

export class LocalStorageService {
  constructor(
    private readonly rootDir: string = artifactsRoot,
    private readonly basePath: string = publicBasePath
  ) {}

  /**
   * Save artifact with human-readable folder structure and filename
   * Path: {date}/{run}/{name}_{role}_{type}.pdf (<= 55 chars filename)
   */
  async saveArtifactWithMetadata(
    buffer: Buffer,
    metadata: ArtifactMetadata,
    options?: { runId?: string; extension?: string }
  ): Promise<UploadResult> {
    const { folder, filename } = buildHumanReadablePath(metadata, options)
    const relativePath = path.posix.join(folder, filename)
    const absolutePath = path.join(this.rootDir, relativePath)
    await ensureDir(path.dirname(absolutePath))
    await fs.writeFile(absolutePath, buffer)
    return {
      storagePath: relativePath.replace(/\\/g, '/'),
      filename,
      size: buffer.length
    }
  }

  getAbsolutePath(storagePath: string): string {
    return path.join(this.rootDir, storagePath)
  }

  createPublicUrl(storagePath: string): string {
    const normalized = storagePath.startsWith('/') ? storagePath : `/${storagePath}`
    return `${this.basePath}${normalized}`
  }

  /**
   * Save an uploaded asset (avatar, logo) to the assets folder.
   * Returns relative storage path and filename.
   */
  async saveAsset(buffer: Buffer, mimeType: string, kind: 'avatar' | 'logo'): Promise<UploadResult> {
    const date = new Date().toISOString().slice(0, 10)
    const folder = path.join('assets', date)
    const ext = detectExtension(mimeType) || '.bin'
    const filename = `${kind}-${generateSecureToken()}${ext}`
    const relativePath = path.join(folder, filename)
    const absolutePath = path.join(this.rootDir, relativePath)
    await ensureDir(path.dirname(absolutePath))
    await fs.writeFile(absolutePath, buffer)
    return {
      storagePath: relativePath.replace(/\\/g, '/'),
      filename,
      size: buffer.length
    }
  }
}

export const storageService = new LocalStorageService()
