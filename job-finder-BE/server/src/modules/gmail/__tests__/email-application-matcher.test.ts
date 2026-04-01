import { describe, expect, it } from 'vitest'
import { matchEmailToApplications, type ParsedEmail } from '../email-application-matcher'
import type { JobMatchWithListing, Company } from '@shared/types'

function buildMockMatch(overrides: {
  id?: string
  companyName?: string
  title?: string
  website?: string
  appliedAt?: string
  isGhost?: boolean
  ghostCompany?: string
  ghostTitle?: string
  ghostUrl?: string
} = {}): JobMatchWithListing {
  return {
    id: overrides.id ?? 'match-1',
    jobListingId: 'listing-1',
    matchScore: 85,
    matchedSkills: [],
    missingSkills: [],
    matchReasons: [],
    keyStrengths: [],
    potentialConcerns: [],
    experienceMatch: 80,
    customizationRecommendations: [],
    analyzedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedBy: null,
    queueItemId: 'q-1',
    status: 'applied',
    appliedAt: overrides.appliedAt ? new Date(overrides.appliedAt) : new Date(),
    isGhost: overrides.isGhost ?? false,
    ghostCompany: overrides.ghostCompany ?? null,
    ghostTitle: overrides.ghostTitle ?? null,
    ghostUrl: overrides.ghostUrl ?? null,
    listing: {
      id: 'listing-1',
      url: 'https://example.com/job',
      sourceId: null,
      companyId: 'company-1',
      title: overrides.title ?? 'Senior Engineer',
      companyName: overrides.companyName ?? 'Acme Corp',
      location: 'Remote',
      salaryRange: null,
      description: 'Build things',
      postedDate: null,
      status: 'matched',
      filterResult: null,
      matchScore: 85,
      applyUrl: null,
      contentFingerprint: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    company: overrides.website ? {
      id: 'company-1',
      name: overrides.companyName ?? 'Acme Corp',
      website: overrides.website
    } as Company : null
  }
}

function buildEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    sender: overrides.sender ?? 'recruiter@acme.com',
    senderDomain: overrides.senderDomain ?? 'acme.com',
    replyTo: overrides.replyTo,
    subject: overrides.subject ?? 'Your application at Acme Corp',
    body: overrides.body ?? 'Thank you for applying to Acme Corp.',
    receivedAt: overrides.receivedAt ?? new Date()
  }
}

