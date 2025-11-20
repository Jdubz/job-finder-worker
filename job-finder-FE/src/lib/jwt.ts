export interface JwtPayload {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  [key: string]: unknown
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  if (typeof atob === "function") {
    return atob(padded)
  }
  throw new Error("Base64 decoder not available")
}

export function decodeJwt(token: string): JwtPayload {
  try {
    const [, payload] = token.split(".")
    if (!payload) {
      return {}
    }
    const json = base64UrlDecode(payload)
    return JSON.parse(json) as JwtPayload
  } catch (error) {
    console.error("Failed to decode JWT", error)
    return {}
  }
}
