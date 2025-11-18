#!/usr/bin/env node

/**
 * User ID Checker Script
 *
 * This script helps identify what user IDs exist in the database
 * and helps determine what migration is needed.
 *
 * Usage:
 *   node scripts/check-user-ids.js
 */

import { initializeApp } from "firebase/app"
import { getFirestore, collection, getDocs, query, orderBy, limit } from "firebase/firestore"

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Collections and their user ID fields
const COLLECTIONS = [
  {
    name: "job-matches",
    userField: "submittedBy",
    description: "Job matches with AI analysis",
  },
  {
    name: "generator-documents",
    userField: "access.userId",
    description: "Generated documents (resumes, cover letters)",
  },
  {
    name: "content-items",
    userField: "userId",
    description: "User content items (companies, projects, skills)",
  },
  {
    name: "job-queue",
    userField: "submitted_by",
    description: "Job queue items for processing",
  },
  {
    name: "job-finder-config",
    userField: "userId",
    description: "User configuration and preferences",
  },
]

async function checkUserIds() {
  console.log("🔍 Checking user IDs across all collections")
  console.log("")

  let totalDocuments = 0
  const allUserIds = new Set()

  for (const collectionConfig of COLLECTIONS) {
    console.log(`📁 Collection: ${collectionConfig.name}`)
    console.log(`   Field: ${collectionConfig.userField}`)
    console.log(`   Description: ${collectionConfig.description}`)

    try {
      // Get all documents (limit to 100 for performance)
      const collectionRef = collection(db, collectionConfig.name)
      const q = query(collectionRef, orderBy("createdAt", "desc"), limit(100))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        console.log(`   📄 No documents found`)
        console.log("")
        continue
      }

      console.log(`   📄 Found ${snapshot.docs.length} documents`)

      // Extract user IDs
      const userIds = new Set()
      let documentsWithUserIds = 0

      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data()
        let userId = null

        // Handle nested field access (e.g., access.userId)
        if (collectionConfig.userField.includes(".")) {
          const [parentField, childField] = collectionConfig.userField.split(".")
          userId = data[parentField]?.[childField]
        } else {
          userId = data[collectionConfig.userField]
        }

        if (userId) {
          userIds.add(userId)
          allUserIds.add(userId)
          documentsWithUserIds++
        }
      }

      console.log(`   👥 Unique user IDs: ${userIds.size}`)
      console.log(`   📊 Documents with user IDs: ${documentsWithUserIds}`)

      if (userIds.size > 0) {
        console.log(`   🔑 User IDs found:`)
        for (const userId of userIds) {
          console.log(`      - ${userId}`)
        }
      }

      totalDocuments += snapshot.docs.length
    } catch (error) {
      console.error(`   ❌ Error checking collection ${collectionConfig.name}:`, error.message)
    }

    console.log("")
  }

  // Summary
  console.log("🎯 Summary:")
  console.log(`   Total documents checked: ${totalDocuments}`)
  console.log(`   Total unique user IDs across all collections: ${allUserIds.size}`)

  if (allUserIds.size > 0) {
    console.log(`   🔑 All user IDs found:`)
    for (const userId of allUserIds) {
      console.log(`      - ${userId}`)
    }
  }

  console.log("")
  console.log("💡 Next steps:")
  console.log("   1. If you see multiple user IDs, you may need to migrate them")
  console.log(
    "   2. Use the migration script: node scripts/migrate-user-ids.js <oldUserId> <newUserId>"
  )
  console.log("   3. Check your current authenticated user ID in the browser console")
}

async function main() {
  console.log("🚀 User ID Checker Script")
  console.log("========================")
  console.log("")

  try {
    await checkUserIds()
  } catch (error) {
    console.error("❌ Check failed:", error.message)
    process.exit(1)
  }
}

// Run the script
main()