describe('email-application-matcher', () => {
  describe('company domain matching', () => {
    it('matches email sender domain to company website domain', () => {
      const matches = [buildMockMatch({ website: 'https://www.acme.com' })]
      const email = buildEmail({ senderDomain: 'acme.com' })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.companyDomainMatch).toBe(true)
      expect(candidates[0].confidence).toBeGreaterThanOrEqual(40)
    })

    it('matches subdomain to company domain', () => {
      const matches = [buildMockMatch({ website: 'https://acme.com' })]
      const email = buildEmail({ senderDomain: 'hr.acme.com' })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.companyDomainMatch).toBe(true)
    })

    it('does not match unrelated domains with no other signals', () => {
      // Use old appliedAt so temporal proximity is 0
      const matches = [buildMockMatch({
        companyName: 'Acme Corp',
        website: 'https://acme.com',
        appliedAt: '2024-01-01T00:00:00Z'
      })]
      const email = buildEmail({
        senderDomain: 'other.com',
        subject: 'Weekly newsletter',
        body: 'Check out our latest blog post about engineering.',
        receivedAt: new Date('2025-03-01T00:00:00Z')
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(0)
    })
  })

  describe('company name in body matching', () => {
    it('detects company name in email body', () => {
      const matches = [buildMockMatch({ companyName: 'TechCorp', website: 'https://unrelated.io' })]
      const email = buildEmail({
        senderDomain: 'greenhouse.io',
        subject: 'Application update',
        body: 'Your application at TechCorp has been received.'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.companyNameInBody).toBe(true)
    })

    it('ignores very short company names to avoid false positives', () => {
      const matches = [buildMockMatch({ companyName: 'AI', title: 'Researcher', website: 'https://ai.co' })]
      const email = buildEmail({
        senderDomain: 'newsletter.io',
        subject: 'Weekly tech roundup',
        body: 'This email has AI in it naturally.'
      })

      const candidates = matchEmailToApplications(email, matches)
      // "AI" normalized is "ai" which is only 2 chars, below the 3-char minimum
      const companyNameMatches = candidates.filter(c => c.signals.companyNameInBody)
      expect(companyNameMatches).toHaveLength(0)
    })
  })

  describe('ATS email handling', () => {
    it('matches ATS email via Reply-To header', () => {
      const matches = [buildMockMatch({ website: 'https://acme.com' })]
      const email = buildEmail({
        senderDomain: 'greenhouse.io',
        replyTo: 'jobs@acme.com',
        subject: 'Your application',
        body: 'Status update'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.atsHeaderMatch).toBe(true)
    })

    it('matches ATS email via company name in subject', () => {
      const matches = [buildMockMatch({ companyName: 'Acme Corp', website: 'https://unrelated.io' })]
      const email = buildEmail({
        senderDomain: 'lever.co',
        subject: 'Your application at Acme Corp',
        body: 'We received your application.'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.companyNameInBody).toBe(true)
    })
  })

  describe('job title matching', () => {
    it('matches job title in email subject', () => {
      const matches = [buildMockMatch({ title: 'Senior Backend Engineer', website: 'https://acme.com' })]
      const email = buildEmail({
        senderDomain: 'acme.com',
        subject: 'Senior Backend Engineer - Application Update'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.jobTitleMatch).toBe(true)
    })
  })

  describe('temporal proximity scoring', () => {
    it('gives highest score for emails received same day as application', () => {
      const now = new Date()
      const matches = [buildMockMatch({ appliedAt: now.toISOString() })]
      const email = buildEmail({
        senderDomain: 'acme.com',
        receivedAt: now
      })

      // Force a domain match so we get a candidate
      matches[0].company = { id: 'c', name: 'Acme', website: 'https://acme.com' } as Company

      const candidates = matchEmailToApplications(email, matches)
      expect(candidates[0].signals.temporalProximity).toBe(15)
    })

    it('gives lower score for emails received a week later', () => {
      const appliedDate = new Date('2025-01-01')
      const emailDate = new Date('2025-01-06')
      const matches = [buildMockMatch({ appliedAt: appliedDate.toISOString(), website: 'https://acme.com' })]
      const email = buildEmail({ senderDomain: 'acme.com', receivedAt: emailDate })

      const candidates = matchEmailToApplications(email, matches)
      expect(candidates[0].signals.temporalProximity).toBe(5)
    })

    it('gives zero temporal score for emails more than 14 days after application', () => {
      const appliedDate = new Date('2025-01-01')
      const emailDate = new Date('2025-01-20')
      const matches = [buildMockMatch({ appliedAt: appliedDate.toISOString(), website: 'https://acme.com' })]
      const email = buildEmail({ senderDomain: 'acme.com', receivedAt: emailDate })

      const candidates = matchEmailToApplications(email, matches)
      expect(candidates[0].signals.temporalProximity).toBe(0)
    })
  })

  describe('confidence thresholds', () => {
    it('returns candidates sorted by confidence descending', () => {
      const matches = [
        buildMockMatch({ id: 'match-a', companyName: 'Alpha Inc', website: 'https://alpha.com' }),
        buildMockMatch({ id: 'match-b', companyName: 'Beta Corp', website: 'https://beta.com' })
      ]
      // Email from alpha.com matches the first match strongly
      const email = buildEmail({
        senderDomain: 'alpha.com',
        subject: 'Application at Alpha Inc',
        body: 'Thank you for applying to Alpha Inc.'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0].jobMatchId).toBe('match-a')
      if (candidates.length > 1) {
        expect(candidates[0].confidence).toBeGreaterThanOrEqual(candidates[1].confidence)
      }
    })

    it('excludes candidates with zero score', () => {
      const matches = [buildMockMatch({
        companyName: 'SpecificCorp',
        website: 'https://specificcorp.com',
        appliedAt: '2024-01-01T00:00:00Z'
      })]
      const email = buildEmail({
        senderDomain: 'totally-unrelated.com',
        subject: 'Newsletter from elsewhere',
        body: 'Check out our blog about cooking.',
        receivedAt: new Date('2025-03-01T00:00:00Z')
      })

      const candidates = matchEmailToApplications(email, matches)
      expect(candidates).toHaveLength(0)
    })
  })

  describe('sender domain brand matching (no website)', () => {
    it('matches sender domain containing company name when website is null', () => {
      const matches = [buildMockMatch({ companyName: 'Stripe' })]
      // No website set (company is null)
      matches[0].company = null
      const email = buildEmail({
        senderDomain: 'stripe.com',
        subject: 'Next Steps with Stripe',
        body: 'Hi Josh, thanks for interviewing.'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.senderDomainNameMatch).toBe(true)
      expect(candidates[0].confidence).toBeGreaterThanOrEqual(35)
    })

    it('matches company name contained in sender domain brand (dropboxjobs.com → Dropbox)', () => {
      const matches = [buildMockMatch({ companyName: 'Dropbox' })]
      matches[0].company = null
      const email = buildEmail({
        senderDomain: 'mail.dropboxjobs.com',
        subject: 'Update on your candidacy from Dropbox',
        body: 'Hi Joshua, after careful consideration...'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.senderDomainNameMatch).toBe(true)
    })

    it('does not fire for ATS domains', () => {
      const matches = [buildMockMatch({ companyName: 'Greenhouse', appliedAt: '2024-01-01T00:00:00Z' })]
      matches[0].company = null
      const email = buildEmail({
        senderDomain: 'greenhouse.io',
        subject: 'Application update',
        body: 'Status update on your application',
        receivedAt: new Date('2025-03-01T00:00:00Z')
      })

      const candidates = matchEmailToApplications(email, matches)

      const brandMatches = candidates.filter(c => c.signals.senderDomainNameMatch)
      expect(brandMatches).toHaveLength(0)
    })

    it('does not fire when company has a website (companyDomain exists)', () => {
      const matches = [buildMockMatch({ companyName: 'Acme Corp', website: 'https://acme.com' })]
      const email = buildEmail({ senderDomain: 'acme.com' })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates[0].signals.companyDomainMatch).toBe(true)
      expect(candidates[0].signals.senderDomainNameMatch).toBeUndefined()
    })

    it('handles multi-part TLDs like .co.uk correctly', () => {
      const matches = [buildMockMatch({ companyName: 'Barclays' })]
      matches[0].company = null
      const email = buildEmail({
        senderDomain: 'barclays.co.uk',
        subject: 'Application update from Barclays',
        body: 'Thank you for applying.'
      })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.senderDomainNameMatch).toBe(true)
    })
  })

  describe('transactional subdomain normalization', () => {
    it('matches mail.company.com to company.com website', () => {
      const matches = [buildMockMatch({ website: 'https://dropbox.com' })]
      const email = buildEmail({ senderDomain: 'mail.dropbox.com' })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates).toHaveLength(1)
      expect(candidates[0].signals.companyDomainMatch).toBe(true)
    })

    it('matches email.company.com to company.com website', () => {
      const matches = [buildMockMatch({ website: 'https://acme.com' })]
      const email = buildEmail({ senderDomain: 'email.acme.com' })

      const candidates = matchEmailToApplications(email, matches)

      expect(candidates[0].signals.companyDomainMatch).toBe(true)
    })
  })

  describe('ghost match support', () => {
    it('matches against ghost match company name', () => {
      const matches = [buildMockMatch({
        isGhost: true,
        ghostCompany: 'StartupXYZ',
        ghostTitle: 'Frontend Dev',
        ghostUrl: 'https://startupxyz.com/careers'
      })]
      const email = buildEmail({
        senderDomain: 'startupxyz.com',
        subject: 'Your application at StartupXYZ',
        body: 'We received your application.'
      })

      const candidates = matchEmailToApplications(email, matches)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0].signals.companyNameInBody).toBe(true)
    })
  })
})
