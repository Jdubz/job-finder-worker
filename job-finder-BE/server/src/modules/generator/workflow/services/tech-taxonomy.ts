/**
 * Skill taxonomy for semantic tech-stack normalization in the document cache.
 * Ported from Python worker's scoring/taxonomy.py _core_seeds().
 *
 * Provides synonym → canonical mapping and category grouping so that
 * "React.js", "ReactJS", and "react" all fingerprint identically, and
 * same-category techs (React vs Vue) get partial credit in Jaccard scoring.
 */

// ── Taxonomy data ───────────────────────────────────────────────────────────

interface TaxonEntry {
  canonical: string
  category: string
  synonyms: string[] // includes canonical itself
}

const TAXONOMY: TaxonEntry[] = [
  // Frontend frameworks
  { canonical: 'react', category: 'frontend', synonyms: ['react', 'reactjs', 'react.js'] },
  { canonical: 'nextjs', category: 'frontend', synonyms: ['nextjs', 'next.js', 'next'] },
  { canonical: 'vue', category: 'frontend', synonyms: ['vue', 'vuejs', 'vue.js'] },
  { canonical: 'angular', category: 'frontend', synonyms: ['angular', 'angularjs'] },
  { canonical: 'svelte', category: 'frontend', synonyms: ['svelte', 'sveltekit'] },

  // Core languages
  { canonical: 'javascript', category: 'language', synonyms: ['javascript', 'js', 'ecmascript'] },
  { canonical: 'typescript', category: 'language', synonyms: ['typescript', 'ts'] },
  { canonical: 'python', category: 'language', synonyms: ['python', 'py', 'python3'] },

  // Backend frameworks
  { canonical: 'node.js', category: 'backend', synonyms: ['node.js', 'nodejs', 'node'] },
  { canonical: 'express', category: 'backend', synonyms: ['express', 'expressjs', 'express.js'] },
  { canonical: 'fastapi', category: 'backend', synonyms: ['fastapi', 'fast-api'] },
  { canonical: 'django', category: 'backend', synonyms: ['django'] },
  { canonical: 'flask', category: 'backend', synonyms: ['flask'] },

  // API patterns
  { canonical: 'graphql', category: 'api', synonyms: ['graphql', 'gql'] },
  { canonical: 'rest', category: 'api', synonyms: ['rest', 'restful', 'restful api'] },

  // Cloud providers
  { canonical: 'aws', category: 'cloud', synonyms: ['aws', 'amazon web services', 'amazon'] },
  { canonical: 'gcp', category: 'cloud', synonyms: ['gcp', 'google cloud platform', 'google cloud'] },
  { canonical: 'azure', category: 'cloud', synonyms: ['azure', 'microsoft azure'] },

  // Databases
  { canonical: 'postgres', category: 'database', synonyms: ['postgres', 'postgresql', 'psql'] },
  { canonical: 'mysql', category: 'database', synonyms: ['mysql', 'mariadb'] },
  { canonical: 'mongodb', category: 'database', synonyms: ['mongodb', 'mongo'] },
  { canonical: 'redis', category: 'cache', synonyms: ['redis'] },
  { canonical: 'sql', category: 'database', synonyms: ['sql'] },
  { canonical: 'nosql', category: 'database', synonyms: ['nosql'] },

  // Container/orchestration
  { canonical: 'docker', category: 'devops', synonyms: ['docker', 'containers'] },
  { canonical: 'kubernetes', category: 'devops', synonyms: ['kubernetes', 'k8s'] },
]

// ── Lookup maps (built once at module load) ────────────────────────────────

/** synonym (lowercased) → canonical */
const synonymLookup = new Map<string, string>()

/** canonical → category */
const categoryLookup = new Map<string, string>()

for (const entry of TAXONOMY) {
  categoryLookup.set(entry.canonical, entry.category)
  for (const syn of entry.synonyms) {
    synonymLookup.set(syn.toLowerCase(), entry.canonical)
  }
}

// ── Display names (canonical → human-readable) ─────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  // Frontend
  react: 'React',
  nextjs: 'Next.js',
  vue: 'Vue.js',
  angular: 'Angular',
  svelte: 'Svelte',
  tailwind: 'Tailwind CSS',
  materialui: 'Material UI',
  chakraui: 'Chakra UI',
  redux: 'Redux',
  zustand: 'Zustand',
  storybook: 'Storybook',
  webpack: 'Webpack',
  vite: 'Vite',

  // Languages
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  golang: 'Go',
  rust: 'Rust',
  java: 'Java',
  csharp: 'C#',
  cpp: 'C++',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',

  // Backend
  'node.js': 'Node.js',
  express: 'Express',
  fastapi: 'FastAPI',
  django: 'Django',
  flask: 'Flask',
  nestjs: 'NestJS',
  rails: 'Ruby on Rails',

  // API
  graphql: 'GraphQL',
  rest: 'REST',
  grpc: 'gRPC',
  websocket: 'WebSocket',

  // Cloud
  aws: 'AWS',
  gcp: 'Google Cloud',
  azure: 'Azure',

  // Databases
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
  sql: 'SQL',
  nosql: 'NoSQL',
  sqlite: 'SQLite',
  elasticsearch: 'Elasticsearch',
  dynamodb: 'DynamoDB',

  // DevOps
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  terraform: 'Terraform',
  jenkins: 'Jenkins',
  cicd: 'CI/CD',
  github: 'GitHub',
  gitlab: 'GitLab',
  git: 'Git',

  // Testing
  jest: 'Jest',
  vitest: 'Vitest',
  cypress: 'Cypress',
  playwright: 'Playwright',

  // Other
  linux: 'Linux',
  nginx: 'NGINX',
  rabbitmq: 'RabbitMQ',
  kafka: 'Kafka',
  oauth: 'OAuth',
  jwt: 'JWT',
  sass: 'Sass',
  scss: 'SCSS',
  css: 'CSS',
  html: 'HTML',
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Map a single tech term to its canonical form.
 * Unknown terms fall through as themselves (lowercased).
 */
export function canonicalizeTech(tech: string): string {
  const key = tech.toLowerCase().trim()
  return synonymLookup.get(key) ?? key
}

/**
 * Canonicalize, deduplicate, and sort a tech stack array.
 * Suitable for use in fingerprint hashing (deterministic output).
 */
export function canonicalizeTechStack(techs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const t of techs) {
    const canonical = canonicalizeTech(t)
    if (!seen.has(canonical)) {
      seen.add(canonical)
      result.push(canonical)
    }
  }
  return result.sort()
}

/**
 * Get the category for a canonical tech term, or null if unknown.
 */
export function getTechCategory(canonical: string): string | null {
  return categoryLookup.get(canonical) ?? null
}

/**
 * Get the human-readable display name for a tech term.
 * Resolves synonyms first, then looks up display name.
 * Unknown terms are title-cased as a best guess.
 */
export function displayTech(tech: string): string {
  const canonical = canonicalizeTech(tech)
  if (DISPLAY_NAMES[canonical]) return DISPLAY_NAMES[canonical]
  // Preserve original casing for unknown terms if it looks intentional
  const trimmed = tech.trim()
  if (trimmed && trimmed[0] === trimmed[0].toUpperCase()) return trimmed
  // Title-case as fallback
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Deduplicate and normalize capitalization of a tech list.
 * Preserves order of first occurrence.
 */
export function normalizeTechList(techs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const t of techs) {
    const canonical = canonicalizeTech(t)
    if (!seen.has(canonical)) {
      seen.add(canonical)
      result.push(displayTech(t))
    }
  }
  return result
}
