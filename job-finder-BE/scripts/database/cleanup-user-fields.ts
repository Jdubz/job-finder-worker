#!/usr/bin/env tsx

/**
 * Database Cleanup Script - Remove User Ownership Fields
 *
 * This script removes user ownership fields from Firestore collections
 * as part of the authentication refactor to single-owner architecture.
 *
 * Fields to remove:
 * - submitted_by
 * - userId (if exists)
 * - Any other user ownership fields
 *
 * Collections to clean:
 * - job-queue
 * - Any other collections with user fields
 */

import * as admin from "firebase-admin";
import * as readline from "readline";

// Get database ID from environment
const environment = process.env.ENVIRONMENT || process.env.NODE_ENV;
let databaseId: string;

switch (environment) {
  case "staging":
    databaseId = "portfolio-staging";
    break;
  case "production":
    databaseId = "portfolio";
    break;
  default:
    databaseId = "portfolio-staging"; // Default to staging for safety
    console.log(`⚠️  No ENVIRONMENT set, defaulting to staging database`);
}

console.log(`📦 Using database: ${databaseId}`);

// Initialize Firebase Admin
// Use application default credentials (gcloud auth application-default login)
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  console.log("✓ Firebase Admin initialized with application default credentials");
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin");
  console.error("   Please run: gcloud auth application-default login");
  console.error("   Error:", error);
  process.exit(1);
}

const db = admin.firestore();
// Set the database ID
(db as any).settings({ databaseId });

interface CleanupStats {
  collection: string;
  totalDocs: number;
  docsWithFields: number;
  docsUpdated: number;
  errors: number;
}

/**
 * Prompt user for confirmation
 */
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Check and display what will be cleaned up
 */
async function analyzeCollection(collectionName: string, fieldsToRemove: string[]): Promise<CleanupStats> {
  console.log(`\n📊 Analyzing collection: ${collectionName}`);

  const stats: CleanupStats = {
    collection: collectionName,
    totalDocs: 0,
    docsWithFields: 0,
    docsUpdated: 0,
    errors: 0,
  };

  try {
    const snapshot = await db.collection(collectionName).get();
    stats.totalDocs = snapshot.size;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const hasFields = fieldsToRemove.some((field) => field in data);
      if (hasFields) {
        stats.docsWithFields++;
      }
    });

    console.log(`   Total documents: ${stats.totalDocs}`);
    console.log(`   Documents with user fields: ${stats.docsWithFields}`);

    return stats;
  } catch (error) {
    console.error(`   ❌ Error analyzing collection: ${error}`);
    stats.errors = 1;
    return stats;
  }
}

/**
 * Clean up a single collection
 */
async function cleanupCollection(
  collectionName: string,
  fieldsToRemove: string[],
  dryRun: boolean = true
): Promise<CleanupStats> {
  console.log(`\n🧹 Cleaning collection: ${collectionName} (${dryRun ? "DRY RUN" : "ACTUAL"})`);

  const stats: CleanupStats = {
    collection: collectionName,
    totalDocs: 0,
    docsWithFields: 0,
    docsUpdated: 0,
    errors: 0,
  };

  try {
    const snapshot = await db.collection(collectionName).get();
    stats.totalDocs = snapshot.size;

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const fieldsToUpdate: { [key: string]: admin.firestore.FieldValue } = {};

      fieldsToRemove.forEach((field) => {
        if (field in data) {
          fieldsToUpdate[field] = admin.firestore.FieldValue.delete();
        }
      });

      if (Object.keys(fieldsToUpdate).length > 0) {
        stats.docsWithFields++;

        if (!dryRun) {
          batch.update(doc.ref, fieldsToUpdate);
          batchCount++;
          stats.docsUpdated++;

          // Commit batch if we hit the limit
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`   ✓ Committed batch of ${batchCount} updates`);
            batchCount = 0;
          }
        } else {
          console.log(`   [DRY RUN] Would remove fields from doc ${doc.id}: ${Object.keys(fieldsToUpdate).join(", ")}`);
        }
      }
    }

    // Commit remaining batch
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`   ✓ Committed final batch of ${batchCount} updates`);
    }

    console.log(`   Total documents: ${stats.totalDocs}`);
    console.log(`   Documents with user fields: ${stats.docsWithFields}`);
    if (!dryRun) {
      console.log(`   Documents updated: ${stats.docsUpdated}`);
    }

    return stats;
  } catch (error) {
    console.error(`   ❌ Error cleaning collection: ${error}`);
    stats.errors = 1;
    return stats;
  }
}

