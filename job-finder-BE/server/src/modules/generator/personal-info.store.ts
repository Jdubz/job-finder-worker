import type { PersonalInfo } from '@shared/types'
import { ConfigRepository } from '../config/config.repository'

const PERSONAL_INFO_ID = 'personal-info'

function isPersonalInfo(payload: unknown): payload is PersonalInfo {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const candidate = payload as Partial<PersonalInfo>
  return typeof candidate.name === 'string' && typeof candidate.email === 'string'
}

function assertPersonalInfo(payload: Partial<PersonalInfo>): asserts payload is PersonalInfo {
  if (!payload.name || !payload.email) {
    throw new Error('Personal info must include name and email')
  }
}

export class PersonalInfoStore {
  private repo = new ConfigRepository()

  async get(): Promise<PersonalInfo | null> {
    const record = this.repo.get<PersonalInfo>(PERSONAL_INFO_ID)
    if (!record) {
      return null
    }
    return isPersonalInfo(record.payload) ? record.payload : null
  }

  async update(updates: Partial<PersonalInfo>): Promise<PersonalInfo> {
    const existing = (await this.get()) ?? {}
    const merged = { ...existing, ...updates }
    assertPersonalInfo(merged)
    return this.repo.upsert<PersonalInfo>(PERSONAL_INFO_ID, merged).payload
  }
}
