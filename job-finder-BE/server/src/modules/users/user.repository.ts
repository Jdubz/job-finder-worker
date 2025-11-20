import type Database from "better-sqlite3"
import { getDb } from "../../db/sqlite"

export type UserRole = string

export interface UserRecord {
  id: string
  email: string
  displayName?: string
  avatarUrl?: string
  roles: UserRole[]
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}

type UserRow = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  roles: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
}

function parseRoles(value: string | null): UserRole[] {
  if (!value) {
    return []
  }
  return value
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0)
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    roles: parseRoles(row.roles),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? undefined
  }
}

export class UserRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  findByEmail(email: string): UserRecord | null {
    const row = this.db
      .prepare(
        [
          "SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at",
          "FROM users",
          "WHERE lower(email) = lower(?)"
        ].join(" ")
      )
      .get(email) as UserRow | undefined

    if (!row) {
      return null
    }

    return mapRow(row)
  }

  findFirstAdmin(): UserRecord | null {
    const row = this.db
      .prepare(
        [
          "SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at",
          "FROM users",
          "WHERE instr(lower(ifnull(roles, '')), 'admin') > 0",
          "ORDER BY created_at ASC",
          "LIMIT 1"
        ].join(" ")
      )
      .get() as UserRow | undefined

    if (!row) {
      return null
    }

    return mapRow(row)
  }

  touchLastLogin(userId: string): void {
    this.db
      .prepare("UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(userId)
  }
}
