#!/usr/bin/env node
/**
 * Seed Personal Info to Firestore
 *
 * Creates the generator-documents/personal-info document with default personal information
 *
 * Usage:
 *   # Local emulator
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/seed-personal-info.ts
 *
 *   # Staging
 *   GOOGLE_CLOUD_PROJECT=static-sites-257923 DATABASE_ID=portfolio-staging npx tsx scripts/seed-personal-info.ts
 *
 *   # Production
 *   GOOGLE_CLOUD_PROJECT=static-sites-257923 DATABASE_ID=portfolio npx tsx scripts/seed-personal-info.ts
 */

import { Firestore } from "@google-cloud/firestore"

const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST
const DATABASE_ID = process.env.DATABASE_ID || "(default)"

console.log("🌱 Seeding Personal Info")
console.log("=======================")
console.log(`Environment: ${IS_EMULATOR ? "Emulator" : "Cloud"}`)
console.log(`Database ID: ${DATABASE_ID}`)
console.log("")

const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "static-sites-257923",
  databaseId: DATABASE_ID,
})

const DEFAULT_PERSONAL_INFO = {
  id: "personal-info",
  type: "personal-info",

  // Personal Information
  name: "Josh Wentworth",
  email: "contact@joshwentworth.com",
  phone: "",
  location: "Colorado, USA",

  // Online Presence
  website: "https://joshwentworth.com",
  github: "https://github.com/Jdubz",
  linkedin: "https://linkedin.com/in/jdubz",

  // Visual Branding
  avatar: "",
  logo: "",
  accentColor: "#3b82f6", // Blue

  // Metadata
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: "system-seed",
}

async function seedPersonalInfo() {
  try {
    const docRef = db.collection("generator-documents").doc("personal-info")
    const doc = await docRef.get()

    if (doc.exists) {
      console.log("⚠️  Warning: Personal info document already exists")
      console.log("   This will OVERWRITE the existing data")
      console.log("")
    } else {
      console.log("✓ No existing personal info found - creating new document")
      console.log("")
    }

    await docRef.set(DEFAULT_PERSONAL_INFO)

    console.log("✅ Successfully seeded personal info!")
    console.log("")
    console.log("Created document:")
    console.log(`  Collection: generator-documents`)
    console.log(`  Document ID: personal-info`)
    console.log(`  Name: ${DEFAULT_PERSONAL_INFO.name}`)
    console.log(`  Email: ${DEFAULT_PERSONAL_INFO.email}`)
    console.log("")
  } catch (error) {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  }
}

// Run seed
seedPersonalInfo()
  .then(() => {
    console.log("✓ Seed complete!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  })
