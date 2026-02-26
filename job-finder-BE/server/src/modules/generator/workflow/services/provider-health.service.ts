import { UserFacingError } from '../generator.workflow.service'

/**
 * Ensure AI inference is available by checking LiteLLM proxy health.
 */
export async function ensureLitellmHealthy(): Promise<void> {
  const baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000'

  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) {
      throw new UserFacingError(`LiteLLM proxy returned HTTP ${response.status}. AI generation is temporarily unavailable.`)
    }
  } catch (err) {
    if (err instanceof UserFacingError) throw err
    throw new UserFacingError('AI inference proxy is not reachable. Please try again shortly.')
  }
}
