import type Database from "better-sqlite3"
import { createHash, randomUUID } from "node:crypto"
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
  // Legacy fields - kept for backward compatibility
  sessionToken?: string | null
  sessionExpiresAt?: string | null
  sessionExpiresAtMs?: number | null
}

export interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAtMs: number
  createdAt: string
  lastUsedAt: string
  userAgent?: string
  ipAddress?: string
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
  session_expires_at_ms: number | null
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
    sessionExpiresAt: row.session_expires_at,
    sessionExpiresAtMs: row.session_expires_at_ms ?? null
  }
}

export class UserRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  findByEmail(email: string): UserRecord | null {
    const row = this.db
      .prepare(
        [
          "SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at, session_token, session_expires_at, session_expires_at_ms",
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

  touchLastLogin(userId: string): void {
    this.db
      .prepare("UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(userId)
  }

  upsertUser(email: string, displayName?: string | null, avatarUrl?: string | null, roles: UserRole[] = ['viewer']): UserRecord {
    const existing = this.findByEmail(email)
    if (existing) {
      const nextDisplay = displayName === undefined ? existing.displayName ?? null : displayName
      const nextAvatar = avatarUrl === undefined ? existing.avatarUrl ?? null : avatarUrl
      this.db
        .prepare(
          "UPDATE users SET display_name = ?, avatar_url = ?, roles = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(nextDisplay, nextAvatar, roles.join(','), existing.id)
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

  // ============================================================================
  // Multi-session support (new user_sessions table)
  // ============================================================================

  /**
   * Create a new session for a user (supports multiple concurrent sessions)
   */
  createSession(
    userId: string,
    token: string,
    expiresAtMs: number,
    userAgent?: string,
    ipAddress?: string
  ): SessionRecord {
    const id = randomUUID()
    const hashed = this.hashToken(token)
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO user_sessions (id, user_id, token_hash, expires_at_ms, created_at, last_used_at, user_agent, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, userId, hashed, expiresAtMs, now, now, userAgent ?? null, ipAddress ?? null)

    return {
      id,
      userId,
      tokenHash: hashed,
      expiresAtMs,
      createdAt: now,
      lastUsedAt: now,
      userAgent,
      ipAddress,
    }
  }

  /**
   * Find user by session token (checks new user_sessions table first, falls back to legacy)
   */
  findBySessionToken(token: string): UserRecord | null {
    const hashed = this.hashToken(token)

    // Try new user_sessions table first
    const sessionRow = this.db
      .prepare(
        `SELECT s.user_id, s.expires_at_ms
         FROM user_sessions s
         WHERE s.token_hash = ?`
      )
      .get(hashed) as { user_id: string; expires_at_ms: number } | undefined

    if (sessionRow) {
      // Check if session is expired
      if (sessionRow.expires_at_ms < Date.now()) {
        // Clean up expired session
        this.db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashed)
        return null
      }

      // Update last_used_at
      this.db
        .prepare("UPDATE user_sessions SET last_used_at = datetime('now') WHERE token_hash = ?")
        .run(hashed)

      // Fetch user record
      const userRow = this.db
        .prepare(
          `SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at,
                  session_token, session_expires_at, session_expires_at_ms
           FROM users WHERE id = ?`
        )
        .get(sessionRow.user_id) as UserRow | undefined

      if (!userRow) return null
      return mapRow(userRow)
    }

    // Fallback to legacy session in users table (for backward compatibility)
    const row = this.db
      .prepare(
        `SELECT id, email, display_name, avatar_url, roles, created_at, updated_at, last_login_at,
                session_token, session_expires_at, session_expires_at_ms
         FROM users WHERE session_token = ?`
      )
      .get(hashed) as UserRow | undefined

    if (!row) return null

    // Expiry check for legacy sessions (same as user_sessions.expires_at_ms check)
    const expiryMs =
      row.session_expires_at_ms ?? (row.session_expires_at ? Date.parse(row.session_expires_at) : 0)
    if (expiryMs > 0 && expiryMs <= Date.now()) {
      // Clean up expired legacy session
      this.clearSession(row.id)
      return null
    }

    return mapRow(row)
  }

  /**
   * Delete a specific session by token
   */
  deleteSessionByToken(token: string): void {
    const hashed = this.hashToken(token)
    this.db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hashed)
  }

  /**
   * Clean up expired sessions (can be called periodically)
   */
  cleanupExpiredSessions(): number {
    const result = this.db
      .prepare("DELETE FROM user_sessions WHERE expires_at_ms < ?")
      .run(Date.now())
    return result.changes
  }

  /** @deprecated Use deleteSessionByToken instead */
  clearSession(userId: string): void {
    this.db
      .prepare(
        "UPDATE users SET session_token = NULL, session_expires_at = NULL, session_expires_at_ms = NULL, updated_at = datetime('now') WHERE id = ?"
      )
      .run(userId)
  }
}
