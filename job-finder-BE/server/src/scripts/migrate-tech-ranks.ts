import path from 'node:path'
import sqlite3 from 'better-sqlite3'

type TechRankValue = number | { rank?: string; points?: number; mentions?: number }

const DB_PATH =
  process.env.JF_SQLITE_DB_PATH ??
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')

function loadConfig(db: sqlite3.Database, id: string) {
  return db.prepare('SELECT payload_json, updated_at, updated_by, name FROM job_finder_config WHERE id = ?').get(id) as
    | { payload_json: string; updated_at: string; updated_by?: string | null; name?: string | null }
    | undefined
}

function saveConfig(
  db: sqlite3.Database,
  id: string,
  payload: unknown,
  meta: { updatedBy?: string | null; name?: string | null }
) {
  db.prepare(
    `UPDATE job_finder_config
     SET payload_json = ?, updated_at = ?, updated_by = ?, name = ?
     WHERE id = ?`
  ).run(JSON.stringify(payload), new Date().toISOString(), meta.updatedBy ?? null, meta.name ?? null, id)
}

function convertTechnologyRanks(payload: Record<string, TechRankValue>) {
  const incomingTechs = (payload.technologies ?? {}) as Record<string, TechRankValue>
  const normalizedTechs: Record<string, { rank: 'required' | 'ok' | 'strike' | 'fail'; points?: number; mentions?: number }> = {}

  for (const [name, value] of Object.entries(incomingTechs)) {
    if (typeof value === 'number') {
      normalizedTechs[name] = { rank: 'ok', points: value }
      continue
    }
    if (typeof value === 'object' && value !== null) {
      const rank =
        typeof value.rank === 'string' && ['required', 'ok', 'strike', 'fail'].includes(value.rank)
          ? (value.rank as 'required' | 'ok' | 'strike' | 'fail')
          : 'ok'
      normalizedTechs[name] = {
        rank,
        ...(typeof value.points === 'number' ? { points: value.points } : {}),
        ...(typeof value.mentions === 'number' ? { mentions: value.mentions } : {}),
      }
    }
  }

  const strikes = (payload.strikes ?? {}) as Record<string, unknown>
  const normalizedStrikes = {
    missingAllRequired:
      typeof strikes.missingAllRequired === 'number' ? strikes.missingAllRequired : 1,
    perBadTech: typeof strikes.perBadTech === 'number' ? strikes.perBadTech : 2,
  }

  const changedTechs = Object.entries(incomingTechs).some(([, v]) => {
    if (typeof v === 'number') return true
    if (typeof v === 'object' && v !== null) {
      const rankValid = typeof (v as { rank?: unknown }).rank === 'string' &&
        ['required', 'ok', 'strike', 'fail'].includes((v as { rank?: string }).rank ?? '')
      return !rankValid
    }
    return false
  })

  const changed =
    changedTechs ||
    normalizedStrikes.perBadTech !== strikes.perBadTech ||
    normalizedStrikes.missingAllRequired !== strikes.missingAllRequired

  return {
    changed,
    payload: {
      technologies: normalizedTechs,
      strikes: normalizedStrikes,
      extractedFromJobs: payload.extractedFromJobs,
      version: payload.version,
    },
  }
}

function main() {
  const db = sqlite3(DB_PATH)
  const row = loadConfig(db, 'technology-ranks')
  if (!row) {
    console.log('[migrate-tech-ranks] No technology-ranks config found; nothing to do.')
    db.close()
    return
  }

  const parsed = JSON.parse(row.payload_json) as Record<string, TechRankValue>
  const { changed, payload } = convertTechnologyRanks(parsed)
  if (!changed) {
    console.log('[migrate-tech-ranks] technology-ranks already in latest shape; no update needed.')
    db.close()
    return
  }

  saveConfig(db, 'technology-ranks', payload, {
    updatedBy: row.updated_by ?? 'migration-tech-ranks',
    name: row.name ?? 'Technology Ranks',
  })
  db.close()
  console.log('[migrate-tech-ranks] technology-ranks record updated to latest schema.')
}

main()
