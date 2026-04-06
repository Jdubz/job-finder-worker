import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/sqlite'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { ApplicationEmailRepository } from '../application-email.repository'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'
import { CompanyRepository } from '../../companies/company.repository'

// Mock the gmail-api module so we don't make real HTTP calls
vi.mock('../gmail-api', () => ({
  ensureAccessToken: vi.fn().mockResolvedValue({ access_token: 'mock-token', expiry_date: Date.now() + 3600000 }),
  fetchMessageList: vi.fn().mockResolvedValue({ items: [], latestHistoryId: undefined }),
  fetchFullMessages: vi.fn().mockResolvedValue([]),
  extractBody: vi.fn().mockReturnValue(''),
  getHeader: vi.fn().mockReturnValue(undefined),
  extractSenderDomain: vi.fn().mockReturnValue(undefined)
}))

// Mock the gmail-auth.service to return controlled accounts
vi.mock('../gmail-auth.service', () => {
  return {
    GmailAuthService: vi.fn().mockImplementation(() => ({
      listAccounts: vi.fn().mockReturnValue([]),
      getTokensForGmailEmail: vi.fn().mockReturnValue({
        refresh_token: 'mock-refresh',
        access_token: 'mock-access',
        expiry_date: Date.now() + 3600000
      }),
      saveHistoryId: vi.fn()
    }))
  }
})

import { ApplicationTrackerService } from '../application-tracker.service'
import { GmailAuthService } from '../gmail-auth.service'
import * as gmailApi from '../gmail-api'

/** Configure auth mock to return a single active account with valid tokens */
function mockActiveAccount(gmailEmail = 'user@gmail.com') {
  (GmailAuthService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    listAccounts: vi.fn().mockReturnValue([{ gmailEmail, hasRefreshToken: true }]),
    getTokensForGmailEmail: vi.fn().mockReturnValue({
      refresh_token: 'r', access_token: 'a', expiry_date: Date.now() + 3600000
    }),
    saveHistoryId: vi.fn()
  }))
}

/** Configure Gmail API mocks for a single message with consistent headers */
function mockGmailMessage(msg: {
  id: string
  threadId: string
  from: string
  subject: string
  body: string
  senderDomain: string
}) {
  (gmailApi.fetchMessageList as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [{ id: msg.id, threadId: msg.threadId }]
  });
  (gmailApi.fetchFullMessages as ReturnType<typeof vi.fn>).mockResolvedValue([{
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.body.slice(0, 100),
    payload: {
      headers: [
        { name: 'From', value: msg.from },
        { name: 'Subject', value: msg.subject },
        { name: 'Date', value: new Date().toISOString() }
      ]
    }
  }]);
  (gmailApi.getHeader as ReturnType<typeof vi.fn>).mockImplementation(
    (_m: unknown, name: string) => {
      const headers: Record<string, string> = {
        from: msg.from,
        subject: msg.subject,
        date: new Date().toISOString()
      }
      return headers[name.toLowerCase()]
    }
  );
  (gmailApi.extractBody as ReturnType<typeof vi.fn>).mockReturnValue(msg.body);
  (gmailApi.extractSenderDomain as ReturnType<typeof vi.fn>).mockReturnValue(msg.senderDomain)
}

