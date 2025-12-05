import { decryptJson, encryptJson } from "./gmail-crypto"
import { UserRepository } from "../users/user.repository"
import { logger } from "../../logger"

export type GmailTokenPayload = {
  refresh_token: string
  access_token?: string
  scope?: string
  token_type?: string
  expiry_date?: number
  historyId?: string
}

export type GmailAccountInfo = {
  userEmail: string
  gmailEmail: string
  updatedAt: string
  hasRefreshToken: boolean
  expiryDate?: number
  scopes?: string[]
  historyId?: string
}

export class GmailAuthService {
  private readonly users = new UserRepository()

  upsertUserToken(userEmail: string, gmailEmail: string, tokens: GmailTokenPayload) {
    if (!tokens.refresh_token) {
      throw new Error("refresh_token is required to store Gmail auth")
    }

    // Upsert user and keep existing roles if present
    const existing = this.users.findByEmail(userEmail)
    const roles = existing?.roles?.length ? existing.roles : ["viewer"]
    const user = this.users.upsertUser(userEmail, existing?.displayName, existing?.avatarUrl, roles)

    const encrypted = encryptJson(tokens)
    this.users.saveGmailAuth(user.id, gmailEmail, encrypted)
    logger.info({ userEmail, gmailEmail }, "Stored Gmail auth for user")
    return { userId: user.id, gmailEmail }
  }

  listAccounts(): GmailAccountInfo[] {
    const users = this.users.findUsersWithGmailAuth()
    return users.flatMap((u) => {
      if (!u.gmailEmail) {
        logger.warn({ email: u.email }, "Skipping Gmail account without gmail_email set")
        return []
      }
      let payload: GmailTokenPayload | null = null
      try {
        payload = u.gmailAuthJson ? decryptJson<GmailTokenPayload>(u.gmailAuthJson) : null
      } catch (error) {
        logger.warn({ email: u.email, err: String(error) }, "Failed to decrypt gmail_auth_json")
      }
      const account: GmailAccountInfo = {
        userEmail: u.email,
        gmailEmail: u.gmailEmail,
        updatedAt: u.updatedAt,
        hasRefreshToken: Boolean(payload?.refresh_token),
        expiryDate: payload?.expiry_date,
        scopes: payload?.scope ? payload.scope.split(" ") : undefined,
        historyId: payload?.historyId
      }
      return [account]
    })
  }

  revokeByGmailEmail(gmailEmail: string) {
    this.users.clearGmailAuthByEmail(gmailEmail)
    logger.info({ gmailEmail }, "Revoked Gmail auth")
  }

  getTokensForGmailEmail(gmailEmail: string): GmailTokenPayload | null {
    const user = this.users.findByGmailEmail(gmailEmail)
    if (!user || !user.gmailAuthJson) return null
    return decryptJson<GmailTokenPayload>(user.gmailAuthJson)
  }

  saveHistoryId(gmailEmail: string, historyId: string) {
    const users = this.users.findUsersWithGmailAuth().filter((u) => u.gmailEmail === gmailEmail)
    if (!users.length) return
    const first = users[0]
    if (!first.gmailAuthJson) return
    try {
      const payload = decryptJson<GmailTokenPayload>(first.gmailAuthJson)
      payload.historyId = historyId
      const encrypted = encryptJson(payload)
      this.users.saveGmailAuth(first.id, gmailEmail, encrypted)
    } catch (error) {
      logger.warn({ gmailEmail, error: String(error) }, "Failed to save historyId for gmail auth")
    }
  }
}
