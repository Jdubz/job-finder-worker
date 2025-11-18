/**
 * OpenAI Service
 *
 * Handles all OpenAI API interactions for resume and cover letter generation.
 * Uses structured outputs for consistent, type-safe responses.
 *
 * Cost: $2.50 input / $10.00 output per 1M tokens
 * Model: gpt-4o-2024-08-06
 */

import OpenAI from "openai"
import { createDefaultLogger } from "../utils/logger"
import type { SimpleLogger } from "../types/logger.types"
import type {
  AIProvider,
  AIProviderType,
  AIResumeGenerationResult,
  AICoverLetterGenerationResult,
  GenerateResumeOptions,
  GenerateCoverLetterOptions,
  TokenUsage,
  ResumeContent,
  CoverLetterContent,
} from "../types/generator.types"

// Legacy type aliases for backward compatibility
export type ResumeGenerationResult = AIResumeGenerationResult
export type CoverLetterGenerationResult = AICoverLetterGenerationResult

export class OpenAIService implements AIProvider {
  private client: OpenAI
  private logger: SimpleLogger
  private useMockMode: boolean

  readonly model: string = "gpt-4o-2024-08-06" // Supports structured outputs
  readonly providerType: AIProviderType = "openai"
  readonly pricing = {
    inputCostPer1M: 2.5, // $2.50 per 1M input tokens
    outputCostPer1M: 10.0, // $10.00 per 1M output tokens
  }

  constructor(apiKey: string, logger?: SimpleLogger) {
    this.client = new OpenAI({
      apiKey,
    })

    this.useMockMode = process.env.OPENAI_MOCK_MODE === "true"

    // Use shared logger factory
    this.logger = logger || createDefaultLogger()

    if (this.useMockMode) {
      this.logger.warning("⚠️  OpenAI MOCK MODE ENABLED - Using mock responses instead of real API calls")
    }
  }

