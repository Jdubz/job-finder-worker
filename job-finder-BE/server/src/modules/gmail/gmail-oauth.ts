import { env } from "../../config/env"

const TOKEN_URL = "https://oauth2.googleapis.com/token"

export type OAuthTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
  id_token?: string
}

type ExchangeInput = {
  code: string
  redirectUri: string
  clientId?: string
  clientSecret?: string
}

export async function exchangeAuthCode(input: ExchangeInput): Promise<OAuthTokenResponse> {
  const client_id = input.clientId ?? env.GMAIL_OAUTH_CLIENT_ID ?? env.GOOGLE_OAUTH_CLIENT_ID
  const client_secret = input.clientSecret ?? env.GMAIL_OAUTH_CLIENT_SECRET

  if (!client_id || !client_secret) {
    throw new Error("GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET are required for OAuth exchange")
  }

  const body = new URLSearchParams({
    code: input.code,
    client_id,
    client_secret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code"
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to exchange auth code: ${res.status} ${text}`)
  }

  return (await res.json()) as OAuthTokenResponse
}
