#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

// Fallback prompts for import (no defaults in shared - fail loud approach)
const FALLBACK_PROMPTS = {
  resumeGeneration: "Resume generation prompt - configure in database",
  coverLetterGeneration: "Cover letter generation prompt - configure in database",
  jobScraping: "Job scraping prompt - configure in database",
  jobMatching: "Job matching prompt - configure in database",
}

const DB_PATH = '/srv/job-finder/data/jobfinder.db'
const EXPORT_BASE = path.resolve('infra/sqlite/seeders/output')
const DEFAULT_ACTOR = 'admin'

const SOURCE_PRIORITY = ['portfolio', 'portfolio-staging'] // earlier wins

function loadCollection(env, name) {
  const file = path.join(EXPORT_BASE, env, `${name}.json`)
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = JSON.parse(raw)
  return parsed.documents.map((doc) => ({ env, ...doc }))
}

function dedupeById(collections) {
  const map = new Map()
  for (const env of SOURCE_PRIORITY) {
    for (const doc of collections.filter((d) => d.env === env)) {
      if (!map.has(doc.id)) map.set(doc.id, doc)
    }
  }
  return Array.from(map.values())
}

function toIso(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value._seconds) return new Date(value._seconds * 1000).toISOString()
  return null
}

function insertCompanies(db, docs) {
  const stmt = db.prepare(`INSERT INTO companies (
    id, name, name_lower, website, about, culture, mission, size, company_size_category,
    founded, industry, headquarters_location, has_portland_office, tech_stack, tier,
    priority_score, created_at, updated_at
  ) VALUES (
    @id, @name, @name_lower, @website, @about, @culture, @mission, @size, @company_size_category,
    @founded, @industry, @headquarters_location, @has_portland_office, @tech_stack, @tier,
    @priority_score, @created_at, @updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    name_lower=excluded.name_lower,
    website=excluded.website,
    about=excluded.about,
    culture=excluded.culture,
    mission=excluded.mission,
    size=excluded.size,
    company_size_category=excluded.company_size_category,
    founded=excluded.founded,
    industry=excluded.industry,
    headquarters_location=excluded.headquarters_location,
    has_portland_office=excluded.has_portland_office,
    tech_stack=excluded.tech_stack,
    tier=excluded.tier,
    priority_score=excluded.priority_score,
    updated_at=excluded.updated_at
  `)

  const mapped = docs.map((d) => ({
    id: d.id,
    name: d.name,
    name_lower: (d.name || '').toLowerCase(),
    website: d.website ?? null,
    about: d.about ?? null,
    culture: d.culture ?? null,
    mission: d.mission ?? null,
    size: d.size ?? null,
    company_size_category: d.company_size_category ?? null,
    founded: d.founded ?? null,
    industry: d.industry ?? null,
    headquarters_location: d.headquarters_location ?? null,
    has_portland_office: d.hasPortlandOffice ? 1 : 0,
    tech_stack: d.techStack ? JSON.stringify(d.techStack) : null,
    tier: d.tier ?? null,
    priority_score: d.priorityScore ?? null,
    created_at: toIso(d.createdAt) ?? new Date().toISOString(),
    updated_at: toIso(d.updatedAt) ?? new Date().toISOString()
  }))

  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)))
  tx(mapped)
  return mapped.length
}

function normalizeSkills(skills) {
  if (!skills) return null
  if (Array.isArray(skills)) return JSON.stringify(skills)
  return JSON.stringify(skills)
}

