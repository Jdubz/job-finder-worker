import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/sqlite'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { JobListingRepository } from '../../job-listings/job-listing.repository'
import { ApplicationEmailRepository } from '../application-email.repository'
import { StatusHistoryRepository } from '../status-history.repository'
import { buildJobMatchInput, buildJobListingRecord } from '../../job-matches/__tests__/fixtures'

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

describe('ApplicationTrackerService', () => {
  const db = getDb()
  const matchRepo = new JobMatchRepository()
  const listingRepo = new JobListingRepository()
  const emailRepo = new ApplicationEmailRepository()
  const historyRepo = new StatusHistoryRepository()

  beforeEach(() => {
    vi.clearAllMocks()
    db.prepare('DELETE FROM application_status_history').run()
    db.prepare('DELETE FROM application_emails').run()
    db.prepare('DELETE FROM job_matches').run()
    db.prepare("DELETE FROM job_listings WHERE id != '__ghost_listing__'").run()
  })

  it('returns empty results when no gmail accounts configured', async () => {
    const service = new ApplicationTrackerService()

    const results = await service.scanAll()

    expect(results).toHaveLength(0)
  })

  it('returns error result when tokens are missing', async () => {
    const mockAuth = (GmailAuthService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
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
    // Set up a listing and applied match
    listingRepo.create(buildJobListingRecord({ id: 'l-scan', companyName: 'ScanCorp' }))
    const match = matchRepo.upsert(buildJobMatchInput({
      queueItemId: 'q-scan',
      jobListingId: 'l-scan',
      status: 'applied'
    }))
    matchRepo.updateStatus(match.id!, 'applied')

    // Mock Gmail API to return an application email
    const mockMessage = {
      id: 'gmail-msg-scan-1',
      threadId: 'thread-1',
      snippet: 'Thank you for applying',
      payload: {
        headers: [
          { name: 'From', value: 'hr@scancorp.com' },
          { name: 'Subject', value: 'Application Received at ScanCorp' },
          { name: 'Date', value: new Date().toISOString() }
        ]
      }
    }

    // Configure mocks for this test
    const mockListAccounts = vi.fn().mockReturnValue([
      { gmailEmail: 'user@gmail.com', hasRefreshToken: true }
    ])
    const mockGetTokens = vi.fn().mockReturnValue({
      refresh_token: 'r', access_token: 'a', expiry_date: Date.now() + 3600000
    });

    (GmailAuthService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      listAccounts: mockListAccounts,
      getTokensForGmailEmail: mockGetTokens,
      saveHistoryId: vi.fn()
    }));

    (gmailApi.fetchMessageList as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 'gmail-msg-scan-1', threadId: 'thread-1' }]
    });

    (gmailApi.fetchFullMessages as ReturnType<typeof vi.fn>).mockResolvedValue([mockMessage]);

    (gmailApi.getHeader as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, name: string) => {
        const headers: Record<string, string> = {
          from: 'hr@scancorp.com',
          subject: 'Application Received at ScanCorp',
          date: new Date().toISOString()
        }
        return headers[name.toLowerCase()]
      }
    );

    (gmailApi.extractBody as ReturnType<typeof vi.fn>).mockReturnValue(
      'Thank you for applying to ScanCorp. We have received your application.'
    );

    (gmailApi.extractSenderDomain as ReturnType<typeof vi.fn>).mockReturnValue('scancorp.com')

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].emailsProcessed).toBeGreaterThanOrEqual(1)

    // Check that an application email was created
    const emails = emailRepo.listAll()
    expect(emails.length).toBeGreaterThanOrEqual(1)
    expect(emails[0].classification).toBe('acknowledged')
  })

  it('skips already-processed messages', async () => {
    // Pre-create a processed email
    emailRepo.create({
      gmailMessageId: 'already-processed',
      gmailEmail: 'user@gmail.com',
      sender: 'hr@co.com',
      receivedAt: new Date().toISOString(),
      classification: 'acknowledged',
      classificationConfidence: 80,
      autoLinked: false
    })

    const mockMessage = {
      id: 'already-processed',
      threadId: 'thread-1',
      snippet: 'Test'
    };

    (GmailAuthService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      listAccounts: vi.fn().mockReturnValue([{ gmailEmail: 'user@gmail.com' }]),
      getTokensForGmailEmail: vi.fn().mockReturnValue({ refresh_token: 'r', access_token: 'a', expiry_date: Date.now() + 3600000 }),
      saveHistoryId: vi.fn()
    }));

    (gmailApi.fetchMessageList as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 'already-processed', threadId: 'thread-1' }]
    });
    (gmailApi.fetchFullMessages as ReturnType<typeof vi.fn>).mockResolvedValue([mockMessage])

    const service = new ApplicationTrackerService()
    const results = await service.scanAll()

    expect(results).toHaveLength(1)
    expect(results[0].emailsProcessed).toBe(0)

    // Should still only have the original email, no duplicates
    const emails = emailRepo.listAll()
    expect(emails).toHaveLength(1)
  })
})
