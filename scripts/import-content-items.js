#!/usr/bin/env node

/**
 * Import content items from JSON export file via the API
 *
 * Usage: node scripts/import-content-items.js [path-to-json]
 *
 * Requires the dev server to be running on port 8080
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_EXPORT_PATH = join(__dirname, '../data/content-items/content-items-export.json')

const API_BASE = process.env.API_BASE || 'http://localhost:8080/api'
const AUTH_TOKEN = 'dev-admin-token'
const USER_EMAIL = 'dev-admin@jobfinder.dev'

async function apiRequest(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }
  return response.json()
}

function flattenItems(items, parentId = null) {
  const result = []
  for (const item of items) {
    const { children, visibility, ...data } = item

    // Map fields - some items use 'role' for the main title when no 'title' exists
    const mapped = {
      parentId,
      order: data.order ?? 0,
      title: data.title || data.name || null,
      role: data.role || data.position || null,
      location: data.location || null,
      website: data.website || data.url || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      description: data.description || data.summary || data.biography || data.bio || null,
      skills: Array.isArray(data.skills) ? data.skills : null
    }

    // Remove null fields
    Object.keys(mapped).forEach(key => {
      if (mapped[key] === null || mapped[key] === undefined) {
        delete mapped[key]
      }
    })

    result.push({ legacyId: data.id, data: mapped })

    if (children && children.length > 0) {
      result.push(...flattenItems(children, data.id))
    }
  }
  return result
}

async function deleteAllItems() {
  console.log('Fetching existing items...')
  const response = await apiRequest('GET', '/content-items?limit=200')
  const items = response.data?.items || []

  // Flatten to get all IDs (including nested)
  const allIds = []
  const collectIds = (nodes) => {
    for (const node of nodes) {
      allIds.push(node.id)
      if (node.children?.length) {
        collectIds(node.children)
      }
    }
  }
  collectIds(items)

  console.log(`Deleting ${allIds.length} existing items...`)
  for (const id of allIds) {
    try {
      await apiRequest('DELETE', `/content-items/${id}`)
      process.stdout.write('.')
    } catch (err) {
      console.warn(`\nFailed to delete ${id}: ${err.message}`)
    }
  }
  console.log('\nDeletion complete.')
}

async function importItems(flatItems) {
  console.log(`Creating ${flatItems.length} items...`)

  // Map legacy IDs to new IDs
  const idMap = new Map()

  // Sort: parents first (no parentId), then children
  const sorted = flatItems.sort((a, b) => {
    const aHasParent = a.data.parentId ? 1 : 0
    const bHasParent = b.data.parentId ? 1 : 0
    return aHasParent - bHasParent
  })

  let created = 0
  let failed = 0

  for (const item of sorted) {
    try {
      // Resolve parent ID from legacy to new
      let resolvedParentId = null
      if (item.data.parentId) {
        resolvedParentId = idMap.get(item.data.parentId)
        if (!resolvedParentId) {
          console.warn(`\nWarning: Parent ${item.data.parentId} not found for item ${item.legacyId}`)
        }
      }

      const payload = {
        itemData: {
          ...item.data,
          parentId: resolvedParentId
        },
        userEmail: USER_EMAIL
      }

      const response = await apiRequest('POST', '/content-items', payload)
      const newId = response.data?.item?.id

      if (newId) {
        idMap.set(item.legacyId, newId)
        created++
        process.stdout.write('.')
      } else {
        console.warn(`\nNo ID returned for ${item.legacyId}`)
        failed++
      }
    } catch (err) {
      console.error(`\nFailed to create item ${item.legacyId}: ${err.message}`)
      failed++
    }
  }

  console.log(`\n\nImport complete: ${created} created, ${failed} failed`)
}

async function main() {
  const exportPath = process.argv[2] || DEFAULT_EXPORT_PATH

  console.log(`Reading export file: ${exportPath}`)
  const content = readFileSync(exportPath, 'utf-8')
  const data = JSON.parse(content)

  console.log(`Found ${data.length} root items`)

  const flatItems = flattenItems(data)
  console.log(`Flattened to ${flatItems.length} total items`)

  // Show sample of what will be imported
  console.log('\nSample items:')
  flatItems.slice(0, 3).forEach(item => {
    console.log(`  - ${item.data.title || item.data.role || '(no title)'}: ${item.data.description?.slice(0, 50)}...`)
  })

  await deleteAllItems()
  await importItems(flatItems)

  // Verify
  console.log('\nVerifying import...')
  const verifyResponse = await apiRequest('GET', '/content-items?limit=200')
  const verifyItems = verifyResponse.data?.items || []

  let rootCount = verifyItems.length
  let childCount = 0
  const countChildren = (nodes) => {
    for (const node of nodes) {
      if (node.children?.length) {
        childCount += node.children.length
        countChildren(node.children)
      }
    }
  }
  countChildren(verifyItems)

  console.log(`Verification: ${rootCount} roots, ${childCount} children (${rootCount + childCount} total)`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
