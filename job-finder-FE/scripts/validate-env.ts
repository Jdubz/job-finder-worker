#!/usr/bin/env tsx
/**
 * Environment Variable Validation Script
 *
 * Validates that all required environment variables are present for the current MODE.
 * Run with: npm run check:env
 */

import * as fs from 'fs'
import * as path from 'path'

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

const OPTIONAL_VARS = [
  'VITE_API_BASE_URL',
  'VITE_USE_EMULATORS',
  'VITE_EMULATOR_HOST',
  'VITE_ENVIRONMENT',
  'VITE_ENABLE_ANALYTICS',
]

const MODE = process.env.NODE_ENV || 'development'

function checkEnvFile(envPath: string): { missing: string[], present: string[] } {
  const missing: string[] = []
  const present: string[] = []

  if (!fs.existsSync(envPath)) {
    console.error(`❌ Environment file not found: ${envPath}`)
    return { missing: REQUIRED_VARS, present: [] }
  }

  const envContent = fs.readFileSync(envPath, 'utf-8')
  const envLines = envContent.split('\n')
  const envVars: Record<string, string> = {}

  // Parse .env file
  for (const line of envLines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim()
      }
    }
  }

  // Check required vars
  for (const varName of REQUIRED_VARS) {
    const value = envVars[varName]
    if (!value || value.includes('your_') || value.includes('_here')) {
      missing.push(varName)
    } else {
      present.push(varName)
    }
  }

  return { missing, present }
}

function main() {
  console.log('🔍 Environment Variable Validation')
  console.log('=' . repeat(50))
  console.log(`Mode: ${MODE}`)
  console.log('')

  // Determine which env file to check
  const envFiles = [
    '.env',
    '.env.local',
    `.env.${MODE}`,
    `.env.${MODE}.local`,
  ]

  let foundEnv = false
  const allMissing: string[] = []

  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile)
    if (fs.existsSync(envPath)) {
      foundEnv = true
      console.log(`📄 Checking ${envFile}...`)

      const { missing, present } = checkEnvFile(envPath)

      if (present.length > 0) {
        console.log(`✅ Found ${present.length} required variables`)
        for (const varName of present) {
          console.log(`   ✓ ${varName}`)
        }
      }

      if (missing.length > 0) {
        console.log(`❌ Missing ${missing.length} required variables`)
        for (const varName of missing) {
          console.log(`   ✗ ${varName}`)
          if (!allMissing.includes(varName)) {
            allMissing.push(varName)
          }
        }
      }

      console.log('')
    }
  }

  if (!foundEnv) {
    console.error('❌ No environment files found!')
    console.error('💡 Copy .env.template to .env.development and fill in the values')
    console.error('   cp .env.template .env.development')
    process.exit(1)
  }

  // Show summary
  console.log('=' .repeat(50))
  if (allMissing.length === 0) {
    console.log('✅ All required environment variables are configured')
    console.log('')
    console.log('📋 Optional variables you may want to configure:')
    for (const varName of OPTIONAL_VARS) {
      console.log(`   • ${varName}`)
    }
    process.exit(0)
  } else {
    console.log(`❌ ${allMissing.length} required variables are missing or need configuration`)
    console.log('')
    console.log('💡 To fix this:')
    console.log('   1. Check .env.template for required variables')
    console.log('   2. Get Firebase config from Firebase Console:')
    console.log('      https://console.firebase.google.com/project/static-sites-257923/settings/general')
    console.log('   3. Add missing variables to your .env file')
    process.exit(1)
  }
}

main()
