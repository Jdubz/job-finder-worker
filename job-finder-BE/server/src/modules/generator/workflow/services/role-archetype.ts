/**
 * Role archetype classification for document cache Tier 1.75 lookup.
 * Maps normalized job titles to broad archetypes so that "React Developer"
 * and "Frontend Engineer" can share cached resumes.
 */

export type RoleArchetype =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'devops'
  | 'data'
  | 'ml-ai'
  | 'mobile'
  | 'security'
  | 'embedded'
  | 'qa'

interface ArchetypePattern {
  archetype: RoleArchetype
  pattern: RegExp
}

/**
 * Ordered list of patterns — more specific archetypes first.
 * "fullstack" must come before "frontend"/"backend" so "full stack developer"
 * doesn't match "backend" via the generic pattern.
 */
const ARCHETYPE_PATTERNS: ArchetypePattern[] = [
  // ML/AI — before "data" since "machine learning data engineer" should be ml-ai
  { archetype: 'ml-ai', pattern: /\b(machine learning|ml|artificial intelligence|ai|deep learning|nlp|computer vision)\b/ },

  // Fullstack — before frontend/backend
  { archetype: 'fullstack', pattern: /\b(full[\s-]?stack|fullstack)\b/ },

  // Mobile — before frontend so "react native developer" matches mobile, not frontend
  { archetype: 'mobile', pattern: /\b(mobile|ios|android|react native|flutter|swift|kotlin)\b/ },

  // Frontend — includes framework names that appear in titles
  { archetype: 'frontend', pattern: /\b(front[\s-]?end|frontend|ui|ux|react|vue|angular|svelte)\b/ },

  // Backend
  { archetype: 'backend', pattern: /\b(back[\s-]?end|backend|server[\s-]?side|api)\b/ },

  // DevOps/SRE/Platform
  { archetype: 'devops', pattern: /\b(devops|sre|site reliability|infrastructure|platform|cloud|devsecops)\b/ },

  // Data engineering/analytics — after ml-ai
  { archetype: 'data', pattern: /\b(data|analytics|etl|bi|business intelligence|data warehouse)\b/ },

  // Security
  { archetype: 'security', pattern: /\b(security|cybersecurity|appsec|infosec|penetration|pentest)\b/ },

  // Embedded/firmware
  { archetype: 'embedded', pattern: /\b(embedded|firmware|iot|rtos|fpga|hardware)\b/ },

  // QA/Testing
  { archetype: 'qa', pattern: /\b(qa|quality assurance|test|sdet|automation)\b/ },
]

/**
 * Classify a normalized role title into a broad archetype.
 * Returns null for ambiguous titles like "software engineer" that don't
 * indicate a specific domain.
 */
export function getRoleArchetype(normalizedRole: string): RoleArchetype | null {
  const lower = normalizedRole.toLowerCase()
  for (const { archetype, pattern } of ARCHETYPE_PATTERNS) {
    if (pattern.test(lower)) return archetype
  }
  return null
}
