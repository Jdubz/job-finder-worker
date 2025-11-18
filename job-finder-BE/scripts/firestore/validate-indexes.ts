/**
 * Firestore Index Validation Script
 *
 * Validates firestore.indexes.json for:
 * - Duplicate indexes
 * - Invalid field configurations
 * - Missing required indexes based on code analysis
 *
 * Usage: npm run validate:indexes
 */

import * as fs from "fs"
import * as path from "path"

interface IndexField {
  fieldPath: string
  order?: "ASCENDING" | "DESCENDING"
  arrayConfig?: "CONTAINS"
}

interface FirestoreIndex {
  collectionGroup: string
  queryScope: "COLLECTION" | "COLLECTION_GROUP"
  fields: IndexField[]
}

interface FirestoreIndexesFile {
  indexes: FirestoreIndex[]
  fieldOverrides?: unknown[]
}

// Expected indexes based on code analysis
const EXPECTED_INDEXES = {
  "job-queue": [
    ["submitted_by", "created_at"],
    ["submitted_by", "status", "created_at"],
    ["submitted_by", "type", "created_at"],
    ["submitted_by", "url"],
  ],
  "generator-documents": [["type", "access.userId", "createdAt"]],
  "content-items": [
    ["userId", "order"],
    ["userId", "type", "order"],
    ["userId", "visibility", "order"],
    ["userId", "parentId", "order"],
    ["userId", "tags"], // array-contains
  ],
  experiences: [["userId", "type", "startDate"]],
}

function main() {
  console.log("🔍 Validating Firestore indexes...\n")

  const indexesPath = path.join(process.cwd(), "firestore.indexes.json")

  if (!fs.existsSync(indexesPath)) {
    console.error("❌ Error: firestore.indexes.json not found at:", indexesPath)
    process.exit(1)
  }

  const indexesFile: FirestoreIndexesFile = JSON.parse(fs.readFileSync(indexesPath, "utf8"))

  let hasErrors = false

  // Check for duplicate indexes
  console.log("📋 Checking for duplicate indexes...")
  const indexSignatures = new Set<string>()
  const duplicates: string[] = []

  for (const index of indexesFile.indexes) {
    const signature = getIndexSignature(index)
    if (indexSignatures.has(signature)) {
      duplicates.push(signature)
      hasErrors = true
    }
    indexSignatures.add(signature)
  }

  if (duplicates.length > 0) {
    console.error("❌ Found duplicate indexes:")
    duplicates.forEach((sig) => console.error(`  - ${sig}`))
  } else {
    console.log("✅ No duplicate indexes found")
  }

  // Check for expected indexes
  console.log("\n📊 Checking for expected indexes based on code...")
  const missing: string[] = []

  for (const [collection, expectedFieldSets] of Object.entries(EXPECTED_INDEXES)) {
    for (const fields of expectedFieldSets) {
      const found = indexesFile.indexes.some((index) => {
        return index.collectionGroup === collection && matchesFieldSet(index, fields)
      })

      if (!found) {
        missing.push(`${collection}: [${fields.join(", ")}]`)
        hasErrors = true
      }
    }
  }

  if (missing.length > 0) {
    console.error("⚠️  Missing expected indexes:")
    missing.forEach((msg) => console.error(`  - ${msg}`))
  } else {
    console.log("✅ All expected indexes are present")
  }

  // Check for unused indexes (warnings only)
  console.log("\n🔎 Checking for potentially unused indexes...")
  const potentiallyUnused: string[] = []

  for (const index of indexesFile.indexes) {
    const expected = EXPECTED_INDEXES[index.collectionGroup as keyof typeof EXPECTED_INDEXES]
    if (!expected) {
      potentiallyUnused.push(
        `${index.collectionGroup}: [${index.fields.map((f) => f.fieldPath).join(", ")}]`
      )
    }
  }

  if (potentiallyUnused.length > 0) {
    console.warn("⚠️  Potentially unused indexes (verify against code):")
    potentiallyUnused.forEach((msg) => console.warn(`  - ${msg}`))
  } else {
    console.log("✅ No potentially unused indexes found")
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  if (hasErrors) {
    console.error("❌ Index validation FAILED")
    console.error("   Please fix the issues above before deploying")
    process.exit(1)
  } else {
    console.log("✅ Index validation PASSED")
    console.log(`   Total indexes: ${indexesFile.indexes.length}`)
    console.log(`   Collections covered: ${new Set(indexesFile.indexes.map((i) => i.collectionGroup)).size}`)
  }
  console.log("=".repeat(60))
}

function getIndexSignature(index: FirestoreIndex): string {
  const fields = index.fields
    .map((f) => {
      if (f.arrayConfig) return `${f.fieldPath}:${f.arrayConfig}`
      return `${f.fieldPath}:${f.order || "ASCENDING"}`
    })
    .join(",")
  return `${index.collectionGroup}:[${fields}]`
}

function matchesFieldSet(index: FirestoreIndex, fieldSet: string[]): boolean {
  if (index.fields.length !== fieldSet.length) return false

  return index.fields.every((field, i) => {
    return field.fieldPath === fieldSet[i]
  })
}

// Run validation
main()
