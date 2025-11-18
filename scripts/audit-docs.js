#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const ignorePatterns = ['/archive/', '/templates/']

function shouldIgnore(filePath) {
  return ignorePatterns.some((pattern) => filePath.includes(pattern))
}

function listDocs() {
  const output = execSync("find docs -type f -name '*.md'", {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim()

  if (!output) return []
  return output.split('\n').filter((filePath) => !shouldIgnore(filePath))
}

function hasMetadata(content) {
  const lines = content.split('\n')
  const nonEmptyLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    nonEmptyLines.push(trimmed)
    if (nonEmptyLines.length >= 6) break
  }

  if (!nonEmptyLines.length) return false

  if (nonEmptyLines[0].startsWith('---')) {
    // YAML front matter counts as metadata
    return true
  }

  const required = ['> Status:', '> Owner:', '> Last Updated:']
  return required.every((token) =>
    nonEmptyLines.some((line) => line.startsWith(token))
  )
}

const files = listDocs()
const missingMetadata = []

for (const relativePath of files) {
  const absolutePath = path.join(rootDir, relativePath)
  const content = readFileSync(absolutePath, 'utf8')
  if (!hasMetadata(content)) {
    missingMetadata.push(relativePath)
  }
}

if (!missingMetadata.length) {
  console.log('[docs:audit] All docs have metadata blocks. ✅')
  process.exit(0)
}

console.log('[docs:audit] Missing metadata in:')
for (const filePath of missingMetadata) {
  console.log(` - ${filePath}`)
}

process.exit(1)