function insertContentItems(db, docs) {
  const stmt = db.prepare(`INSERT INTO content_items (
    id, parent_id, order_index, title, role, location, website,
    start_date, end_date, description, skills, created_at, updated_at, created_by, updated_by
  ) VALUES (
    @id, @parent_id, @order_index, @title, @role, @location, @website,
    @start_date, @end_date, @description, @skills, @created_at, @updated_at, @created_by, @updated_by
  )
  ON CONFLICT(id) DO UPDATE SET
    parent_id=excluded.parent_id,
    order_index=excluded.order_index,
    title=excluded.title,
    role=excluded.role,
    location=excluded.location,
    website=excluded.website,
    start_date=excluded.start_date,
    end_date=excluded.end_date,
    description=excluded.description,
    skills=excluded.skills,
    updated_at=excluded.updated_at,
    updated_by=excluded.updated_by
  `)

  const mapped = docs.map((d, idx) => {
    const body = d.body || d.body_json || {}
    const title =
      d.title ??
      d.name ??
      d.heading ??
      d.company ??
      d.category ??
      body.title ??
      body.name ??
      body.heading ??
      body.company ??
      body.category ??
      null
    const role = d.role ?? body.role ?? null
    const website = d.website ?? body.website ?? body.url ?? (body.links && body.links[0]?.url)
    const location = d.location ?? body.location
    const orderIndex = d.order ?? d.order_index ?? d.orderIndex ?? idx
    const start = d.startDate ?? d.start_date ?? body.startDate ?? body.start_date
    const end = d.endDate ?? d.end_date ?? body.endDate ?? body.end_date
    const description =
      d.description ??
      d.summary ??
      d.content ??
      (Array.isArray(d.accomplishments) ? d.accomplishments.join('\\n') : undefined) ??
      (Array.isArray(body.accomplishments) ? body.accomplishments.join('\\n') : undefined) ??
      body.description ??
      body.summary ??
      body.content ??
      d.notes ??
      body.notes ??
      null
    let skills = d.skills ?? body.skills ?? d.technologies ?? body.technologies
    if ((!skills || (Array.isArray(skills) && skills.length === 0)) && Array.isArray(d.subcategories)) {
      const merged = []
      d.subcategories.forEach((sub) => {
        if (Array.isArray(sub?.skills)) merged.push(...sub.skills)
      })
      skills = merged.length ? merged : skills
    }

    const parent_id_raw = d.parentId ?? (typeof d.parent_id === 'string' ? d.parent_id : null)
    const parent_id = parent_id_raw && typeof parent_id_raw === 'string' && parent_id_raw.trim().length ? parent_id_raw : null

    return {
      id: d.id,
      parent_id,
      order_index: Number.isFinite(orderIndex) ? orderIndex : parseInt(orderIndex ?? idx, 10) || idx,
      title: title ?? null,
      role: role ?? null,
      location: location ?? null,
      website: website ?? null,
      start_date: start ?? null,
      end_date: end ?? null,
      description: description ?? null,
      skills: normalizeSkills(skills),
      created_at: toIso(d.createdAt) ?? new Date().toISOString(),
      updated_at: toIso(d.updatedAt) ?? new Date().toISOString(),
      created_by: d.createdBy ?? DEFAULT_ACTOR,
      updated_by: d.updatedBy ?? d.createdBy ?? DEFAULT_ACTOR
    }
  })

  // insert roots first, then children level-order to satisfy FK
  const childrenMap = new Map()
  mapped.forEach((m) => {
    if (m.parent_id) {
      if (!childrenMap.has(m.parent_id)) childrenMap.set(m.parent_id, [])
      childrenMap.get(m.parent_id).push(m)
    }
  })

  const roots = mapped.filter((m) => !m.parent_id)
  const queue = [...roots]
  const ordered = []
  while (queue.length) {
    const node = queue.shift()
    ordered.push(node)
    const kids = childrenMap.get(node.id) ?? []
    queue.push(...kids)
  }

  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)))
  tx(ordered)
  return ordered.length
}

function insertJobSources(db, docs) {
  const stmt = db.prepare(`INSERT INTO job_sources (
    id, name, source_type, status, config_json, tags, company_id, company_name,
    last_scraped_at, last_scraped_status, last_scraped_error, total_jobs_found,
    total_jobs_matched, consecutive_failures, created_at, updated_at
  ) VALUES (
    @id, @name, @source_type, @status, @config_json, @tags, @company_id, @company_name,
    @last_scraped_at, @last_scraped_status, @last_scraped_error, @total_jobs_found,
    @total_jobs_matched, @consecutive_failures, @created_at, @updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    source_type=excluded.source_type,
    status=excluded.status,
    config_json=excluded.config_json,
    tags=excluded.tags,
    company_id=excluded.company_id,
    company_name=excluded.company_name,
    last_scraped_at=excluded.last_scraped_at,
    last_scraped_status=excluded.last_scraped_status,
    last_scraped_error=excluded.last_scraped_error,
    total_jobs_found=excluded.total_jobs_found,
    total_jobs_matched=excluded.total_jobs_matched,
    consecutive_failures=excluded.consecutive_failures,
    updated_at=excluded.updated_at
  `)

  const mapped = docs.map((d) => ({
    id: d.id,
    name: d.name,
    source_type: d.sourceType ?? d.type ?? 'unknown',
    status: d.enabled === false ? 'disabled' : 'active',
    config_json: JSON.stringify(d.config ?? {}),
    tags: d.tags ? JSON.stringify(d.tags) : null,
    company_id: d.companyId ?? null,
    company_name: d.companyName ?? null,
    last_scraped_at: toIso(d.lastScrapedAt),
    last_scraped_status: d.lastScrapedStatus ?? null,
    last_scraped_error: d.lastScrapedError ? JSON.stringify(d.lastScrapedError) : null,
    total_jobs_found: d.totalJobsFound ?? 0,
    total_jobs_matched: d.totalJobsMatched ?? 0,
    consecutive_failures: d.consecutiveFailures ?? 0,
    created_at: toIso(d.createdAt) ?? new Date().toISOString(),
    updated_at: toIso(d.updatedAt) ?? new Date().toISOString()
  }))

  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)))
  tx(mapped)
  return mapped.length
}

function insertJobFinderConfig(db, docs) {
  const stmt = db.prepare(`INSERT INTO job_finder_config (id, name, payload_json, updated_at)
    VALUES (@id, @name, @payload_json, @updated_at)
    ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, name=excluded.name, updated_at=excluded.updated_at`)

  const mapped = docs.map((d) => ({
    id: d.id,
    name: d.name ?? d.id,
    payload_json: JSON.stringify(d),
    updated_at: toIso(d.updatedAt) ?? new Date().toISOString()
  }))

  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)))
  tx(mapped)
  return mapped.length
}

