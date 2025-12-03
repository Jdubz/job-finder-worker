#!/usr/bin/env node
/**
 * One-off migration: consolidate configs in job_finder_config.
 * - Merge queue-settings into worker-settings.runtime
 * - Move title-filter keywords into prefilter-policy.title (if missing)
 * - Normalize legacy prefilter fields (ageStrike -> freshness.maxAgeDays, remotePolicy -> workArrangement, hardRejections.minSalaryFloor -> salary.minimum, technologyRanks rank fail -> technology.rejected)
 * - Delete legacy rows: queue-settings, title-filter, scoring-config, scheduler-settings
 *
 * Usage: NODE_ENV=production node scripts/migrate-configs.js /srv/job-finder/data/jobfinder.db
 */

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

function log(msg, obj) {
  if (obj !== undefined) {
    console.log(msg, JSON.stringify(obj, null, 2))
  } else {
    console.log(msg)
  }
}

function backup(dbPath) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')
  const dest = `${dbPath}.${ts}.bak`
  fs.copyFileSync(dbPath, dest)
  log(`Backup written to ${dest}`)
}

function getConfig(db, id) {
  const row = db.prepare('SELECT payload_json FROM job_finder_config WHERE id = ?').get(id)
  if (!row) return null
  return JSON.parse(row.payload_json)
}

function upsertConfig(db, id, payload) {
  db.prepare(
    `INSERT INTO job_finder_config (id, payload_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`
  ).run(id, JSON.stringify(payload))
}

function deleteConfig(db, id) {
  db.prepare('DELETE FROM job_finder_config WHERE id = ?').run(id)
}

function normalizePrefilter(prefilter, titleKeywords) {
  const out = { ...prefilter }

  // title
  if (!out.title) {
    out.title = titleKeywords || { requiredKeywords: [], excludedKeywords: [] }
  }

  // freshness from strikeEngine.ageStrike
  const ageStrike = prefilter?.strikeEngine?.ageStrike
  if (!out.freshness) {
    const maxAgeDays = ageStrike?.rejectDays ?? ageStrike?.strikeDays ?? null
    if (maxAgeDays !== null && maxAgeDays !== undefined) {
      out.freshness = { maxAgeDays }
    }
  }

  // work arrangement from remotePolicy
  const rp = prefilter?.strikeEngine?.remotePolicy
  if (!out.workArrangement && rp) {
    out.workArrangement = {
      allowRemote: rp.allowRemote ?? true,
      allowHybrid: rp.allowHybridInTimezone ?? true,
      allowOnsite: rp.allowOnsite ?? true,
    }
  }

  // employment type (defaults permissive)
  if (!out.employmentType) {
    out.employmentType = { allowFullTime: true, allowPartTime: true, allowContract: true }
  }

  // salary minimum from hardRejections.minSalaryFloor
  const minSalary = prefilter?.strikeEngine?.hardRejections?.minSalaryFloor
  if (!out.salary) {
    out.salary = { minimum: minSalary ?? null }
  }

  // technology.rejected from technologyRanks rank fail
  if (!out.technology) {
    const rejected = []
    const ranks = prefilter?.technologyRanks?.technologies
    if (ranks && typeof ranks === 'object') {
      for (const [tech, cfg] of Object.entries(ranks)) {
        if (cfg && (cfg.rank === 'fail')) {
          rejected.push(tech)
        }
      }
    }
    out.technology = { rejected }
  }

  return out
}

function mergeQueueIntoWorker(worker, queue) {
  const runtime = {
    processingTimeoutSeconds: queue?.processingTimeoutSeconds ?? worker.runtime?.processingTimeoutSeconds ?? 1800,
    isProcessingEnabled: queue?.isProcessingEnabled ?? worker.runtime?.isProcessingEnabled ?? true,
    taskDelaySeconds: queue?.taskDelaySeconds ?? worker.runtime?.taskDelaySeconds ?? 1,
    pollIntervalSeconds: queue?.pollIntervalSeconds ?? worker.runtime?.pollIntervalSeconds ?? 60,
    scrapeConfig: queue?.scrapeConfig ?? worker.runtime?.scrapeConfig ?? {},
  }
  return { ...worker, runtime }
}

function main() {
  const dbPath = process.argv[2]
  if (!dbPath) {
    console.error('Usage: node scripts/migrate-configs.js /path/to/jobfinder.db')
    process.exit(1)
  }
  const absPath = path.resolve(dbPath)
  backup(absPath)

  const db = new Database(absPath)
  db.pragma('journal_mode = wal')

  const queue = getConfig(db, 'queue-settings')
  const worker = getConfig(db, 'worker-settings') || {}
  const title = getConfig(db, 'title-filter')
  const prefilter = getConfig(db, 'prefilter-policy') || {}

  // migrate prefilter
  const titleKeywords = title || prefilter.title
  const newPrefilter = normalizePrefilter(prefilter, titleKeywords)
  upsertConfig(db, 'prefilter-policy', newPrefilter)

  // merge queue into worker.runtime
  if (queue || !worker.runtime) {
    const merged = mergeQueueIntoWorker(worker, queue)
    upsertConfig(db, 'worker-settings', merged)
  }

  // delete legacy rows
  ['queue-settings', 'title-filter', 'scoring-config', 'scheduler-settings'].forEach((id) =>
    deleteConfig(db, id)
  )

  log('Migration complete.')
}

main()
