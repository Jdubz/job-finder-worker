#!/usr/bin/env node
/**
 * Seed AI Prompts to Firestore
 *
 * Creates the job-finder-config/ai-prompts document with default prompt templates
 *
 * Usage:
 *   # Local emulator
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/seed-ai-prompts.ts
 *
 *   # Staging
 *   GOOGLE_CLOUD_PROJECT=static-sites-257923 npx tsx scripts/seed-ai-prompts.ts
 */

import { Firestore } from "@google-cloud/firestore"

const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST

console.log("🌱 Seeding AI Prompts")
console.log("=====================")
console.log(`Environment: ${IS_EMULATOR ? "Emulator" : "Cloud"}`)
console.log("")

const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "static-sites-257923",
})

const DEFAULT_PROMPTS = {
  resumeGeneration: `You are an expert resume writer. Generate a professional resume based on the following information:

Job Description: {{jobDescription}}
Job Title: {{jobTitle}}
Company: {{companyName}}

User Experience:
{{userExperience}}

User Skills:
{{userSkills}}

Additional Instructions: {{additionalInstructions}}

Create a tailored resume that highlights relevant experience and skills for this specific role.`,

  coverLetterGeneration: `You are an expert cover letter writer. Generate a compelling cover letter based on:

Job Description: {{jobDescription}}
Job Title: {{jobTitle}}
Company: {{companyName}}

User Experience:
{{userExperience}}

Match Reason: {{matchReason}}

Additional Instructions: {{additionalInstructions}}

Write a personalized cover letter that demonstrates enthusiasm and fit for the role.`,

  jobScraping: `Extract job posting information from the provided HTML content.

HTML Content: {{htmlContent}}

Extract and return structured data including:
- Job Title
- Company Name
- Location
- Job Type (Full-time, Part-time, Contract, etc.)
- Salary Range (if available)
- Job Description
- Required Skills
- Qualifications
- Benefits

Return the data in JSON format.`,

  jobMatching: `Analyze the job match score and provide reasoning.

Job Description: {{jobDescription}}
User Resume: {{userResume}}
User Skills: {{userSkills}}

Evaluate:
1. Skills alignment (technical and soft skills)
2. Experience relevance
3. Role fit
4. Growth potential

Provide:
- Match score (0-100)
- Match reason (why this is a good fit)
- Strengths (what makes the candidate strong)
- Concerns (potential gaps or mismatches)
- Customization recommendations (what to emphasize)`,

  updatedAt: new Date(),
  updatedBy: "system-seed",
}

async function seedPrompts() {
  try {
    const docRef = db.collection("job-finder-config").doc("ai-prompts")
    const doc = await docRef.get()

    if (doc.exists) {
      console.log("⚠️  Warning: AI prompts document already exists")
      console.log("   This will OVERWRITE the existing prompts")
      console.log("")
    } else {
      console.log("✓ No existing AI prompts found - creating new document")
      console.log("")
    }

    await docRef.set(DEFAULT_PROMPTS)

    console.log("✅ Successfully seeded AI prompts!")
    console.log("")
    console.log("Created prompts:")
    console.log("  - resumeGeneration")
    console.log("  - coverLetterGeneration")
    console.log("  - jobScraping")
    console.log("  - jobMatching")
    console.log("")
  } catch (error) {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  }
}

// Run seed
seedPrompts()
  .then(() => {
    console.log("✓ Seed complete!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  })
