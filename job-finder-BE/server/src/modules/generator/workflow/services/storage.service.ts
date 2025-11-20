import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../../../../config/env'

export type ArtifactType = 'resume' | 'cover-letter' | 'image' | 'raw'

export interface UploadResult {
  storagePath: string
  filename: string
  size: number
}

const defaultArtifactsDir = path.resolve(process.cwd(), 'tmp', 'artifacts')
const artifactsRoot = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : defaultArtifactsDir
const publicBasePath = env.GENERATOR_ARTIFACTS_PUBLIC_BASE ?? '/api/generator/artifacts'

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

function buildRelativePath(requestId: string, artifactType: ArtifactType, filename: string) {
  const safeRequestId = requestId.replace(/[^a-zA-Z0-9-_]/g, '')
  return path.join(safeRequestId, artifactType, filename)
}

export class LocalStorageService {
  constructor(private readonly rootDir: string = artifactsRoot) {}

  async saveArtifact(buffer: Buffer, requestId: string, artifactType: ArtifactType, filename: string): Promise<UploadResult> {
    const relativePath = buildRelativePath(requestId, artifactType, filename)
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
    return `${publicBasePath}${normalized}`
  }
}

export const storageService = new LocalStorageService()