describe('ApplicationTrackerService', () => {
  const db = getDb()
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const emailRepo = new ApplicationEmailRepository()
  const companyRepo = new CompanyRepository()

  beforeEach(() => {
    vi.clearAllMocks()
    db.prepare('DELETE FROM application_status_history').run()
    db.prepare('DELETE FROM application_emails').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()
    db.prepare('DELETE FROM companies').run()
  })

  it('returns empty results when no gmail accounts configured', async () => {
    const service = new ApplicationTrackerService()

    const results = await service.scanAll()

    expect(results).toHaveLength(0)
  })

  it('returns error result when tokens are missing', async () => {
    (GmailAuthService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      listAccounts: vi.fn().mockReturnValue([{ gmailEmail: 'test@gmail.com' }]),
      getTokensForGmailEmail: vi.fn().mockReturnValue(null),
      saveHistoryId: vi.fn()
    }))

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].errors).toContain('missing tokens')
  })

  it('processes application-related emails and creates records', async () => {
    listingRepo.create(buildJobListingRecord({ id: 'l-scan', companyName: 'ScanCorp' }))
    const match = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'q-scan',
      jobListingId: 'l-scan',
      status: 'applied'
    }))
    matchRepo.updateStatus(match.id!, 'applied')

    mockActiveAccount()
    mockGmailMessage({
      id: 'gmail-msg-scan-1',
      threadId: 'thread-1',
      from: 'hr@scancorp.com',
      subject: 'Application Received at ScanCorp',
      body: 'Thank you for applying to ScanCorp. We have received your application.',
      senderDomain: 'scancorp.com'
    })

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].emailsProcessed).toBeGreaterThanOrEqual(1)

    const emails = emailRepo.listAll()
    expect(emails.length).toBeGreaterThanOrEqual(1)
    expect(emails[0].classification).toBe('acknowledged')
  })

  it('inherits match from earlier email in the same thread', async () => {
    listingRepo.create(buildJobListingRecord({ id: 'l-thread', companyName: 'ThreadCorp' }))
    const match = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'q-thread',
      jobListingId: 'l-thread',
      status: 'applied'
    }))
    matchRepo.updateStatus(match.id!, 'applied')

    // Pre-create a linked email in the same thread (simulates a previous scan)
    emailRepo.create({
      gmailMessageId: 'thread-msg-1',
      gmailThreadId: 'shared-thread-99',
      gmailEmail: 'user@gmail.com',
      sender: 'hr@threadcorp.com',
      subject: 'Application Received at ThreadCorp',
      receivedAt: new Date().toISOString(),
      classification: 'acknowledged',
      classificationConfidence: 80,
      autoLinked: true,
      jobMatchId: match.id!,
      matchConfidence: 90
    })

    mockActiveAccount()
    mockGmailMessage({
      id: 'thread-msg-2',
      threadId: 'shared-thread-99',
      from: 'hr@threadcorp.com',
      subject: 'Re: Next Steps',
      body: 'Looking forward to chatting.',
      senderDomain: 'threadcorp.com'
    })

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].emailsProcessed).toBe(1)
    expect(results[0].emailsLinked).toBe(1)

    const newEmail = emailRepo.getByGmailMessageId('user@gmail.com', 'thread-msg-2')
    expect(newEmail).not.toBeNull()
    expect(newEmail!.jobMatchId).toBe(match.id!)
    expect(newEmail!.matchSignals?.threadInheritance).toBe(true)
    expect(newEmail!.matchConfidence).toBe(85)
  })

  it('skips already-processed messages', async () => {
    emailRepo.create({
      gmailMessageId: 'already-processed',
      gmailEmail: 'user@gmail.com',
      sender: 'hr@co.com',
      receivedAt: new Date().toISOString(),
      classification: 'acknowledged',
      classificationConfidence: 80,
      autoLinked: false
    })

    mockActiveAccount()

    ;(gmailApi.fetchMessageList as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 'already-processed', threadId: 'thread-1' }]
    })
    // fetchFullMessages should NOT be called since isProcessed filters the stub
    ;(gmailApi.fetchFullMessages as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].emailsProcessed).toBe(0)

    const emails = emailRepo.listAll()
    expect(emails).toHaveLength(1)
  })

  it('does not auto-update to interviewing without a role-specific signal', async () => {
    // Create a company with website so domain matching reaches HIGH_CONFIDENCE
    const company = companyRepo.create({ name: 'MultiCorp', website: 'https://multicorp.com' })
    const now = new Date()

    // Two positions at the same company — email won't mention either title
    listingRepo.create(buildJobListingRecord({
      id: 'l-guard-1', companyName: 'MultiCorp', companyId: company.id
    }))
    listingRepo.create(buildJobListingRecord({
      id: 'l-guard-2', companyName: 'MultiCorp', companyId: company.id, title: 'Backend Engineer'
    }))
    const match1 = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'q-guard-1', jobListingId: 'l-guard-1',
      status: 'applied', updatedAt: now
    }))
    matchRepo.updateStatus(match1.id!, 'applied')
    const match2 = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'q-guard-2', jobListingId: 'l-guard-2',
      status: 'applied', updatedAt: now
    }))
    matchRepo.updateStatus(match2.id!, 'applied')

    mockActiveAccount()
    // Email from company domain, classified as interviewing, but NO title in subject or body
    // Domain match (+40) + company name in body (+25) + temporal proximity (+15) = 80 > HIGH_CONFIDENCE
    mockGmailMessage({
      id: 'guard-msg-1',
      threadId: 'guard-thread-1',
      from: 'recruiter@multicorp.com',
      subject: 'Phone Screen Availability',
      body: 'Hi Josh, the MultiCorp team would like to schedule a phone screen with you.',
      senderDomain: 'multicorp.com'
    })

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].emailsProcessed).toBe(1)
    // Email is auto-linked (high confidence) but status should NOT change
    expect(results[0].emailsLinked).toBe(1)
    expect(results[0].statusChanges).toBe(0)
    // Both matches remain 'applied'
    expect(matchRepo.getById(match1.id!)!.status).toBe('applied')
    expect(matchRepo.getById(match2.id!)!.status).toBe('applied')
  })
})
