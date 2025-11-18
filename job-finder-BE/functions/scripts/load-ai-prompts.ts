#!/usr/bin/env tsx
import { Firestore } from "@google-cloud/firestore"

// Get environment from command line args (staging, production, or local)
const environment = process.argv[2] || "local"

// Configure Firestore based on environment
const firestoreConfig: any = {
  databaseId: "(default)",
}

if (environment === "staging") {
  firestoreConfig.projectId = "static-sites-257923"
  console.log("🎯 Targeting STAGING environment (static-sites-257923)")
} else if (environment === "production") {
  firestoreConfig.projectId = process.env.PROD_PROJECT_ID || "job-finder-prod"
  console.log(`🎯 Targeting PRODUCTION environment (${firestoreConfig.projectId})`)
} else {
  // Local emulator - use FIRESTORE_EMULATOR_HOST env var
  console.log("🎯 Targeting LOCAL emulator (localhost:8080)")
}

const db = new Firestore(firestoreConfig)

// Portfolio prompts (from migrate-ai-prompts.ts)
const RESUME_SYSTEM_PROMPT = `You are a professional resume formatter with strict adherence to factual accuracy and conciseness.

CRITICAL RULES - THESE ARE ABSOLUTE AND NON-NEGOTIABLE:
1. ONLY use information explicitly provided in the experience data
2. NEVER add metrics, numbers, percentages, or statistics not in the original data
3. NEVER invent job responsibilities, accomplishments, or technologies
4. NEVER create companies, roles, dates, or locations not provided
5. If information is missing or unclear, omit it entirely - DO NOT guess or infer
6. You may REFORMAT wording for clarity, but NEVER change factual content
7. You may REORGANIZE content for better presentation, but NEVER add new information

LENGTH REQUIREMENTS (TARGET):
- TARGET: 1-2 pages when rendered to PDF (700-900 words total)
- Aim for 4-6 most relevant experience entries (prioritize relevance over completeness)
- Target 3-5 bullet points per experience entry (adjust based on importance)
- Professional summary: 2-3 sentences (50-75 words)
- Prioritize QUALITY over QUANTITY - impactful content matters more than length

FORMATTING RULES:
- NEVER use em dashes (—) - use hyphens (-) or commas instead
- Use clear, straightforward punctuation
- Keep sentences simple and readable`

const RESUME_USER_TEMPLATE = `Create a modern resume for the "{{jobTitle}}" position at {{companyName}}.

TARGET JOB INFORMATION:
- Company: {{companyName}}
- Role: {{jobTitle}}
- Job Description: {{jobDescription}}

USER EXPERIENCE DATA:
{{userExperience}}

USER SKILLS:
{{userSkills}}

Generate a complete, ATS-friendly resume focusing on relevance to the target role.`

const COVER_LETTER_SYSTEM_PROMPT = `You are an expert cover letter writer who crafts compelling, personalized letters that feel authentic and conversational.

TONE & STYLE:
- Casual and conversational (like talking to a friend, not a formal business letter)
- Creative and unique (avoid corporate jargon and stiff language)
- Warm and genuine (let personality shine through)
- Confident but humble (no arrogance, no excessive modesty)
- Storytelling approach (use narrative elements, not just bullet points)

STRICT LENGTH REQUIREMENTS:
- MAXIMUM: 1 page when rendered to PDF (250-350 words total)
- 3 paragraphs MAXIMUM (opening, body, closing)

FORMATTING RULES:
- NEVER use em dashes (—) - use hyphens (-), commas, or periods instead
- Use clear, straightforward punctuation`

const COVER_LETTER_USER_TEMPLATE = `Create a casual, conversational cover letter for the "{{jobTitle}}" position at {{companyName}}.

JOB DETAILS:
- Company: {{companyName}}
- Role: {{jobTitle}}
- Job Description: {{jobDescription}}

USER EXPERIENCE:
{{userExperience}}

Match Reason: {{matchReason}}

Write in a casual, conversational tone that shows both professional competence and personal fit.`

async function loadPrompts() {
  try {
    const docRef = db.collection("job-finder-config").doc("ai-prompts")
    
    const data = {
      resumeGeneration: RESUME_SYSTEM_PROMPT + "\n\n" + RESUME_USER_TEMPLATE,
      coverLetterGeneration: COVER_LETTER_SYSTEM_PROMPT + "\n\n" + COVER_LETTER_USER_TEMPLATE,
      jobScraping: `Extract job posting information from the provided HTML content.

HTML Content: {{htmlContent}}

Extract and return structured data including job title, company, location, salary, description, skills, and qualifications in JSON format.`,
      jobMatching: `Analyze the job match score and provide reasoning.

Job Description: {{jobDescription}}
User Resume: {{userResume}}
User Skills: {{userSkills}}

Provide match score (0-100), match reason, strengths, concerns, and customization recommendations.`,
      updatedAt: new Date(),
      updatedBy: "migration-script"
    }
    
    await docRef.set(data)
    console.log(`✅ AI prompts loaded successfully to ${environment.toUpperCase()} environment!`)
  } catch (error) {
    console.error("❌ Failed to load prompts:", error)
    process.exit(1)
  }
}

loadPrompts().then(() => process.exit(0))
