import { Router, type Request } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiErrorCode, type PersonalInfo } from '@shared/types'
import { PersonalInfoStore } from './personal-info.store'

const personalInfoSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  github: z.string().optional().nullable(),
  linkedin: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  summary: z.string().optional().nullable()
})

interface PersonalInfoStoreLike {
  get(): Promise<PersonalInfo | null>
  update(data: Partial<PersonalInfo>): Promise<PersonalInfo>
}

class InMemoryPersonalInfoStore implements PersonalInfoStoreLike {
  private state: PersonalInfo | null = null

  async get(): Promise<PersonalInfo | null> {
    return this.state
  }

  async update(data: Partial<PersonalInfo>): Promise<PersonalInfo> {
    this.state = { ...(this.state ?? ({} as PersonalInfo)), ...data }
    return this.state
  }
}

const personalInfoStore: PersonalInfoStoreLike =
  process.env.NODE_ENV === 'test' ? new InMemoryPersonalInfoStore() : new PersonalInfoStore()

function getUserEmail(req: Request): string | undefined {
  const maybeUser = (req as Request & { user?: { email?: string } }).user
  return maybeUser?.email ?? undefined
}

export function buildGeneratorApiRouter() {
  const router = Router()

  router.get(
    ["/personal-info", "/defaults"],
    asyncHandler(async (_req, res) => {
      const personalInfo = await personalInfoStore.get()
      if (!personalInfo) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, "Personal info not found"))
        return
      }
      res.json(success(personalInfo))
    })
  )

  router.put(
    ["/personal-info", "/defaults"],
    asyncHandler(async (req, res) => {
      const parsed = personalInfoSchema.parse(req.body ?? {})
      if (Object.keys(parsed).length === 0) {
        res.status(400).json(failure(ApiErrorCode.VALIDATION_ERROR, "No fields to update"))
        return
      }

      const email = getUserEmail(req) ?? "unknown"
      const update: Partial<PersonalInfo> & Record<string, unknown> = {}

      for (const [key, value] of Object.entries(parsed)) {
        update[key] = value ?? null
      }

      update.updatedAt = new Date().toISOString()
      update.updatedBy = email

      const updated = await personalInfoStore.update(update)

      res.json(success(updated))
    })
  )

  return router
}