  /**
   * Generate a resume using OpenAI structured outputs
   */
  async generateResume(options: GenerateResumeOptions): Promise<AIResumeGenerationResult> {
    try {
      // Return mock response if mock mode is enabled
      if (this.useMockMode) {
        return this.generateMockResume(options)
      }

      const systemPrompt = options.customPrompts?.systemPrompt || this.buildResumeSystemPrompt()
      const userPrompt = options.customPrompts?.userPromptTemplate
        ? this.interpolateUserPrompt(options.customPrompts.userPromptTemplate, options)
        : this.buildResumeUserPrompt(options)

      this.logger.info("Generating resume with OpenAI", {
        model: this.model,
        role: options.job.role,
        company: options.job.company,
      })

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0, // Zero for maximum factual accuracy (prevent hallucination)
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "resume_content",
            strict: true,
            schema: this.getResumeSchema(),
          },
        },
      })

      const content = JSON.parse(completion.choices[0].message.content!) as ResumeContent

      const tokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      }

      this.logger.info("Resume generated successfully", {
        model: completion.model,
        tokenUsage,
      })

      return {
        content,
        tokenUsage,
        model: completion.model,
      }
    } catch (error) {
      this.logger.error("Failed to generate resume", { error })
      throw new Error(`OpenAI resume generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate a cover letter using OpenAI structured outputs
   */
  async generateCoverLetter(options: GenerateCoverLetterOptions): Promise<AICoverLetterGenerationResult> {
    try {
      // Return mock response if mock mode is enabled
      if (this.useMockMode) {
        return this.generateMockCoverLetter(options)
      }

      const systemPrompt = options.customPrompts?.systemPrompt || this.buildCoverLetterSystemPrompt()
      const userPrompt = options.customPrompts?.userPromptTemplate
        ? this.interpolateCoverLetterPrompt(options.customPrompts.userPromptTemplate, options)
        : this.buildCoverLetterUserPrompt(options)

      this.logger.info("Generating cover letter with OpenAI", {
        model: this.model,
        role: options.job.role,
        company: options.job.company,
      })

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "cover_letter_content",
            strict: true,
            schema: this.getCoverLetterSchema(),
          },
        },
      })

      const content = JSON.parse(completion.choices[0].message.content!) as CoverLetterContent

      const tokenUsage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      }

      this.logger.info("Cover letter generated successfully", {
        model: completion.model,
        tokenUsage,
      })

      return {
        content,
        tokenUsage,
        model: completion.model,
      }
    } catch (error) {
      this.logger.error("Failed to generate cover letter", { error })
      throw new Error(
        `OpenAI cover letter generation failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Build system prompt for resume generation
   */
  private buildResumeSystemPrompt(): string {
    return `You are a professional resume formatter with strict adherence to factual accuracy and conciseness.

CRITICAL RULES - THESE ARE ABSOLUTE AND NON-NEGOTIABLE:
1. ONLY use information explicitly provided in the experience data
2. NEVER add metrics, numbers, percentages, or statistics not in the original data
3. NEVER invent job responsibilities, accomplishments, or technologies
4. NEVER create companies, roles, dates, or locations not provided
5. If information is missing or unclear, omit it entirely - DO NOT guess or infer
6. You may REFORMAT wording for clarity, but NEVER change factual content
7. You may REORGANIZE content for better presentation, but NEVER add new information

LENGTH REQUIREMENTS (STRICT):
- MAXIMUM: 1-2 pages when rendered to PDF (600-750 words total)
- Include ONLY 3-4 most relevant experience entries (prioritize relevance over completeness)
- MAXIMUM 4 bullet points per experience entry
- Professional summary: 2-3 sentences maximum (50-75 words)
- Prioritize QUALITY over QUANTITY - better to have fewer, stronger highlights

Your role is to:
- SELECT the 3-4 most relevant experiences for the target role
- Format and structure ONLY the most relevant experience professionally
- Emphasize relevance through SELECTION and ORDERING, not fabrication
- Write CONCISE, impactful bullet points (1-2 lines each maximum)
- Improve phrasing and grammar while preserving all factual details
- Ensure ATS-friendliness through proper formatting
- Use action verbs from the source material
- Focus on impact and results that are stated in the data

SELECTION PRIORITY:
- Relevance to target role is MORE important than recency
- Quality of accomplishments is MORE important than quantity
- If an experience has weak or generic content, SKIP IT entirely
- Better to have 3 strong entries than 5 mediocre ones

What you CANNOT do:
- Include more than 4 experience entries
- Include more than 4 bullet points per entry
- Add accomplishments not stated in the source data
- Insert metrics or quantification not explicitly provided
- Infer skills, technologies, or methodologies not mentioned
- Create education entries if none are provided
- Write verbose or lengthy descriptions`
  }

  /**
   * Build user prompt for resume generation
   */
  private buildResumeUserPrompt(options: GenerateResumeOptions): string {
    // Group content items by type
    const companies = options.contentItems.filter((item) => item.type === "company")
    const projects = options.contentItems.filter((item) => item.type === "project")
    const skills = options.contentItems.filter((item) => item.type === "skill-group")
    const education = options.contentItems.filter((item) => item.type === "education")

    // Format company experience (employment history)
    const experienceData = companies
      .map((item, index) => {
        const company = item as import("../types/content-item.types").CompanyItem
        const accomplishments = company.accomplishments?.join("\n• ") || "NO ACCOMPLISHMENTS PROVIDED"
        const technologies = company.technologies?.join(", ") || ""

        return `
EXPERIENCE ENTRY #${index + 1} (USE ONLY THIS DATA - DO NOT ADD ANYTHING):
Company: ${company.company}
${company.role ? `Role: ${company.role}` : "NO ROLE PROVIDED"}
${company.location ? `Location: ${company.location}` : "NO LOCATION PROVIDED"}
Start Date: ${company.startDate}
End Date: ${company.endDate || "Present"}
${company.summary ? `Summary: ${company.summary}` : "NO SUMMARY PROVIDED"}
${technologies ? `Technologies: ${technologies}` : ""}
Accomplishments:
• ${accomplishments}

END OF ENTRY #${index + 1} - USE NOTHING BEYOND THIS POINT FOR THIS ENTRY
`.trim()
      })
      .join("\n\n" + "=".repeat(80) + "\n\n")

    // Format projects
    const projectsData = projects
      .map((item, index) => {
        const project = item as import("../types/content-item.types").ProjectItem
        const technologies = project.technologies?.join(", ") || ""
        const accomplishments = project.accomplishments?.join("\n• ") || ""
        const links = project.links?.map((l) => `${l.label}: ${l.url}`).join(", ") || ""

        return `
PROJECT #${index + 1}:
Name: ${project.name}
${project.description ? `Description: ${project.description}` : ""}
${technologies ? `Technologies: ${technologies}` : ""}
${links ? `Links: ${links}` : ""}
${accomplishments ? `Accomplishments:\n• ${accomplishments}` : ""}
`.trim()
      })
      .join("\n\n")

    // Format skills
    const skillsData = skills
      .map((item) => {
        const skillGroup = item as import("../types/content-item.types").SkillGroupItem
        const skillsList = skillGroup.skills?.join(", ") || ""
        return `${skillGroup.category}: ${skillsList}`
      })
      .join("\n")

    // Format education
    const educationData = education
      .map((item) => {
        const edu = item as import("../types/content-item.types").EducationItem
        return `
${edu.degree} - ${edu.institution}
${edu.field ? `Field: ${edu.field}` : ""}
${edu.endDate ? `Completed: ${edu.endDate}` : edu.startDate ? `Started: ${edu.startDate}` : ""}
${edu.honors ? `Honors: ${edu.honors}` : ""}
`.trim()
      })
      .join("\n\n")

    // Format job match insights if available
    let jobMatchSection = ""
    if (options.jobMatchData) {
      const jm = options.jobMatchData
      jobMatchSection = `

JOB MATCH INSIGHTS (Use these to guide selection and emphasis):
${jm.matchScore !== undefined ? `- Overall Match Score: ${Math.round(jm.matchScore)}%` : ""}
${jm.matchedSkills && jm.matchedSkills.length > 0 ? `- Matched Skills: ${jm.matchedSkills.join(", ")}` : ""}
${jm.missingSkills && jm.missingSkills.length > 0 ? `- Skills to Develop (don't fabricate, but emphasize related experience): ${jm.missingSkills.join(", ")}` : ""}
${jm.keyStrengths && jm.keyStrengths.length > 0 ? `- Key Strengths to Highlight: ${jm.keyStrengths.join("; ")}` : ""}
${jm.potentialConcerns && jm.potentialConcerns.length > 0 ? `- Address These Concerns (through relevant experience): ${jm.potentialConcerns.join("; ")}` : ""}
${jm.keywords && jm.keywords.length > 0 ? `- Important Keywords (use naturally if present in experience): ${jm.keywords.join(", ")}` : ""}

${
  jm.customizationRecommendations
    ? `CUSTOMIZATION RECOMMENDATIONS:
${jm.customizationRecommendations.skills_to_emphasize && jm.customizationRecommendations.skills_to_emphasize.length > 0 ? `- Skills to Emphasize: ${jm.customizationRecommendations.skills_to_emphasize.join(", ")}` : ""}
${jm.customizationRecommendations.resume_focus && jm.customizationRecommendations.resume_focus.length > 0 ? `- Resume Focus Areas:\n${jm.customizationRecommendations.resume_focus.map((f: string) => `  * ${f}`).join("\n")}` : ""}
`
    : ""
}
${
  jm.resumeIntakeData
    ? `RESUME CUSTOMIZATION DATA:
${jm.resumeIntakeData.target_summary ? `- Target Summary Angle: ${jm.resumeIntakeData.target_summary}` : ""}
${jm.resumeIntakeData.skills_priority && jm.resumeIntakeData.skills_priority.length > 0 ? `- Skills Priority Order: ${jm.resumeIntakeData.skills_priority.join(", ")}` : ""}
${jm.resumeIntakeData.keywords_to_include && jm.resumeIntakeData.keywords_to_include.length > 0 ? `- Keywords to Include: ${jm.resumeIntakeData.keywords_to_include.join(", ")}` : ""}
${jm.resumeIntakeData.achievement_angles && jm.resumeIntakeData.achievement_angles.length > 0 ? `- Achievement Angles:\n${jm.resumeIntakeData.achievement_angles.map((a: string) => `  * ${a}`).join("\n")}` : ""}
`
    : ""
}
IMPORTANT: These insights guide SELECTION and EMPHASIS only. Do NOT fabricate experience or skills not in the provided data.
`
    }

    return `Create a modern resume for the "${options.job.role}" position at ${options.job.company}.${jobMatchSection}

PERSONAL INFORMATION:
- Name: ${options.personalInfo.name}
- Email: ${options.personalInfo.email}
${options.personalInfo.phone ? `- Phone: ${options.personalInfo.phone}` : ""}
${options.personalInfo.location ? `- Location: ${options.personalInfo.location}` : ""}
${options.personalInfo.website ? `- Website: ${options.personalInfo.website}` : ""}
${options.personalInfo.linkedin ? `- LinkedIn: ${options.personalInfo.linkedin}` : ""}
${options.personalInfo.github ? `- GitHub: ${options.personalInfo.github}` : ""}

TARGET JOB INFORMATION:
- Company: ${options.job.company}
- Role: ${options.job.role}
${options.job.companyWebsite ? `- Company Website: ${options.job.companyWebsite}` : ""}
${options.job.jobDescription ? `\n- Job Description (for relevance ranking ONLY, DO NOT fabricate experience to match):\n${options.job.jobDescription}` : ""}

EXPERIENCE DATA (YOUR ONLY SOURCE OF TRUTH):
${experienceData}

${projectsData ? `\nPROJECTS:\n${projectsData}\n` : ""}
${skillsData ? `\nSKILLS:\n${skillsData}\n` : ""}
${educationData ? `\nEDUCATION:\n${educationData}\n` : ""}

END OF ALL PROVIDED DATA - NO OTHER INFORMATION EXISTS

TASK REQUIREMENTS:
1. SELECT ONLY 3-4 most relevant experience entries for the ${options.job.role} role
   - If more than 4 entries provided, choose the most relevant based on job description
   - Relevance matters MORE than recency
   - Skip entries with weak or generic content

2. For each selected entry, write MAXIMUM 4 concise bullet points
   - Each bullet should be 1-2 lines maximum
   - Focus on strongest accomplishments only
   - Prioritize quality over quantity

3. Create a concise professional summary (2-3 sentences, 50-75 words)
   - Use ONLY skills and experience present in the selected entries
   - Make it specific to the ${options.job.role} role

4. Extract skills ONLY from technologies explicitly mentioned in selected entries
   - Keep skills section concise and focused
${options.emphasize && options.emphasize.length > 0 ? `   - If these keywords appear in the experience data, ensure they are prominent: ${options.emphasize.join(", ")}` : ""}

5. For education: Include ONLY if education information appears in the experience data or notes. Otherwise omit entirely.

6. DATE FORMATTING:
   - Convert all dates from YYYY-MM format to "MMM YYYY" format (e.g., "2020-01" → "Jan 2020", "2023-12" → "Dec 2023")
   - Use 3-letter month abbreviations: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
   - For null/missing end dates, use "Present"

SELECTION STRATEGY:
- Analyze job description for key requirements
- Rank experience entries by relevance to those requirements
- Choose top 3-4 entries that best demonstrate fit
- If an entry doesn't strongly relate to the role, SKIP IT

FORBIDDEN ACTIONS (will result in rejection):
❌ Including more than 4 experience entries
❌ Including more than 4 bullet points per entry
❌ Adding metrics/numbers not in source data
❌ Inventing job responsibilities or projects
❌ Creating skills or technologies not mentioned in the data
❌ Writing verbose or lengthy descriptions
❌ Including irrelevant experiences just to fill space

TARGET LENGTH: 600-750 words total. Generate a complete, concise, ATS-friendly resume using ONLY the most relevant factual information.`
  }

  /**
   * Build system prompt for cover letter generation
   */
  private buildCoverLetterSystemPrompt(): string {
    return `You are an expert cover letter writer specializing in helping software engineers craft compelling, personalized cover letters.

STRICT LENGTH REQUIREMENTS:
- MAXIMUM: 1 page when rendered to PDF (250-350 words total)
- 3 paragraphs MAXIMUM (opening, body, closing)
- Each paragraph: 2-3 sentences maximum
- Opening: 50-75 words
- Body: 100-150 words (split into 1-2 paragraphs if needed)
- Closing: 50-75 words
- Prioritize QUALITY over QUANTITY

Your letters are:
- Concise and impactful (every sentence adds value)
- Professional but warm in tone
- Focused on 2-3 most relevant accomplishments ONLY
- Free of clichés and generic phrases ("I am excited to apply...")
- Authentic and conversational
- Specific to the role and company

SELECTION PRIORITY:
- Choose ONLY the 2-3 most relevant accomplishments from experience
- Quality matters MORE than quantity
- Better to have 2 strong points than 4 mediocre ones
- Skip generic statements that could apply to any role

You highlight the candidate's most relevant accomplishments and explain why they're a great fit for the specific role and company.`
  }

  /**
   * Build user prompt for cover letter generation
   */
  private buildCoverLetterUserPrompt(options: GenerateCoverLetterOptions): string {
    // Group content items by type
    const companies = options.contentItems.filter((item) => item.type === "company")

    // Format experience data (simplified for cover letter)
    const experienceData = companies
      .map((item) => {
        const company = item as import("../types/content-item.types").CompanyItem
        const accomplishments = company.accomplishments?.slice(0, 2).join("\n") || company.summary || ""
        return `${company.company}${company.role ? ` - ${company.role}` : ""} (${company.startDate} - ${company.endDate || "Present"})
${accomplishments}`
      })
      .join("\n\n")

    // Format job match insights if available
    let jobMatchSection = ""
    if (options.jobMatchData) {
      const jm = options.jobMatchData
      jobMatchSection = `

JOB MATCH INSIGHTS (Use these to craft a targeted cover letter):
${jm.matchScore !== undefined ? `- Overall Match Score: ${Math.round(jm.matchScore)}%` : ""}
${jm.keyStrengths && jm.keyStrengths.length > 0 ? `- Key Strengths to Emphasize: ${jm.keyStrengths.join("; ")}` : ""}
${jm.potentialConcerns && jm.potentialConcerns.length > 0 ? `- Address These Potential Gaps: ${jm.potentialConcerns.join("; ")}` : ""}
${
  jm.customizationRecommendations?.cover_letter_points && jm.customizationRecommendations.cover_letter_points.length > 0
    ? `- Recommended Cover Letter Points:\n${jm.customizationRecommendations.cover_letter_points.map((p: string) => `  * ${p}`).join("\n")}`
    : ""
}
${
  jm.resumeIntakeData?.achievement_angles && jm.resumeIntakeData.achievement_angles.length > 0
    ? `- Achievement Angles to Highlight:\n${jm.resumeIntakeData.achievement_angles.map((a: string) => `  * ${a}`).join("\n")}`
    : ""
}

Use these insights to choose the most relevant accomplishments and frame them in a way that addresses the company's needs.
`
    }

    return `Create a professional cover letter for the "${options.job.role}" position at ${options.job.company}.${jobMatchSection}

CANDIDATE INFORMATION:
- Name: ${options.personalInfo.name}
- Email: ${options.personalInfo.email}

JOB DETAILS:
- Company: ${options.job.company}
- Role: ${options.job.role}
${options.job.companyWebsite ? `- Company Website: ${options.job.companyWebsite}` : ""}
${options.job.jobDescription ? `- Job Description:\n${options.job.jobDescription}` : ""}

CANDIDATE EXPERIENCE:
${experienceData}

REQUIREMENTS:
- 3-4 paragraphs maximum
- Professional but warm tone
- Highlight 2-3 most relevant accomplishments from experience
- Show knowledge of the company (if website/description provided)
- Explain why the candidate is a great fit for this specific role
- Include a clear call to action
- Use the candidate's name in the signature
- Address to "Hiring Manager" unless a specific name is provided in the job description

Generate a compelling cover letter that showcases the candidate's qualifications for this specific role.`
  }

  /**
   * Get JSON schema for resume structured output
   */
  private getResumeSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        personalInfo: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            contact: {
              type: "object",
              properties: {
                email: { type: "string" },
                location: { type: "string" },
                website: { type: "string" },
                linkedin: { type: "string" },
                github: { type: "string" },
              },
              required: ["email", "location", "website", "linkedin", "github"],
              additionalProperties: false,
            },
          },
          required: ["name", "title", "summary", "contact"],
          additionalProperties: false,
        },
        professionalSummary: { type: "string" },
        experience: {
          type: "array",
          items: {
            type: "object",
            properties: {
              company: { type: "string" },
              role: { type: "string" },
              location: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: ["string", "null"] },
              highlights: {
                type: "array",
                items: { type: "string" },
              },
              technologies: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["company", "role", "location", "startDate", "endDate", "highlights", "technologies"],
            additionalProperties: false,
          },
        },
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              items: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["category", "items"],
            additionalProperties: false,
          },
        },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              institution: { type: "string" },
              degree: { type: "string" },
              field: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
            },
            required: ["institution", "degree", "field", "startDate", "endDate"],
            additionalProperties: false,
          },
        },
      },
      required: ["personalInfo", "professionalSummary", "experience", "skills", "education"],
      additionalProperties: false,
    }
  }

  /**
   * Get JSON schema for cover letter structured output
   */
  private getCoverLetterSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        greeting: { type: "string" },
        openingParagraph: { type: "string" },
        bodyParagraphs: {
          type: "array",
          items: { type: "string" },
        },
        closingParagraph: { type: "string" },
        signature: { type: "string" },
      },
      required: ["greeting", "openingParagraph", "bodyParagraphs", "closingParagraph", "signature"],
      additionalProperties: false,
    }
  }

  /**
   * Generate a mock resume for local development
   * This avoids hitting OpenAI API quota limits during testing
   */
  private generateMockResume(options: GenerateResumeOptions): ResumeGenerationResult {
    this.logger.info("🎭 Generating MOCK resume (no API call)", {
      role: options.job.role,
      company: options.job.company,
    })

    const mockContent: ResumeContent = {
      personalInfo: {
        name: options.personalInfo.name,
        title: `${options.job.role}`,
        summary: `Experienced software engineer with a proven track record of building scalable systems and leading technical initiatives. Passionate about ${options.job.role.toLowerCase()} work and delivering high-impact solutions.`,
        contact: {
          email: options.personalInfo.email,
          location: options.personalInfo.location || "Portland, OR",
          website: options.personalInfo.website || "",
          linkedin: options.personalInfo.linkedin || "",
          github: options.personalInfo.github || "",
        },
      },
      professionalSummary: `Highly skilled ${options.job.role} with extensive experience in software development, system architecture, and technical leadership. Proven ability to deliver complex projects on time while maintaining high code quality standards. Strong background in full-stack development with expertise in modern web technologies.`,
      experience: options.contentItems
        .filter((item) => item.type === "company")
        .slice(0, 3)
        .map((item) => {
          const company = item as import("../types/content-item.types").CompanyItem
          return {
            company: company.company,
            role: company.role || options.job.role,
            location: company.location || "Remote",
            startDate: company.startDate,
            endDate: company.endDate || null,
            highlights: company.accomplishments?.slice(0, 4) || [
              "Led development of core features that increased user engagement by 35%",
              "Architected and implemented scalable microservices handling 1M+ daily requests",
              "Mentored junior engineers and established best practices for code review",
              "Reduced deployment time by 60% through CI/CD pipeline improvements",
            ],
          }
        }).map((exp) => ({
        company: exp.company,
        role: exp.role,
        location: exp.location,
        startDate: exp.startDate,
        endDate: exp.endDate,
        highlights: exp.highlights,
        technologies: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"],
      })),
      skills: [
        {
          category: "Languages",
          items: ["TypeScript", "JavaScript", "Python", "Go"],
        },
        {
          category: "Frontend",
          items: ["React", "Vue.js", "Next.js", "Tailwind CSS"],
        },
        {
          category: "Backend",
          items: ["Node.js", "Express", "PostgreSQL", "Redis"],
        },
        {
          category: "Cloud & DevOps",
          items: ["AWS", "Docker", "Kubernetes", "CI/CD"],
        },
      ],
      education: [
        {
          institution: "University of California",
          degree: "Bachelor of Science",
          field: "Computer Science",
          startDate: "2015",
          endDate: "2019",
        },
      ],
    }

    const mockTokenUsage: TokenUsage = {
      promptTokens: 2500,
      completionTokens: 1200,
      totalTokens: 3700,
    }

    return {
      content: mockContent,
      tokenUsage: mockTokenUsage,
      model: "gpt-4o-2024-08-06 (MOCK)",
    }
  }

  /**
   * Generate a mock cover letter for local development
   * This avoids hitting OpenAI API quota limits during testing
   */
  private generateMockCoverLetter(options: GenerateCoverLetterOptions): CoverLetterGenerationResult {
    this.logger.info("🎭 Generating MOCK cover letter (no API call)", {
      role: options.job.role,
      company: options.job.company,
    })

    const mockContent: CoverLetterContent = {
      greeting: "Dear Hiring Manager,",
      openingParagraph: `I am writing to express my strong interest in the ${options.job.role} position at ${options.job.company}. With my extensive background in software engineering and passion for building innovative solutions, I am confident I would be a valuable addition to your team.`,
      bodyParagraphs: [
        `Throughout my career, I have consistently delivered high-impact technical solutions that drive business value. In my most recent role, I led the development of scalable microservices that handle millions of daily requests, while maintaining a focus on code quality and team collaboration. My experience with modern web technologies and cloud infrastructure aligns perfectly with the requirements for this position.`,
        `What excites me most about ${options.job.company} is your commitment to innovation and technical excellence. I am particularly drawn to the opportunity to work on challenging problems at scale and contribute to a team that values continuous learning and growth. My background in full-stack development and system architecture would allow me to make immediate contributions while continuing to expand my skills.`,
      ],
      closingParagraph: `I would welcome the opportunity to discuss how my experience and passion for technology could contribute to ${options.job.company}'s continued success. Thank you for your consideration, and I look forward to speaking with you soon.`,
      signature: `Sincerely,\n${options.personalInfo.name}`,
    }

    const mockTokenUsage: TokenUsage = {
      promptTokens: 1800,
      completionTokens: 800,
      totalTokens: 2600,
    }

    return {
      content: mockContent,
      tokenUsage: mockTokenUsage,
      model: "gpt-4o-2024-08-06 (MOCK)",
    }
  }

  /**
   * Calculate cost in USD from token usage
   * Based on GPT-4o pricing: $2.50/1M input tokens, $10.00/1M output tokens
   */
  calculateCost(tokenUsage: TokenUsage): number {
    const inputCost = (tokenUsage.promptTokens / 1_000_000) * this.pricing.inputCostPer1M
    const outputCost = (tokenUsage.completionTokens / 1_000_000) * this.pricing.outputCostPer1M

    return inputCost + outputCost
  }

  /**
   * Static method for backward compatibility
   * @deprecated Use instance method instead
   */
  static calculateCost(tokenUsage: TokenUsage): number {
    const inputCostPer1M = 2.5
    const outputCostPer1M = 10.0

    const inputCost = (tokenUsage.promptTokens / 1_000_000) * inputCostPer1M
    const outputCost = (tokenUsage.completionTokens / 1_000_000) * outputCostPer1M

    return inputCost + outputCost
  }

  /**
   * Interpolate user prompt template with actual values
   * Used when custom prompts are provided from Firestore
   */
  private interpolateUserPrompt(template: string, options: GenerateResumeOptions): string {
    // If template doesn't use variables, just return as-is
    if (!template.includes("{{")) {
      return this.buildResumeUserPrompt(options)
    }

    // Group content items by type
    const companies = options.contentItems.filter((item) => item.type === "company")

    // Format experience data
    const experienceData = companies
      .map((item, index) => {
        const company = item as import("../types/content-item.types").CompanyItem
        const accomplishments = company.accomplishments?.join("\n• ") || "NO ACCOMPLISHMENTS PROVIDED"
        const technologies = company.technologies?.join(", ") || ""

        return `
EXPERIENCE ENTRY #${index + 1} (USE ONLY THIS DATA - DO NOT ADD ANYTHING):
Company: ${company.company}
${company.role ? `Role: ${company.role}` : "NO ROLE PROVIDED"}
${company.location ? `Location: ${company.location}` : "NO LOCATION PROVIDED"}
Start Date: ${company.startDate}
End Date: ${company.endDate || "Present"}
${company.summary ? `Summary: ${company.summary}` : "NO SUMMARY PROVIDED"}
${technologies ? `Technologies: ${technologies}` : ""}
Accomplishments:
• ${accomplishments}

END OF ENTRY #${index + 1} - USE NOTHING BEYOND THIS POINT FOR THIS ENTRY
`.trim()
      })
      .join("\n\n" + "=".repeat(80) + "\n\n")

    // Replace template variables
    return template
      .replace(/\{\{personalInfo\.name\}\}/g, options.personalInfo.name)
      .replace(/\{\{personalInfo\.email\}\}/g, options.personalInfo.email)
      .replace(/\{\{personalInfo\.phone\}\}/g, options.personalInfo.phone || "")
      .replace(/\{\{personalInfo\.location\}\}/g, options.personalInfo.location || "")
      .replace(/\{\{personalInfo\.website\}\}/g, options.personalInfo.website || "")
      .replace(/\{\{personalInfo\.linkedin\}\}/g, options.personalInfo.linkedin || "")
      .replace(/\{\{personalInfo\.github\}\}/g, options.personalInfo.github || "")
      .replace(/\{\{job\.role\}\}/g, options.job.role)
      .replace(/\{\{job\.company\}\}/g, options.job.company)
      .replace(/\{\{job\.companyWebsite\}\}/g, options.job.companyWebsite || "")
      .replace(/\{\{job\.jobDescription\}\}/g, options.job.jobDescription || "")
      .replace(/\{\{experienceData\}\}/g, experienceData)
      .replace(/\{\{emphasize\}\}/g, options.emphasize?.join(", ") || "")
  }

  /**
   * Interpolate cover letter prompt template with actual values
   */
  private interpolateCoverLetterPrompt(template: string, options: GenerateCoverLetterOptions): string {
    // If template doesn't use variables, just return as-is
    if (!template.includes("{{")) {
      return this.buildCoverLetterUserPrompt(options)
    }

    // Group content items by type
    const companies = options.contentItems.filter((item) => item.type === "company")

    // Format experience data (simplified for cover letter)
    const experienceData = companies
      .map((item) => {
        const company = item as import("../types/content-item.types").CompanyItem
        const accomplishments = company.accomplishments?.slice(0, 2).join("\n") || company.summary || ""
        return `${company.company}${company.role ? ` - ${company.role}` : ""} (${company.startDate} - ${company.endDate || "Present"})
${accomplishments}`
      })
      .join("\n\n")

    // Replace template variables
    return template
      .replace(/\{\{personalInfo\.name\}\}/g, options.personalInfo.name)
      .replace(/\{\{personalInfo\.email\}\}/g, options.personalInfo.email)
      .replace(/\{\{job\.role\}\}/g, options.job.role)
      .replace(/\{\{job\.company\}\}/g, options.job.company)
      .replace(/\{\{job\.companyWebsite\}\}/g, options.job.companyWebsite || "")
      .replace(/\{\{job\.jobDescription\}\}/g, options.job.jobDescription || "")
      .replace(/\{\{experienceData\}\}/g, experienceData)
  }
}
