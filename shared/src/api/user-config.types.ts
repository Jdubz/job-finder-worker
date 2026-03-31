/**
 * API request/response types for per-user configuration.
 */

import type { UserConfigEntry, UserConfigKey } from '../user-config.types'

/** GET /api/user-config */
export type GetUserConfigListResponse = UserConfigEntry[]

/** GET /api/user-config/:key */
export type GetUserConfigResponse = UserConfigEntry

/** PUT /api/user-config/:key */
export interface UpsertUserConfigRequest {
  payload: unknown
}

/** PUT /api/user-config/:key response */
export type UpsertUserConfigResponse = UserConfigEntry

/** Valid user config keys for route validation */
export type { UserConfigKey }
