import type { PersonalInfo } from '@shared/types'
import { UserConfigRepository } from '../user-config/user-config.repository'

const PERSONAL_INFO_ID = 'personal-info'

function isPersonalInfo(payload: unknown): payload is PersonalInfo {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const candidate = payload as Partial<PersonalInfo>
  return typeof candidate.name === 'string' && typeof candidate.email === 'string'
}

export class PersonalInfoStore {
  private repo = new UserConfigRepository()

  async get(userId: string): Promise<PersonalInfo | null> {
    const record = this.repo.get<PersonalInfo>(userId, PERSONAL_INFO_ID)
    if (!record) {
      return null
    }
    return isPersonalInfo(record.payload) ? record.payload : null
  }
}