/**
 * Main cleanup function
 */
async function main() {
  console.log("🔧 Database Cleanup - Remove User Ownership Fields");
  console.log("================================================\n");

  // Get current project
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "unknown";
  console.log(`📍 Project: ${projectId}\n`);

  if (projectId === "unknown") {
    console.error("❌ Could not determine project ID");
    console.error("   Please set GCLOUD_PROJECT or GCP_PROJECT environment variable");
    process.exit(1);
  }

  // Warn if production
  if (projectId.includes("production") || projectId === "static-sites-257923") {
    console.warn("⚠️  WARNING: This appears to be a production project!");
    console.warn("   Project ID: " + projectId);
    const proceed = await askConfirmation("\n   Do you want to proceed? (y/N): ");
    if (!proceed) {
      console.log("   Aborted by user");
      process.exit(0);
    }
  }

  // Define collections and fields to clean
  const collectionsToClean = [
    {
      name: "job-queue",
      fields: ["submitted_by"],
    },
    // Add more collections here if needed
  ];

  // Phase 1: Analyze all collections
  console.log("\n📊 PHASE 1: ANALYSIS");
  console.log("===================");

  const analysisResults: CleanupStats[] = [];
  for (const collection of collectionsToClean) {
    const stats = await analyzeCollection(collection.name, collection.fields);
    analysisResults.push(stats);
  }

  // Display summary
  console.log("\n📋 ANALYSIS SUMMARY");
  console.log("==================");
  let totalDocsWithFields = 0;
  for (const stats of analysisResults) {
    console.log(`${stats.collection}: ${stats.docsWithFields} / ${stats.totalDocs} documents need cleanup`);
    totalDocsWithFields += stats.docsWithFields;
  }

  if (totalDocsWithFields === 0) {
    console.log("\n✅ No documents need cleanup. Database is already clean!");
    process.exit(0);
  }

  // Phase 2: Dry run
  console.log("\n\n🧪 PHASE 2: DRY RUN");
  console.log("===================");
  const proceed1 = await askConfirmation("\nRun dry run to see what would be changed? (Y/n): ");
  if (!proceed1) {
    console.log("Aborted by user");
    process.exit(0);
  }

  for (const collection of collectionsToClean) {
    await cleanupCollection(collection.name, collection.fields, true);
  }

  // Phase 3: Actual cleanup
  console.log("\n\n🔥 PHASE 3: ACTUAL CLEANUP");
  console.log("==========================");
  console.log(`⚠️  This will PERMANENTLY remove user ownership fields from ${totalDocsWithFields} documents!`);
  const proceed2 = await askConfirmation("\nProceed with actual cleanup? (y/N): ");
  if (!proceed2) {
    console.log("Aborted by user");
    process.exit(0);
  }

  const cleanupResults: CleanupStats[] = [];
  for (const collection of collectionsToClean) {
    const stats = await cleanupCollection(collection.name, collection.fields, false);
    cleanupResults.push(stats);
  }

  // Final summary
  console.log("\n\n✅ CLEANUP COMPLETE");
  console.log("==================");
  let totalUpdated = 0;
  let totalErrors = 0;
  for (const stats of cleanupResults) {
    console.log(`${stats.collection}: ${stats.docsUpdated} documents updated`);
    totalUpdated += stats.docsUpdated;
    totalErrors += stats.errors;
  }
  console.log(`\nTotal documents updated: ${totalUpdated}`);
  if (totalErrors > 0) {
    console.log(`⚠️  Total errors: ${totalErrors}`);
  }

  console.log("\n✨ Database cleanup complete!");
}

// Run main function
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
