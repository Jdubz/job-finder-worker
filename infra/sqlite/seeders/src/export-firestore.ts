import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { cert, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import type { ServiceAccount } from "firebase-admin"
import { z } from "zod"

const COLLECTIONS = [
  "content-items",
  "experience-entries",
  "experience-blurbs",
  "companies",
  "job-queue",
  "job-matches",
  "generator-documents",
  "job-finder-config",
  "job-sources",
  "contact-submissions"
] as const

type CollectionName = (typeof COLLECTIONS)[number]

const envSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1, "Set FIREBASE_PROJECT_ID"),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
  EXPORT_OUTPUT_DIR: z.string().optional()
})

async function loadServiceAccount(filePath: string): Promise<ServiceAccount> {
  const resolved = path.resolve(filePath)
  const raw = await readFile(resolved, "utf8")
  return JSON.parse(raw)
}

async function exportCollection(name: CollectionName, outputDir: string) {
  const db = getFirestore()
  const snapshot = await db.collection(name).get()
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  const filePath = path.join(outputDir, `${name}.json`)
  const payload = {
    collection: name,
    count: docs.length,
    exportedAt: new Date().toISOString(),
    documents: docs
  }
  await writeFile(filePath, JSON.stringify(payload, null, 2))
  console.log(`[export] ${name} -> ${filePath} (${docs.length} docs)`) // eslint-disable-line no-console
  return { name, count: docs.length, filePath }
}

async function main() {
  const parsedEnv = envSchema.parse({
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    EXPORT_OUTPUT_DIR: process.env.EXPORT_OUTPUT_DIR
  })

  const serviceAccountPath = parsedEnv.FIREBASE_SERVICE_ACCOUNT_PATH ?? parsedEnv.GOOGLE_APPLICATION_CREDENTIALS
  if (!serviceAccountPath) {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file")
  }

  const outputDir = parsedEnv.EXPORT_OUTPUT_DIR
    ? path.resolve(parsedEnv.EXPORT_OUTPUT_DIR)
    : path.resolve(process.cwd(), "output")
  await mkdir(outputDir, { recursive: true })

  const serviceAccount = await loadServiceAccount(serviceAccountPath)
  initializeApp({
    credential: cert(serviceAccount),
    projectId: parsedEnv.FIREBASE_PROJECT_ID
  })

  const summaries = []
  for (const name of COLLECTIONS) {
    const summary = await exportCollection(name, outputDir)
    summaries.push(summary)
  }

  const summaryPath = path.join(outputDir, "summary.json")
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        projectId: parsedEnv.FIREBASE_PROJECT_ID,
        collections: summaries
      },
      null,
      2
    )
  )
  console.log(`[export] summary -> ${summaryPath}`) // eslint-disable-line no-console
}

main().catch((err) => {
  console.error(err) // eslint-disable-line no-console
  process.exitCode = 1
})
