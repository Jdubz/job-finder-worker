import { Router } from "express"
import { z } from "zod"
import { success } from "../../utils/api-response"
import { ApiHttpError } from "../../middleware/api-error"
import { ApiErrorCode } from "@shared/types"
import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { exchangeAuthCode } from "./gmail-oauth"
import { GmailIngestService } from "./gmail-ingest.service"
import { env } from "../../config/env"
import { asyncHandler } from "../../utils/async-handler"
import type { AuthenticatedRequest } from "../../middleware/firebase-auth"

const service = new GmailAuthService()
const ingest = new GmailIngestService()

const StoreSchema = z.object({
  userEmail: z.string().email(),
  gmailEmail: z.string().email(),
  tokens: z.object({
    refresh_token: z.string().min(1),
    access_token: z.string().optional(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
    expiry_date: z.number().optional(),
    historyId: z.string().optional()
  })
})

export function buildGmailRouter() {
  const router = Router()

  router.get(
    "/accounts",
    asyncHandler(async (_req, res) => {
      const accounts = service.listAccounts()
      res.json(success({ accounts }))
    })
  )

  router.get("/oauth/client", (_req, res) => {
    res.json(
      success({
        clientId: env.GMAIL_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID || null,
        redirectUri: null // FE computes based on window.location
      })
    )
  })

  router.post(
    "/oauth/exchange",
    asyncHandler(async (req, res) => {
    const schema = z.object({
      code: z.string().min(1),
      redirectUri: z.string().url(),
      userEmail: z.string().email(),
      gmailEmail: z.string().email().optional(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional()
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "Invalid OAuth exchange payload", {
        status: 400,
        details: parsed.error.flatten()
      })
    }

    const { code, redirectUri, userEmail, gmailEmail, clientId, clientSecret } = parsed.data
    const authed = (req as AuthenticatedRequest).user
    if (!authed || authed.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ApiHttpError(ApiErrorCode.FORBIDDEN, "userEmail must match authenticated user", { status: 403 })
    }
    const tokenResponse = await exchangeAuthCode({ code, redirectUri, clientId, clientSecret })

    if (!tokenResponse.refresh_token) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "OAuth response missing refresh_token", {
        status: 400
      })
    }

    const gmailAddress = gmailEmail ?? userEmail
    const safetyMarginMs = Math.max(0, tokenResponse.expires_in * 1000 - 60_000)
    service.upsertUserToken(userEmail, gmailAddress, {
      refresh_token: tokenResponse.refresh_token,
      access_token: tokenResponse.access_token,
      scope: tokenResponse.scope,
      token_type: tokenResponse.token_type,
      expiry_date: Date.now() + safetyMarginMs
    })

    res.json(
      success({
        stored: true,
        gmailEmail: gmailAddress,
        userEmail,
        scopes: tokenResponse.scope?.split(" ")
      })
    )
    })
  )

  router.post("/oauth/store", (req, res) => {
    const parsed = StoreSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "Invalid OAuth payload", {
        status: 400,
        details: parsed.error.flatten()
      })
    }

    const { userEmail, gmailEmail, tokens } = parsed.data
    const authed = (req as AuthenticatedRequest).user
    if (!authed || authed.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ApiHttpError(ApiErrorCode.FORBIDDEN, "userEmail must match authenticated user", { status: 403 })
    }
    const result = service.upsertUserToken(userEmail, gmailEmail, tokens as GmailTokenPayload)
    res.json(success({ stored: true, ...result }))
  })

  router.post("/accounts/:gmailEmail/revoke", (req, res) => {
    const gmailEmail = req.params.gmailEmail
    const emailSchema = z.string().email()
    const parsed = emailSchema.safeParse(gmailEmail)
    if (!parsed.success) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "Invalid gmailEmail format", {
        status: 400,
        details: parsed.error.flatten()
      })
    }
    service.revokeByGmailEmail(parsed.data)
    res.json(success({ revoked: true, gmailEmail: parsed.data }))
  })

  router.post(
    "/ingest",
    asyncHandler(async (_req, res) => {
      const results = await ingest.ingestAll()
      res.json(success({ results }))
    })
  )

  router.get(
    "/ingest/status",
    asyncHandler(async (_req, res) => {
      const lastSyncTime = ingest.getLastSyncTime()
      const stats = ingest.getStats()
      res.json(success({ lastSyncTime, stats }))
    })
  )

  return router
}
