export const TEST_AUTH_STATE_KEY = "__JF_E2E_AUTH_STATE__"
export const TEST_AUTH_TOKEN_KEY = "__JF_E2E_AUTH_TOKEN__"

export const DEFAULT_E2E_AUTH_TOKEN =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_E2E_AUTH_TOKEN) || "dev-admin-token"

export const AUTH_BYPASS_ENABLED =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUTH_BYPASS) === "true"
