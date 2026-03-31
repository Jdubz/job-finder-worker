/**
 * Per-user configuration types.
 *
 * User configs are settings that vary per user (match-policy, prefilter-policy,
 * personal-info). System configs (worker-settings, cron-config, ai-prompts) stay
 * in the global job_finder_config table.
 */

/** Config keys that are per-user (stored in user_config table) */
export type UserConfigKey = 'match-policy' | 'prefilter-policy' | 'personal-info'

/** System config keys that stay in job_finder_config (not per-user) */
export type SystemConfigKey = 'ai-prompts' | 'worker-settings' | 'cron-config'

/** A single user config entry */
export interface UserConfigEntry<TPayload = unknown> {
  id: string
  userId: string
  payload: TPayload
  updatedAt: string
  updatedBy?: string | null
}

/** All per-user config keys for validation */
export const USER_CONFIG_KEYS: UserConfigKey[] = [
  'match-policy',
  'prefilter-policy',
  'personal-info',
]
