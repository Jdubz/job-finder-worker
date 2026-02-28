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
