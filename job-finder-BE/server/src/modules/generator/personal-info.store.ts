import type { PersonalInfo } from '@shared/types'
import { ConfigRepository } from '../config/config.repository'

const PERSONAL_INFO_ID = 'personal-info'

export class PersonalInfoStore {
  private repo = new ConfigRepository()

  async get(): Promise<PersonalInfo | null> {
    const record = this.repo.get(PERSONAL_INFO_ID)
    if (!record) {
      return null
    }
    return record.payload as PersonalInfo
  }

  async update(updates: Partial<PersonalInfo> & Record<string, unknown>): Promise<PersonalInfo> {
    const existing = (await this.get()) ?? ({} as PersonalInfo)
    const merged = { ...existing, ...updates } as PersonalInfo
    this.repo.upsert(PERSONAL_INFO_ID, merged)
    return merged
  }
}
