import { promises as fs } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { env } from '../../../../config/env'
import { logger } from '../../../../logger'

const execAsync = promisify(exec)

/**
 * Network storage configuration
 */
interface NetworkStorageConfig {
  enabled: boolean
  smbHost: string
  smbShare: string
  smbPath: string
  username?: string
  password?: string
  mountPoint?: string
}

/**
 * Service for copying generated documents to network storage (SMB/CIFS)
 * 
 * Supports two modes:
 * 1. Direct SMB copy using smbclient (recommended)
 * 2. Mounted network drive copy (if share is pre-mounted)
 */
export class NetworkStorageService {
  private readonly config: NetworkStorageConfig

  constructor() {
    this.config = {
      enabled: env.NETWORK_STORAGE_ENABLED === 'true',
      smbHost: env.NETWORK_STORAGE_HOST || 'bignasty.local',
      smbShare: env.NETWORK_STORAGE_SHARE || 'storage',
      smbPath: env.NETWORK_STORAGE_PATH || 'documents/Resume',
      username: env.NETWORK_STORAGE_USERNAME,
      password: env.NETWORK_STORAGE_PASSWORD,
      mountPoint: env.NETWORK_STORAGE_MOUNT_POINT,
    }

    if (this.config.enabled) {
      logger.info({
        host: this.config.smbHost,
        share: this.config.smbShare,
        path: this.config.smbPath,
      }, 'Network storage enabled')
    }
  }

  /**
   * Copy a file to network storage
   * @param localPath - Local file path to copy
   * @param filename - Desired filename on network storage
   * @param subfolder - Optional subfolder (e.g., 'Resume' or 'CoverLetter')
   * @returns Success status and any error message
   */
  async copyToNetwork(
    localPath: string,
    filename: string,
    subfolder?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.config.enabled) {
      logger.debug('Network storage disabled, skipping copy')
      return { success: true } // Not an error, just disabled
    }

    try {
      // Check if local file exists
      await fs.access(localPath)

      // Determine destination path
      const remotePath = subfolder
        ? `${this.config.smbPath}/${subfolder}`
        : this.config.smbPath

      if (this.config.mountPoint) {
        // Mode 1: Copy to mounted network drive
        return await this.copyToMountedDrive(localPath, filename, remotePath)
      } else {
        // Mode 2: Use smbclient to copy
        return await this.copyUsingSmbClient(localPath, filename, remotePath)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error({
        localPath,
        filename,
        error: message,
      }, 'Failed to copy to network storage')
      return { success: false, error: message }
    }
  }

  /**
   * Copy file to pre-mounted network drive
   */
  private async copyToMountedDrive(
    localPath: string,
    filename: string,
    remotePath: string
  ): Promise<{ success: boolean; error?: string }> {
    const destinationDir = path.join(this.config.mountPoint!, remotePath)
    const destinationPath = path.join(destinationDir, filename)

    try {
      // Ensure destination directory exists
      await fs.mkdir(destinationDir, { recursive: true })

      // Copy file
      await fs.copyFile(localPath, destinationPath)

      logger.info({
        source: localPath,
        destination: destinationPath,
      }, 'Copied to mounted network drive')

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error({
        localPath,
        destinationPath,
        error: message,
      }, 'Failed to copy to mounted drive')
      return { success: false, error: message }
    }
  }

  /**
   * Copy file using smbclient command
   * Requires smbclient to be installed on the system
   */
  private async copyUsingSmbClient(
    localPath: string,
    filename: string,
    remotePath: string
  ): Promise<{ success: boolean; error?: string }> {
    const smbUrl = `//${this.config.smbHost}/${this.config.smbShare}`
    const remoteFullPath = `${remotePath}/${filename}`

    // Build smbclient command
    const authPart = this.config.username
      ? `-U ${this.config.username}${this.config.password ? `%${this.config.password}` : ''}`
      : '-N' // No password (guest)

    // Create remote directory first (ignore errors if it exists)
    const mkdirCmd = `smbclient ${smbUrl} ${authPart} -c "mkdir ${remotePath}" 2>/dev/null || true`
    
    // Copy file
    const copyCmd = `smbclient ${smbUrl} ${authPart} -c "cd ${remotePath}; put ${localPath} ${filename}"`

    try {
      // Create directory (may already exist)
      await execAsync(mkdirCmd)

      // Copy file
      const { stdout, stderr } = await execAsync(copyCmd)

      // Check for errors in output
      if (stderr && !stderr.includes('putting file')) {
        throw new Error(`smbclient error: ${stderr}`)
      }

      logger.info({
        source: localPath,
        destination: `${smbUrl}/${remoteFullPath}`,
      }, 'Copied using smbclient')

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      
      // Check if smbclient is not installed
      if (message.includes('command not found') || message.includes('smbclient')) {
        logger.warn({
          error: message,
        }, 'smbclient not installed, network storage disabled')
        return { success: false, error: 'smbclient not installed' }
      }

      logger.error({
        localPath,
        remoteFullPath,
        error: message,
      }, 'Failed to copy using smbclient')
      return { success: false, error: message }
    }
  }

  /**
   * Check if network storage is accessible
   */
  async testConnection(): Promise<{ accessible: boolean; error?: string }> {
    if (!this.config.enabled) {
      return { accessible: false, error: 'Network storage is disabled' }
    }

    try {
      if (this.config.mountPoint) {
        // Test mounted drive access
        await fs.access(this.config.mountPoint)
        return { accessible: true }
      } else {
        // Test smbclient connection
        const smbUrl = `//${this.config.smbHost}/${this.config.smbShare}`
        const authPart = this.config.username
          ? `-U ${this.config.username}${this.config.password ? `%${this.config.password}` : ''}`
          : '-N'

        const cmd = `smbclient ${smbUrl} ${authPart} -c "ls" 2>&1`
        await execAsync(cmd)
        return { accessible: true }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ error: message }, 'Network storage connection test failed')
      return { accessible: false, error: message }
    }
  }
}

// Export singleton instance
export const networkStorageService = new NetworkStorageService()
