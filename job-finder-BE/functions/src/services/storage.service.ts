/**
 * Storage Service
 *
 * Handles GCS uploads and public URL generation for generated documents.
 *
 * Environment-aware bucket selection:
 * - Local/Development: Uses Firebase Storage Emulator (127.0.0.1:9199)
 * - Staging: joshwentworth-resumes-staging (publicly readable)
 * - Production: joshwentworth-resumes (publicly readable)
 *
 * **PUBLIC ACCESS:** Buckets are configured with public read access, so URLs
 * never expire. Anyone with a URL can download the file, but URLs are
 * long/random and contain job application materials (not sensitive data).
 *
 * **IMPORTANT:** Only use `FUNCTIONS_EMULATOR === "true"` for emulator detection.
 * Never use `NODE_ENV` or check for absence of `GCP_PROJECT`.
 * See: docs/development/COMMON_MISTAKES.md#environment-detection-issues
 *
 * Documentation:
 * - Setup Guide: docs/development/generator/GCS_ENVIRONMENT_SETUP.md
 * - Common Mistakes: docs/development/COMMON_MISTAKES.md
 */

import { Storage } from "@google-cloud/storage"
import type { SimpleLogger } from "../types/generator.types"

export interface UploadResult {
  gcsPath: string
  filename: string
  size: number
  storageClass: "STANDARD" | "COLDLINE"
}


/**
 * Get environment-aware bucket name
 */
function getEnvironmentBucketName(): string {
  const functionsEmulator = process.env.FUNCTIONS_EMULATOR
  const nodeEnv = process.env.NODE_ENV
  const environment = process.env.ENVIRONMENT

  // Only use local bucket if explicitly running in emulator
  const isLocal = functionsEmulator === "true"
  const isStaging = environment === "staging"

  console.log("[StorageService] Environment detection:", {
    functionsEmulator,
    nodeEnv,
    environment,
    isLocal,
    isStaging,
  })

  if (isLocal) {
    return "joshwentworth-resumes-local" // Mock bucket for local dev
  } else if (isStaging) {
    return "joshwentworth-resumes-staging"
  } else {
    return "joshwentworth-resumes" // Production
  }
}

export class StorageService {
  private storage: Storage
  private bucketName: string
  private logger: SimpleLogger
  private useEmulator: boolean

  constructor(bucketName?: string, logger?: SimpleLogger) {
    this.bucketName = bucketName || getEnvironmentBucketName()
    // Only use emulator if FUNCTIONS_EMULATOR is explicitly set to "true"
    this.useEmulator = process.env.FUNCTIONS_EMULATOR === "true"

    this.logger = logger || {
      info: (message: string, data?: unknown) => console.log(`[INFO] ${message}`, data || ""),
      warning: (message: string, data?: unknown) => console.warn(`[WARN] ${message}`, data || ""),
      error: (message: string, data?: unknown) => console.error(`[ERROR] ${message}`, data || ""),
    }

    // Initialize Storage with emulator support
    if (this.useEmulator) {
      const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199"
      this.storage = new Storage({
        projectId: "static-sites-257923",
        apiEndpoint: `http://${emulatorHost}`,
      })
      this.logger.info("StorageService using Firebase Storage Emulator", {
        bucket: this.bucketName,
        emulatorHost,
        note: "PDFs will be stored in emulator (temporary, cleared on restart)",
      })
    } else {
      // Explicitly set project ID for Cloud Functions
      this.storage = new Storage({
        projectId: "static-sites-257923",
      })
      this.logger.info("StorageService initialized for Cloud Functions", {
        bucket: this.bucketName,
        environment: process.env.ENVIRONMENT || "production",
        projectId: "static-sites-257923",
      })
    }
  }

