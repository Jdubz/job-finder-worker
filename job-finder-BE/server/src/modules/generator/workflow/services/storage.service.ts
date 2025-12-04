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

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

function generateSecureToken(): string {
  // Generate 6-byte random token (12 hex chars) - unpredictable but compact
  return randomBytes(6).toString('hex')
}

function buildHumanReadablePath(metadata: ArtifactMetadata): { folder: string; filename: string } {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  const company = sanitize(metadata.company)
  const role = sanitize(metadata.role)
  const name = sanitize(metadata.name)
  const type = metadata.type
  const token = generateSecureToken()

  // Folder: {date}/ (flat per-day bucket to avoid deep nesting)
  const folder = date

  // Filename: {name}_{company}_{role}_{type}_{token}.pdf (token keeps paths non-guessable)
  const filename = `${name}_${company}_${role}_${type}_${token}.pdf`

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
   * Path: {date}/{company}_{role}/{name}_{company}_{role}_{type}.pdf
   */
  async saveArtifactWithMetadata(buffer: Buffer, metadata: ArtifactMetadata): Promise<UploadResult> {
    const { folder, filename } = buildHumanReadablePath(metadata)
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
