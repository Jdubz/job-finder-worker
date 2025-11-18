#!/usr/bin/env node

/**
 * Runs unit/integration tests for workspaces that have staged changes.
 * Workspaces are detected via the root package.json `workspaces` list.
 * For each touched workspace we run `test:unit` and `test:integration`
 * if the scripts exist in that package.json.
 */

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const rootPkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const workspacePaths = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : []

const extraTargets = [
  {
    path: 'job-finder-worker',
    commands: [
      {
        label: 'pytest (ci subset)',
        command: 'make test-ci',
      },
    ],
  },
]

function run(cmd, options = {}) {
  execSync(cmd, {
    stdio: 'inherit',
    cwd: options.cwd ?? rootDir,
    env: options.env ?? process.env,
  })
}

function runGit(command) {
  try {
    return execSync(command, { encoding: 'utf8', cwd: rootDir }).trim()
  } catch {
    return ''
  }
}

function splitLines(value) {
  if (!value) return []
  return value.split('\n').filter(Boolean)
}

function getChangedFiles() {
  const staged = splitLines(runGit('git diff --cached --name-only'))
  if (staged.length) {
    return staged
  }

  const upstream = runGit('git rev-parse --abbrev-ref --symbolic-full-name @{u}')
  if (upstream) {
    const upstreamDiff = splitLines(runGit(`git diff --name-only ${upstream}...HEAD`))
    if (upstreamDiff.length) {
      console.log(`[tests] No staged files; running tests for changes since ${upstream}.`)
      return upstreamDiff
    }
  }

  const lastCommitDiff = splitLines(runGit('git diff --name-only HEAD~1 HEAD'))
  if (lastCommitDiff.length) {
    console.log('[tests] No staged files; falling back to last commit diff.')
    return lastCommitDiff
  }

  return []
}

const stagedFiles = getChangedFiles()

if (!stagedFiles.length) {
  console.log('[tests] No staged files; skipping staged test run.')
  process.exit(0)
}

const workspaceInfo = workspacePaths.reduce((acc, workspacePath) => {
  const pkgPath = path.join(rootDir, workspacePath, 'package.json')

  if (existsSync(pkgPath)) {
    try {
      const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'))
      acc.set(workspacePath, pkgJson)
    } catch (error) {
      console.warn(`[tests] Failed to parse ${pkgPath}:`, error)
    }
  }

  return acc
}, new Map())

function fileBelongsTo(basePath, filePath) {
  return filePath === basePath || filePath.startsWith(`${basePath}/`)
}

function findWorkspace(filePath) {
  return workspacePaths.find((workspacePath) => fileBelongsTo(workspacePath, filePath))
}

const touchedWorkspaces = new Set()
const touchedExtras = new Set()
for (const filePath of stagedFiles) {
  const workspacePath = findWorkspace(filePath)
  if (workspacePath && workspaceInfo.has(workspacePath)) {
    touchedWorkspaces.add(workspacePath)
    continue
  }

  for (const extra of extraTargets) {
    if (fileBelongsTo(extra.path, filePath)) {
      touchedExtras.add(extra.path)
    }
  }
}

if (!touchedWorkspaces.size && !touchedExtras.size) {
  console.log('[tests] No staged files belong to known workspaces/targets; skipping staged test run.')
  process.exit(0)
}

let workspaceTestsRan = false

for (const workspacePath of touchedWorkspaces) {
  const pkgJson = workspaceInfo.get(workspacePath)
  const scripts = pkgJson?.scripts ?? {}
  const testScripts = ['test:unit', 'test:integration'].filter(
    (scriptName) => Boolean(scripts[scriptName])
  )

  if (!testScripts.length) {
    console.log(`[tests] Workspace ${workspacePath} has no unit/integration test scripts; skipping.`)
    continue
  }

  for (const scriptName of testScripts) {
    console.log(`[tests] Running ${scriptName} for ${workspacePath}...`)
    run(`npm run ${scriptName} --workspace ${workspacePath}`)
    workspaceTestsRan = true
  }
}

if (!workspaceTestsRan) {
  console.log('[tests] No matching test scripts were executed for Node workspaces.')
}

let extraTestsRan = false

for (const extraPath of touchedExtras) {
  const targetConfig = extraTargets.find((target) => target.path === extraPath)
  if (!targetConfig) continue

  for (const { label, command } of targetConfig.commands) {
    console.log(`[tests] Running ${label} for ${extraPath}...`)
    run(command, { cwd: path.join(rootDir, extraPath) })
    extraTestsRan = true
  }
}

if (!workspaceTestsRan && !extraTestsRan) {
  console.log('[tests] No matching test scripts were executed.')
}