  /**
   * Upload a PDF buffer to GCS
   */
  async uploadPDF(
    buffer: Buffer,
    filename: string,
    documentType: "resume" | "cover-letter"
  ): Promise<UploadResult> {
    try {
      const timestamp = new Date().toISOString().split("T")[0] // YYYY-MM-DD
      const gcsPath = `${documentType}s/${timestamp}/${filename}`

      const logContext = {
        gcsPath,
        size: buffer.length,
        bucket: this.bucketName,
        emulator: this.useEmulator,
      }

      this.logger.info("Uploading PDF", logContext)

      const bucket = this.storage.bucket(this.bucketName)
      const file = bucket.file(gcsPath)

      await file.save(buffer, {
        metadata: {
          contentType: "application/pdf",
          cacheControl: "public, max-age=31536000", // 1 year cache
        },
      })

      this.logger.info("PDF uploaded successfully", logContext)

      return {
        gcsPath,
        filename,
        size: buffer.length,
        storageClass: "STANDARD", // All new uploads start as STANDARD (lifecycle moves to COLDLINE after 90 days)
      }
    } catch (error) {
      this.logger.error("Failed to upload PDF", { error })
      throw new Error(`Storage upload failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Upload an image buffer to GCS (avatar or logo)
   */
  async uploadImage(
    buffer: Buffer,
    filename: string,
    imageType: "avatar" | "logo",
    contentType: string
  ): Promise<UploadResult> {
    try {
      // Validate content type
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]
      if (!allowedTypes.includes(contentType)) {
        throw new Error(`Invalid image type: ${contentType}. Allowed: ${allowedTypes.join(", ")}`)
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024 // 5MB
      if (buffer.length > maxSize) {
        throw new Error(`Image too large: ${buffer.length} bytes. Maximum: ${maxSize} bytes (5MB)`)
      }

      const gcsPath = `images/${imageType}s/${filename}`

      const logContext = {
        gcsPath,
        size: buffer.length,
        contentType,
        bucket: this.bucketName,
        emulator: this.useEmulator,
      }

      this.logger.info("Uploading image", logContext)

      const bucket = this.storage.bucket(this.bucketName)
      const file = bucket.file(gcsPath)

      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: "public, max-age=31536000", // 1 year cache
        },
      })

      this.logger.info("Image uploaded successfully", logContext)

      return {
        gcsPath,
        filename,
        size: buffer.length,
        storageClass: "STANDARD",
      }
    } catch (error) {
      this.logger.error("Failed to upload image", { error })
      throw new Error(`Image upload failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate a public URL for viewing/downloading a file
   *
   * Since buckets are configured as publicly readable, we return direct HTTPS URLs
   * that never expire.
   *
   * @param gcsPath - Full GCS path (e.g., "resumes/YYYY-MM-DD/filename.pdf" or "images/avatars/avatar.jpg")
   * @returns A permanent public HTTPS URL to the file
   */
  async generatePublicUrl(gcsPath: string): Promise<string> {
    try {
      this.logger.info("Generating public URL", {
        gcsPath,
        bucket: this.bucketName,
        emulator: this.useEmulator,
      })

      // Emulator: return emulator-specific URL
      if (this.useEmulator) {
        // Use localhost instead of 127.0.0.1 to avoid CORS issues with web app
        const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199"
        const browserFriendlyHost = emulatorHost.replace("127.0.0.1", "localhost")
        const directUrl = `http://${browserFriendlyHost}/v0/b/${this.bucketName}/o/${encodeURIComponent(gcsPath)}?alt=media`
        this.logger.info("Generated emulator direct URL", { directUrl })
        return directUrl
      }

      // Production/Staging: return public HTTPS URL
      // Format: https://storage.googleapis.com/BUCKET_NAME/OBJECT_PATH
      // These URLs never expire since buckets are publicly readable
      const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${gcsPath}`

      this.logger.info("Generated public URL", { publicUrl })

      return publicUrl
    } catch (error) {
      this.logger.error("Failed to generate public URL", { error })
      throw new Error(`URL generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate public URLs for both resume and cover letter
   * Returns direct HTTPS URLs that never expire (buckets are publicly readable)
   */
  async generatePublicUrls(
    resumePath: string | null,
    coverLetterPath: string | null
  ): Promise<{
    resumeUrl?: string
    coverLetterUrl?: string
  }> {
    const result: { resumeUrl?: string; coverLetterUrl?: string } = {}

    if (resumePath) {
      result.resumeUrl = await this.generatePublicUrl(resumePath)
    }

    if (coverLetterPath) {
      result.coverLetterUrl = await this.generatePublicUrl(coverLetterPath)
    }

    return result
  }

  /**
   * Check if a file exists in GCS
   */
  async fileExists(gcsPath: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(this.bucketName)
      const file = bucket.file(gcsPath)
      const [exists] = await file.exists()
      return exists
    } catch (error) {
      this.logger.error("Failed to check file existence", { error, gcsPath })
      return false
    }
  }
}
