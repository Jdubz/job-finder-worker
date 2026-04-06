import { describe, expect, it } from 'vitest'
import { classifyEmail } from '../email-classifier'

describe('email-classifier', () => {
  describe('denial detection', () => {
    it('detects "moved forward with other candidates"', () => {
      const result = classifyEmail(
        'Update on your application',
        'Thank you for your interest. We have decided to move forward with other candidates for this position.',
        'hr@company.com'
      )
      expect(result.classification).toBe('denied')
      expect(result.confidence).toBeGreaterThanOrEqual(60)
    })

    it('detects "unfortunately" followed by company reference', () => {
      const result = classifyEmail(
        'Application Status Update',
        'Unfortunately, we will not be moving forward with your application at this time.',
        'recruiting@acme.com'
      )
      expect(result.classification).toBe('denied')
      expect(result.confidence).toBeGreaterThanOrEqual(60)
    })

    it('detects "position has been filled"', () => {
      const result = classifyEmail(
        'Role Update',
        'We wanted to let you know that the position has been filled. We appreciate your time.',
        'jobs@startup.io'
      )
      expect(result.classification).toBe('denied')
      expect(result.confidence).toBeGreaterThanOrEqual(60)
    })

    it('detects "we regret to inform"', () => {
      const result = classifyEmail(
        'Your Application to Acme Corp',
        'We regret to inform you that we are unable to offer you a position at this time.',
        'no-reply@acme.com'
      )
      expect(result.classification).toBe('denied')
      expect(result.confidence).toBeGreaterThanOrEqual(60)
    })

    it('detects "not selected"', () => {
      const result = classifyEmail(
        'Application Decision',
        'After reviewing all applications, you were not selected for the Senior Engineer role.',
        'talent@bigco.com'
      )
      expect(result.classification).toBe('denied')
      expect(result.confidence).toBeGreaterThanOrEqual(60)
    })

    it('detects "after careful consideration" only with negative outcome', () => {
      const result = classifyEmail(
        'Application Update',
        'After careful consideration, we have decided not to proceed with your candidacy.',
        'hr@company.com'
      )
      expect(result.classification).toBe('denied')
    })

    it('does NOT classify "after careful consideration" with positive outcome as denial', () => {
      const result = classifyEmail(
        'Great news!',
        'After careful consideration, we would like to invite you to an interview.',
        'hr@company.com'
      )
      expect(result.classification).not.toBe('denied')
    })

    it('prioritizes denial over interview keywords in same email', () => {
      const result = classifyEmail(
        'Application Update',
        'Unfortunately, we will not be moving forward. We had planned to schedule an interview but the position was filled.',
        'hr@company.com'
      )
      expect(result.classification).toBe('denied')
    })

    it('increases confidence with multiple denial signals', () => {
      const single = classifyEmail(
        'Update',
        'Unfortunately, the team has decided to pursue other candidates.',
        'hr@company.com'
      )
      const multi = classifyEmail(
        'Update',
        'Unfortunately, we regret to inform you that we will not be moving forward. The position has been filled.',
        'hr@company.com'
      )
      expect(multi.confidence).toBeGreaterThan(single.confidence)
    })
  })

  describe('interview detection', () => {
    it('detects "schedule an interview"', () => {
      const result = classifyEmail(
        'Next Steps',
        'We would like to schedule an interview with you for the Senior Engineer position.',
        'recruiter@company.com'
      )
      expect(result.classification).toBe('interviewing')
      expect(result.confidence).toBeGreaterThanOrEqual(60)
    })

    it('detects "phone screen"', () => {
      const result = classifyEmail(
        'Phone Screen Invitation',
        'I would like to set up a phone screen to discuss your background and the role.',
        'jane@company.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects "technical assessment"', () => {
      const result = classifyEmail(
        'Technical Assessment',
        'As the next step, we would like to send you a technical assessment.',
        'hiring@startup.io'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects calendly links', () => {
      const result = classifyEmail(
        'Let\'s chat!',
        'Please book a time at calendly.com/recruiter/30min to discuss the role.',
        'recruiter@bigco.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects "take-home assignment"', () => {
      const result = classifyEmail(
        'Coding Challenge',
        'We would like you to complete a take-home assignment as the next step.',
        'eng@company.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects "next steps in the process"', () => {
      const result = classifyEmail(
        'Application Progress',
        'We are excited to share the next steps in our hiring process with you.',
        'hr@company.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects "interview confirmation"', () => {
      const result = classifyEmail(
        'NewRocket Interview Confirmation-Forward Deployed AI Engineer',
        'Thanks for submitting your availability. Below are some confirmation details for the call. This will be a video interview.',
        'josh@newrocket.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects "reminder for interview"', () => {
      const result = classifyEmail(
        'Reminder for interview with NewRocket for the Forward Deployed AI Engineer position',
        'As a reminder, here is more information about your interview.',
        'no-reply@greenhouse.io'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects "your interview is scheduled"', () => {
      const result = classifyEmail(
        'Interview Details',
        'Your interview is on April 1st at 2pm. Please join the video call using the link below.',
        'recruiter@company.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects calendar invite with interview in subject', () => {
      const result = classifyEmail(
        'Invitation: Zoom Interview with Okta | Solutions Engineer @ Thu Mar 12, 2026 3pm',
        'You have been invited to the following event.',
        'recruiter@okta.com'
      )
      expect(result.classification).toBe('interviewing')
    })

    it('detects updated calendar invite with interview in subject', () => {
      const result = classifyEmail(
        'Updated invitation: Zoom Interviews with Stripe - Joshua (Technical Solutions) @ Thu Apr 9',
        'This event has been updated.',
        'scheduler@stripe.com'
      )
      expect(result.classification).toBe('interviewing')
    })
  })

  describe('acknowledgment detection', () => {
    it('detects "we have received your application"', () => {
      const result = classifyEmail(
        'Application Received',
        'We have received your application for the Software Engineer position.',
        'no-reply@greenhouse.io'
      )
      expect(result.classification).toBe('acknowledged')
      expect(result.confidence).toBeGreaterThanOrEqual(55)
    })

    it('detects "thank you for applying"', () => {
      const result = classifyEmail(
        'Thank you for your interest',
        'Thank you for applying to the Backend Engineer role at Acme Corp.',
        'jobs@acme.com'
      )
      expect(result.classification).toBe('acknowledged')
    })

    it('detects "application submitted"', () => {
      const result = classifyEmail(
        'Confirmation',
        'Your application has been submitted successfully. Our team will review it shortly.',
        'careers@bigco.com'
      )
      expect(result.classification).toBe('acknowledged')
    })

    it('detects "under review"', () => {
      const result = classifyEmail(
        'Application Status',
        'Your application is currently under review by our hiring team.',
        'no-reply@lever.co'
      )
      expect(result.classification).toBe('acknowledged')
    })
  })

  describe('unclassified emails', () => {
    it('returns unclassified for generic emails', () => {
      const result = classifyEmail(
        'Company Newsletter',
        'Check out our latest blog post about engineering at scale.',
        'newsletter@company.com'
      )
      expect(result.classification).toBe('unclassified')
      expect(result.confidence).toBe(0)
    })

    it('returns unclassified for ambiguous emails', () => {
      const result = classifyEmail(
        'Update from Acme',
        'We have some exciting news to share with you about our company.',
        'info@acme.com'
      )
      expect(result.classification).toBe('unclassified')
    })

    it('returns unclassified for empty content', () => {
      const result = classifyEmail('', '', '')
      expect(result.classification).toBe('unclassified')
      expect(result.confidence).toBe(0)
    })
  })
})