function insertJobMatches(db, docs) {
  const stmt = db.prepare(`INSERT INTO job_matches (
    id, url, company_name, company_id, job_title, location, salary_range, job_description, company_info,
    match_score, matched_skills, missing_skills, match_reasons, key_strengths, potential_concerns,
    experience_match, customization_recommendations, resume_intake_json, analyzed_at,
    submitted_by, queue_item_id, created_at, updated_at
  ) VALUES (
    @id, @url, @company_name, @company_id, @job_title, @location, @salary_range, @job_description, @company_info,
    @match_score, @matched_skills, @missing_skills, @match_reasons, @key_strengths, @potential_concerns,
    @experience_match, @customization_recommendations, @resume_intake_json, @analyzed_at,
    @submitted_by, @queue_item_id, @created_at, @updated_at
  )
  ON CONFLICT(url) DO UPDATE SET
    company_name=excluded.company_name,
    job_title=excluded.job_title,
    job_description=excluded.job_description,
    match_score=excluded.match_score,
    matched_skills=excluded.matched_skills,
    missing_skills=excluded.missing_skills,
    key_strengths=excluded.key_strengths,
    potential_concerns=excluded.potential_concerns,
    updated_at=excluded.updated_at
  `)

  const mapped = docs.map((d) => ({
    id: d.id,
    url: d.url ?? `missing-url-${d.id}`,
    company_name: d.company ?? d.companyName ?? 'Unknown',
    company_id: d.companyId ?? null,
    job_title: d.role ?? d.title ?? 'Unknown',
    location: d.location ?? null,
    salary_range: d.salaryRange ?? null,
    job_description: d.description ?? '',
    company_info: d.companyInfo ?? null,
    match_score: d.matchScore ?? 0,
    matched_skills: d.matchedSkills ? JSON.stringify(d.matchedSkills) : null,
    missing_skills: d.missingSkills ? JSON.stringify(d.missingSkills) : null,
    match_reasons: d.matchReasons ? JSON.stringify(d.matchReasons) : null,
    key_strengths: d.keyStrengths ? JSON.stringify(d.keyStrengths) : null,
    potential_concerns: d.potentialConcerns ? JSON.stringify(d.potentialConcerns) : null,
    experience_match: d.experienceMatch ?? null,
    customization_recommendations: d.customizationRecommendations
      ? JSON.stringify(d.customizationRecommendations)
      : null,
    resume_intake_json: d.resumeIntakeData ? JSON.stringify(d.resumeIntakeData) : null,
    analyzed_at: toIso(d.documentGeneratedAt ?? d.analyzedAt ?? d.updatedAt),
    submitted_by: d.submittedBy ?? null,
    queue_item_id: d.queueItemId ?? null,
    created_at: toIso(d.createdAt) ?? new Date().toISOString(),
    updated_at: toIso(d.updatedAt) ?? new Date().toISOString()
  }))

  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)))
  tx(mapped)
  return mapped.length
}

function main() {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const companies = dedupeById(['portfolio', 'portfolio-staging'].flatMap((env) => loadCollection(env, 'companies')))
  const jobSources = dedupeById(['portfolio', 'portfolio-staging'].flatMap((env) => loadCollection(env, 'job-sources')))
  const jobFinderConfig = dedupeById(['portfolio', 'portfolio-staging'].flatMap((env) => loadCollection(env, 'job-finder-config')))
  const generatorDocs = dedupeById(['portfolio', 'portfolio-staging'].flatMap((env) => loadCollection(env, 'generator')))
  const personalInfo = generatorDocs.find((d) => d.id === 'personal-info')

  const extractedPrompts =
    personalInfo?.aiPrompts && typeof personalInfo.aiPrompts === 'object' ? personalInfo.aiPrompts : null

  const aiPromptsPayload = extractedPrompts ?? FALLBACK_PROMPTS
  const aiPromptsEntry = {
    id: 'ai-prompts',
    payload: aiPromptsPayload,
    updatedAt: (personalInfo?.updatedAt && toIso(personalInfo.updatedAt)) || new Date().toISOString(),
    updatedBy: personalInfo?.updatedBy ?? 'import-script'
  }

  const existingAiPromptsIndex = jobFinderConfig.findIndex((d) => d.id === 'ai-prompts')
  if (existingAiPromptsIndex >= 0) {
    jobFinderConfig[existingAiPromptsIndex] = aiPromptsEntry
  } else {
    jobFinderConfig.push(aiPromptsEntry)
  }
  const contentItems = loadCollection('portfolio', 'content-items') // staging duplicates; keep prod canonical
  const jobMatches = loadCollection('portfolio-staging', 'job-matches') // prod has none

  console.log('Importing...')
  console.log('companies:', insertCompanies(db, companies))
  console.log('job_sources:', insertJobSources(db, jobSources))
  console.log('job_finder_config:', insertJobFinderConfig(db, jobFinderConfig))
  console.log('content_items:', insertContentItems(db, contentItems))
  console.log('job_matches:', insertJobMatches(db, jobMatches))
  console.log('done')
}

main()
