/**
 * Mock data for generator API testing
 * Used in unit tests and development
 */

import type { GenerateDocumentRequest, DocumentHistoryItem } from "@/api/generator-client"

export const mockCoverLetterRequest: GenerateDocumentRequest = {
  generateType: "coverLetter",
  job: {
    role: "Senior Frontend Engineer",
    company: "Acme Corporation",
    jobDescriptionText:
      "We are seeking a talented frontend developer with expertise in React and TypeScript to join our growing team. The ideal candidate will have 5+ years of experience building modern web applications.",
  },
  preferences: {
    emphasize: ["React and TypeScript expertise", "experience leading frontend teams"],
  },
}

export const mockResumeRequest: GenerateDocumentRequest = {
  generateType: "resume",
  job: {
    role: "Full Stack Developer",
    company: "Tech Startup Inc",
    jobDescriptionText: "Looking for a full stack developer proficient in React, Node.js, and AWS.",
  },
}

export const mockDocumentHistory: DocumentHistoryItem[] = [
  {
    id: "doc_001",
    type: "cover_letter",
    jobTitle: "Senior Frontend Engineer",
    companyName: "Acme Corporation",
    documentUrl: "https://storage.googleapis.com/job-finder-dev/documents/cover-letter-001.pdf",
    createdAt: new Date("2025-10-19T10:30:00Z"),
    jobMatchId: "match_abc123",
  },
  {
    id: "doc_002",
    type: "resume",
    jobTitle: "Full Stack Developer",
    companyName: "Tech Startup Inc",
    documentUrl: "https://storage.googleapis.com/job-finder-dev/documents/resume-002.pdf",
    createdAt: new Date("2025-10-18T15:45:00Z"),
  },
  {
    id: "doc_003",
    type: "cover_letter",
    jobTitle: "React Developer",
    companyName: "Digital Agency",
    documentUrl: "https://storage.googleapis.com/job-finder-dev/documents/cover-letter-003.pdf",
    createdAt: new Date("2025-10-17T09:15:00Z"),
    jobMatchId: "match_xyz789",
  },
]

/**
 * Mock generator API handlers for MSW
 * Can be used in setupTests.ts or individual test files
 */
export const generatorMockHandlers = {
  /**
   * Document history
   */
  history: mockDocumentHistory,
}
