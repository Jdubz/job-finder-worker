import { Router } from "express"
import { z } from "zod"
import { success } from "../../utils/api-response"
import { ApiHttpError } from "../../middleware/api-error"
import { ApiErrorCode } from "@shared/types"
import { GmailAuthService, type GmailTokenPayload } from "./gmail-auth.service"

const service = new GmailAuthService()

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

  return router
}
