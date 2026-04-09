import { Router } from "express"
import { z } from "zod"
import { success } from "../../utils/api-response"
import { ApiHttpError } from "../../middleware/api-error"
import { ApiErrorCode } from "@shared/types"
import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"
import { exchangeAuthCode } from "./gmail-oauth"
import { ApplicationTrackerService } from "./application-tracker.service"
import { ApplicationEmailRepository } from "./application-email.repository"
import { asyncHandler } from "../../utils/async-handler"
import type { AuthenticatedRequest } from "../../middleware/session-auth"

const service = new GmailAuthService()
const tracker = new ApplicationTrackerService()
const emailRepo = new ApplicationEmailRepository()

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

  router.post(
    "/oauth/exchange",
    asyncHandler(async (req, res) => {
      const schema = z.object({
        code: z.string().min(1),
        redirectUri: z.union([z.literal("postmessage"), z.string().url()]),
        userEmail: z.string().email(),
        gmailEmail: z.string().email().optional()
      })

      const parsed = schema.safeParse(req.body)
      if (!parsed.success) {
        throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, "Invalid OAuth exchange payload", {
          status: 400,
          details: parsed.error.flatten()
        })
      }

      const { code, redirectUri, userEmail, gmailEmail } = parsed.data
      const authed = (req as AuthenticatedRequest).user
      if (!authed || authed.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ApiHttpError(ApiErrorCode.FORBIDDEN, "userEmail must match authenticated user", { status: 403 })
      }
      const tokenResponse = await exchangeAuthCode({ code, redirectUri })

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

  router.post("/oauth/store", asyncHandler(async (req, res) => {
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
  }))

  router.post("/accounts/:gmailEmail/revoke", asyncHandler(async (req, res) => {
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
  }))

  // ---- Application Tracker Routes ----

  router.post(
    "/tracker/scan",
    asyncHandler(async (req, res) => {
      const authed = (req as AuthenticatedRequest).user
      const scanSchema = z.object({
        days: z.coerce.number().int().min(1).max(365).optional()
      })
      const opts = scanSchema.parse(req.body ?? {})
      const results = await tracker.scanAll(authed?.email, opts)
      res.json(success({ results }))
    })
  )

  router.get(
    "/tracker/emails",
    asyncHandler(async (req, res) => {
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).default(0)
      }).parse(req.query)
      const emails = emailRepo.listAll(query)
      res.json(success({ emails }))
    })
  )

  router.get(
    "/tracker/emails/unlinked",
    asyncHandler(async (_req, res) => {
      const emails = emailRepo.listUnlinked()
      res.json(success({ emails }))
    })
  )

  router.post(
    "/tracker/emails/:id/link",
    asyncHandler(async (req, res) => {
      const { matchId } = z.object({ matchId: z.string().min(1) }).parse(req.body)
      const updated = emailRepo.linkToMatch(req.params.id, matchId)
      if (!updated) {
        throw new ApiHttpError(ApiErrorCode.NOT_FOUND, "Application email or target match not found", { status: 404 })
      }
      res.json(success({ email: updated }))
    })
  )

  router.post(
    "/tracker/emails/:id/unlink",
    asyncHandler(async (req, res) => {
      const updated = emailRepo.unlinkFromMatch(req.params.id)
      if (!updated) {
        throw new ApiHttpError(ApiErrorCode.NOT_FOUND, "Application email not found", { status: 404 })
      }
      res.json(success({ email: updated }))
    })
  )

  return router
}
