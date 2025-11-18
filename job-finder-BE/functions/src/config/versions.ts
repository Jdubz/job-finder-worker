/**
 * Version Configuration
 *
 * Centralized version reading from package.json.
 * Used for health check endpoints and logging.
 */

/**
 * Get the package version
 *
 * Tries to load from ./package.json first (deployed environment),
 * then falls back to ../../package.json (development environment from config/).
 *
 * @returns The version string from package.json, or "unknown" if not found
 */
export function getPackageVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./package.json").version
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("../../package.json").version
    } catch {
      // If we can't find package.json, return a default value
      // This prevents the module from failing to load
      return "unknown"
    }
  }
}

/**
 * Cached package version
 * Use this in most cases to avoid repeated file system reads
 * Initialized lazily to avoid module load failures
 */
let cachedVersion: string | null = null

export const PACKAGE_VERSION = (() => {
  if (cachedVersion === null) {
    cachedVersion = getPackageVersion()
  }
  return cachedVersion
})()
