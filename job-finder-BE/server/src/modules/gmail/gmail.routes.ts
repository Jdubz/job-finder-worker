import { Router } from "express"
import { z } from "zod"
import { success } from "../../utils/api-response"
import { ApiHttpError } from "../../middleware/api-error"
import { ApiErrorCode } from "@shared/types"
import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { exchangeAuthCode } from "./gmail-oauth"
import { GmailIngestService } from "./gmail-ingest.service"

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

  router.get("/accounts", (_req, res) => {
    const accounts = service.listAccounts()
    res.json(success({ accounts }))
  })

  router.post("/oauth/exchange", async (req, res) => {
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
    const tokenResponse = await exchangeAuthCode({ code, redirectUri, clientId, clientSecret })

    if (!tokenResponse.refresh_token) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "OAuth response missing refresh_token", {
        status: 400
      })
    }

    const gmailAddress = gmailEmail ?? userEmail
    service.upsertUserToken(userEmail, gmailAddress, {
      refresh_token: tokenResponse.refresh_token,
      access_token: tokenResponse.access_token,
      scope: tokenResponse.scope,
      token_type: tokenResponse.token_type,
      expiry_date: Date.now() + tokenResponse.expires_in * 1000
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

  router.post("/oauth/store", (req, res) => {
    const parsed = StoreSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "Invalid OAuth payload", {
        status: 400,
        details: parsed.error.flatten()
      })
    }

    const { userEmail, gmailEmail, tokens } = parsed.data
    const result = service.upsertUserToken(userEmail, gmailEmail, tokens as GmailTokenPayload)
    res.json(success({ stored: true, ...result }))
  })

  router.post("/accounts/:gmailEmail/revoke", (req, res) => {
    const gmailEmail = req.params.gmailEmail
    if (!gmailEmail) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "gmailEmail is required", { status: 400 })
    }
    service.revokeByGmailEmail(gmailEmail)
    res.json(success({ revoked: true, gmailEmail }))
  })

  router.post("/ingest", async (_req, res) => {
    const results = await ingest.ingestAll()
    res.json(success({ results }))
  })

  return router
}
