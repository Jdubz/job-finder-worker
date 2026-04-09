import { OAuth2Client, type TokenPayload } from "google-auth-library"
import { env } from "./env"
import { logger } from "../logger"

let client: OAuth2Client | null = null

function getClient(): OAuth2Client | null {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    return null
  }
  if (!client) {
    client = new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID)
  }
  return client
}

export interface GoogleUser {
  uid: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
}

export async function verifyGoogleIdToken(token: string): Promise<GoogleUser | null> {
  const oauthClient = getClient()
  if (!oauthClient) {
    return null
  }
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_OAUTH_CLIENT_ID
    })
    const payload = ticket.getPayload()
    if (!payload) {
      return null
    }
    return mapPayload(payload)
  } catch (error) {
    logger.warn({ err: error }, "Failed to verify Google ID token")
    return null
  }
}

/**
 * Verify a Google OAuth access token via Google's tokeninfo endpoint.
 * Used when the frontend authenticates via useGoogleLogin (popup flow)
 * instead of the iframe-based GoogleLogin component.
 */
export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleUser | null> {
  const oauthClient = getClient()
  if (!oauthClient) {
    return null
  }
  try {
    const tokenInfo = await oauthClient.getTokenInfo(accessToken)

    if (!tokenInfo.email) {
      logger.warn("Google access token missing email scope")
      return null
    }

    // Fetch full profile (name, picture) from userinfo endpoint
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const profile = userinfoRes.ok
      ? (await userinfoRes.json()) as { sub?: string; name?: string; picture?: string }
      : {}

    return {
      uid: tokenInfo.sub ?? profile.sub ?? "",
      email: tokenInfo.email,
      emailVerified: tokenInfo.email_verified ?? undefined,
      name: profile.name,
      picture: profile.picture,
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to verify Google access token")
    return null
  }
}

function mapPayload(payload: TokenPayload): GoogleUser {
  return {
    uid: payload.sub ?? "",
    email: payload.email ?? undefined,
    emailVerified: payload.email_verified,
    name: payload.name ?? undefined,
    picture: payload.picture ?? undefined
  }
}
