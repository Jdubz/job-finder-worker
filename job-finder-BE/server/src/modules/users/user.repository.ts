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
  sessionToken?: string | null
  sessionExpiresAt?: string | null
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
  session_token: string | null
  session_expires_at: string | null
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
    lastLoginAt: row.last_login_at ?? undefined,
    sessionToken: row.session_token,
    sessionExpiresAt: row.session_expires_at
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
          "SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at, session_token, session_expires_at",
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
          "SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at, session_token, session_expires_at",
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

  upsertUser(email: string, displayName?: string | null, avatarUrl?: string | null, roles: UserRole[] = ['viewer']): UserRecord {
    const existing = this.findByEmail(email)
    if (existing) {
      this.db
        .prepare(
          "UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), roles = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(displayName ?? null, avatarUrl ?? null, roles.join(','), existing.id)
      return this.findByEmail(email) as UserRecord
    }

    const id = email
    const now = new Date().toISOString()
    this.db
      .prepare(
        "INSERT INTO users (id, email, display_name, avatar_url, roles, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, email, displayName ?? null, avatarUrl ?? null, roles.join(','), now, now)
    return this.findByEmail(email) as UserRecord
  }

  saveSession(userId: string, token: string, expiresAt: string): void {
    this.db
      .prepare("UPDATE users SET session_token = ?, session_expires_at = ?, updated_at = datetime('now') WHERE id = ?")
      .run(token, expiresAt, userId)
  }

  findBySessionToken(token: string): UserRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at, session_token, session_expires_at FROM users WHERE session_token = ?"
      )
      .get(token) as UserRow | undefined
    if (!row) return null
    return mapRow(row)
  }
}
