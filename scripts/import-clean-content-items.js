#!/usr/bin/env node

/**
 * Import cleaned content items directly into SQLite database.
 * This script handles the simplified schema (migration 005) without user_id and visibility.
 *
 * Usage:
 *   node scripts/import-clean-content-items.js --input data/content-items/content-items-clean.json \
 *     --db infra/sqlite/jobfinder.db --user-email your@email.com [--dry-run]
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const map = new Map()
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        map.set(arg, true)
      } else {
        map.set(arg, next)
        i += 1
      }
    }
  }
  return {
    input: map.get('--input') ?? path.resolve(__dirname, '../data/content-items/content-items-clean.json'),
    dbPath: map.get('--db') ?? path.resolve(__dirname, '../infra/sqlite/jobfinder.db'),
    userEmail: map.get('--user-email') ?? 'admin@jobfinder.dev',
    dryRun: map.has('--dry-run')
  }
}

function loadCleanRecords(filePath) {
  const absolutePath = path.resolve(filePath)
  console.log(`[import] Loading from ${absolutePath}`)
  const raw = readFileSync(absolutePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`Input must be an array. Received ${typeof parsed}`)
  }
  return parsed
}

function countItems(items) {
  let count = items.length
  for (const item of items) {
    if (Array.isArray(item.children)) {
      count += countItems(item.children)
    }
  }
  return count
}

function insertItems(db, items, parentId = null, userEmail = 'admin@jobfinder.dev') {
  const now = new Date().toISOString()

  const insertStmt = db.prepare(`
    INSERT INTO content_items (
      id,
      parent_id,
      order_index,
      title,
      role,
      location,
      website,
      start_date,
      end_date,
      description,
      skills,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) VALUES (
      @id,
      @parentId,
      @orderIndex,
      @title,
      @role,
      @location,
      @website,
      @startDate,
      @endDate,
      @description,
      @skills,
      @createdAt,
      @updatedAt,
      @createdBy,
      @updatedBy
    )
  `)

  for (const item of items) {
    // Use existing ID or generate new UUID
    const itemId = item.id || randomUUID()

    // Prepare skills as JSON string if it's an array
    const skillsJson = Array.isArray(item.skills) && item.skills.length > 0
      ? JSON.stringify(item.skills)
      : null

    // Insert the item
    const payload = {
      id: itemId,
      parentId: parentId,
      orderIndex: item.order ?? 0,
      title: item.title || null,
      role: item.role || null,
      location: item.location || null,
      website: item.website || null,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      description: item.description || null,
      skills: skillsJson,
      createdAt: now,
      updatedAt: now,
      createdBy: userEmail,
      updatedBy: userEmail
    }

    try {
      insertStmt.run(payload)
      console.log(`  ✓ Inserted: ${item.title || item.role || itemId}`)
    } catch (error) {
      console.error(`  ✗ Failed to insert ${itemId}: ${error.message}`)
      throw error
    }

    // Recursively insert children
    if (Array.isArray(item.children) && item.children.length > 0) {
      insertItems(db, item.children, itemId, userEmail)
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  console.log('[import] Configuration:')
  console.log(`  Input:      ${options.input}`)
  console.log(`  Database:   ${options.dbPath}`)
  console.log(`  User Email: ${options.userEmail}`)
  console.log(`  Dry Run:    ${options.dryRun}`)
  console.log()

  // Load the clean data
  const items = loadCleanRecords(options.input)
  const totalCount = countItems(items)
  console.log(`[import] Found ${items.length} root items (${totalCount} total items)`)
  console.log()

  if (options.dryRun) {
    console.log('[dry-run] Would import the following structure:')
    const printStructure = (items, indent = '') => {
      for (const item of items) {
        console.log(`${indent}- ${item.title || item.role || item.id}`)
        if (Array.isArray(item.children)) {
          printStructure(item.children, indent + '  ')
        }
      }
    }
    printStructure(items)
    console.log()
    console.log('[dry-run] Complete. No changes made.')
    return
  }

  // Open database
  const db = new Database(path.resolve(options.dbPath))

  try {
    // Delete all existing records and insert new ones in a transaction
    console.log('[import] Starting database transaction...')
    db.transaction(() => {
      // Delete all existing items
      const deleteResult = db.prepare('DELETE FROM content_items').run()
      console.log(`[import] Deleted ${deleteResult.changes} existing items`)
      console.log()

      // Insert new items
      console.log('[import] Inserting new items:')
      insertItems(db, items, null, options.userEmail)
    })()

    console.log()
    console.log('[import] ✓ Import complete!')

    // Verify the import
    const count = db.prepare('SELECT COUNT(*) as count FROM content_items').get()
    console.log(`[import] Verification: ${count.count} items in database`)

  } catch (error) {
    console.error('[import] ✗ Import failed:', error.message)
    throw error
  } finally {
    db.close()
  }
}

main().catch(err => {
  console.error('[import] Fatal error:', err)
  process.exit(1)
})
