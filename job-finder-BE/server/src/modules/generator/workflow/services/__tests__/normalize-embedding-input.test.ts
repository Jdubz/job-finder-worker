import { describe, it, expect } from 'vitest'
import { normalizeForEmbedding } from '../normalize-embedding-input'

// Helper: builds a realistic preserved section to exceed the 100-char minimum
// and ensure the safety guard doesn't trip when boilerplate is at the end
const PRESERVED_BLOCK = `Responsibilities:
- Build and maintain scalable distributed systems using TypeScript and Node.js
- Design and implement RESTful APIs and GraphQL endpoints
- Collaborate with cross-functional teams to deliver product features
- Write comprehensive unit and integration tests`

describe('normalizeForEmbedding', () => {
  // ── Pass-through cases ─────────────────────────────────────────────────

  it('returns empty string unchanged', () => {
    expect(normalizeForEmbedding('')).toBe('')
  })

  it('returns short input unchanged (< 100 chars)', () => {
    const short = 'Senior engineer role at Acme'
    expect(normalizeForEmbedding(short)).toBe(short)
  })

  it('returns text without boilerplate sections unchanged', () => {
    const text = `${PRESERVED_BLOCK}

Requirements:
- 5+ years experience
- TypeScript proficiency`
    expect(normalizeForEmbedding(text)).toBe(text)
  })

  // ── Section stripping ──────────────────────────────────────────────────

  it('strips "About Us" section', () => {
    const text = `${PRESERVED_BLOCK}

About Us:
We are a leading fintech company founded in 2010.
We have 500+ employees worldwide.

Requirements:
- 3+ years TypeScript`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('Build and maintain')
    expect(result).toContain('Requirements')
    expect(result).not.toContain('leading fintech')
    expect(result).not.toContain('500+ employees')
  })

  it('strips "About the Company" section', () => {
    const text = `${PRESERVED_BLOCK}

About the Company:
Founded in Silicon Valley, we build innovative products.

Qualifications:
- Python, Go`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('distributed systems')
    expect(result).toContain('Qualifications')
    expect(result).not.toContain('Silicon Valley')
  })

  it('strips "Benefits" section', () => {
    const text = `${PRESERVED_BLOCK}

Benefits:
- Unlimited PTO
- 401(k) matching
- Health insurance

Tech Stack:
- React, Node.js`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('RESTful APIs')
    expect(result).toContain('Tech Stack')
    expect(result).not.toContain('Unlimited PTO')
    expect(result).not.toContain('401(k)')
  })

  it('strips "What We Offer" section', () => {
    const text = `${PRESERVED_BLOCK}

What We Offer:
- Competitive salary
- Remote work flexibility

Skills:
- Kubernetes`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('distributed systems')
    expect(result).not.toContain('Competitive salary')
  })

  it('strips "Compensation and Benefits" section', () => {
    const text = `${PRESERVED_BLOCK}

Compensation and Benefits:
- Base salary $120k-$180k
- Annual bonus
- Stock options

Requirements:
- 5 years experience`
    const result = normalizeForEmbedding(text)
    expect(result).not.toContain('$120k')
    expect(result).toContain('5 years experience')
  })

  it('strips "Equal Opportunity" / EEO section', () => {
    const text = `${PRESERVED_BLOCK}

Qualifications:
- BS in Computer Science

Equal Opportunity:
We are an equal opportunity employer and value diversity.
All qualified applicants will receive consideration.`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('BS in Computer Science')
    expect(result).not.toContain('equal opportunity employer')
  })

  it('strips "How to Apply" section', () => {
    const text = `${PRESERVED_BLOCK}

Requirements:
- Strong problem solving

How to Apply:
Submit your resume and cover letter through our portal.
Include a link to your GitHub profile.`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('Strong problem solving')
    expect(result).not.toContain('Submit your resume')
  })

  it('strips boilerplate sections without trailing colon', () => {
    const text = `${PRESERVED_BLOCK}

About Us
We are a leading fintech company founded in 2010.
We have 500+ employees worldwide.

Requirements
- 3+ years TypeScript`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('Build and maintain')
    expect(result).toContain('Requirements')
    expect(result).not.toContain('leading fintech')
    expect(result).not.toContain('500+ employees')
  })

  it('strips markdown-headed boilerplate sections', () => {
    const text = `## Responsibilities
- Build scalable APIs
- Design microservices and distributed systems architecture
- Collaborate with product and design teams on feature delivery
- Implement CI/CD pipelines and deployment automation

## About Us
We are a leading company in the industry.

## Requirements
- TypeScript, React`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('Build scalable APIs')
    expect(result).toContain('Requirements')
    expect(result).not.toContain('leading company')
  })

  // ── Preserves role-relevant content ────────────────────────────────────

  it('preserves responsibilities section', () => {
    const text = `About Us:
Boilerplate company info here that nobody cares about.

${PRESERVED_BLOCK}

Benefits:
- Free lunch`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('Design and implement RESTful APIs')
    expect(result).toContain('cross-functional teams')
  })

  it('preserves requirements and qualifications', () => {
    const text = `${PRESERVED_BLOCK}

Benefits:
- Health insurance and dental coverage

Requirements:
- 5+ years with TypeScript
- Experience with distributed systems

Qualifications:
- BS in CS or equivalent`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('5+ years with TypeScript')
    expect(result).toContain('distributed systems')
  })

  // ── Safety guard ───────────────────────────────────────────────────────

  it('returns original when >70% would be stripped (safety guard)', () => {
    // Construct text that's mostly "About Us" boilerplate
    const boilerplate = 'A'.repeat(300)
    const text = `About Us:\n${boilerplate}\n\nRequirements:\n- TypeScript`
    const result = normalizeForEmbedding(text)
    // Should return original because stripping >70% of content
    expect(result).toBe(text)
  })

  // ── Multiple sections ──────────────────────────────────────────────────

  it('strips multiple boilerplate sections from the same JD', () => {
    const text = `${PRESERVED_BLOCK}

About Us:
We are an amazing company.

Benefits:
- Free snacks
- Gym membership

Requirements:
- 3+ years experience

Equal Opportunity:
We are committed to diversity.`
    const result = normalizeForEmbedding(text)
    expect(result).toContain('Build and maintain')
    expect(result).toContain('unit and integration tests')
    expect(result).toContain('3+ years experience')
    expect(result).not.toContain('amazing company')
    expect(result).not.toContain('Free snacks')
    expect(result).not.toContain('committed to diversity')
  })
})
