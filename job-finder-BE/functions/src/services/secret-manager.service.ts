import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import { createDefaultLogger } from "../utils/logger"
import type { SimpleLogger } from "../types/logger.types"

export class SecretManagerService {
  private client: SecretManagerServiceClient
  private projectId: string
  private logger: SimpleLogger

  constructor(projectId?: string) {
    this.client = new SecretManagerServiceClient()
    this.projectId = projectId ?? process.env.GCP_PROJECT ?? "static-sites-257923"

    // Use shared logger factory
    this.logger = createDefaultLogger()
  }

  /**
   * Get a secret value from Google Secret Manager
   */
  async getSecret(secretName: string): Promise<string> {
    try {
      const name = `projects/${this.projectId}/secrets/${secretName}/versions/latest`
      const [version] = await this.client.accessSecretVersion({ name })

      if (!version.payload?.data) {
        throw new Error(`Secret ${secretName} has no data`)
      }

      return version.payload.data.toString()
    } catch (error) {
      this.logger.error(`Failed to get secret ${secretName}`, { error })
      throw new Error(`Failed to retrieve secret: ${secretName}`)
    }
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(secretNames: string[]): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {}

    const promises = secretNames.map(async (secretName) => {
      try {
        secrets[secretName] = await this.getSecret(secretName)
      } catch (error) {
        this.logger.warning(`Failed to get secret: ${secretName}`, { error })
        // Continue with other secrets even if one fails
      }
    })

    await Promise.all(promises)
    return secrets
  }

  /**
   * Check if running in local development environment
   */
  isLocalDevelopment(): boolean {
    return (
      process.env.NODE_ENV === "development" || process.env.FUNCTIONS_EMULATOR === "true" || !process.env.GCP_PROJECT
    )
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig(): {
    isProduction: boolean
    isStaging: boolean
    isDevelopment: boolean
    projectId: string
  } {
    const isDevelopment = this.isLocalDevelopment()
    const isStaging = process.env.ENVIRONMENT === "staging"
    const isProduction = !isDevelopment && !isStaging

    return {
      isDevelopment,
      isStaging,
      isProduction,
      projectId: this.projectId,
    }
  }
}
