import type { EmailClassification } from "@shared/types"

export interface ClassificationResult {
  classification: EmailClassification
  confidence: number
}

// Pattern sets grouped by category; all matching patterns in a category contribute to its match count.
const DENIAL_PATTERNS = [
  /(we|they)('ve| have)?\s+(decided|chosen)\s+to\s+(move forward|proceed)\s+with\s+(other|another)/i,
  /unfortunately[\s\S]{0,40}(decided|chosen|unable)/i,
  /not\s+(moving|going)\s+forward/i,
  /position\s+has\s+been\s+filled/i,
  /will\s+not\s+be\s+(moving|proceeding)/i,
  /after\s+careful\s+(review|consideration).{0,30}(not|unfortunately|unable|regret|other\s+candidates)/i,
  /we\s+regret\s+to\s+inform/i,
  /not\s+(the\s+right\s+fit|a\s+match)\s+at\s+this\s+time/i,
  /decided\s+not\s+to\s+move\s+forward/i,
  /pursue\s+other\s+candidates/i,
  /no\s+longer\s+(considering|moving)/i,
  /not\s+selected/i,
  /(?:recently|already)\s+filled\s+(this|the)\s+position/i,
  /position\s+(is|has\s+been)\s+(no\s+longer\s+available|closed|filled)/i,
  /decided\s+to\s+(go|move)\s+(in\s+)?(a\s+)?different\s+direction/i,
  /(unable|not\s+able)\s+to\s+(extend|make)\s+(an?\s+)?offer/i
]

const INTERVIEW_PATTERNS = [
  /schedule\s+(an?\s+)?interview/i,
  /invite\s+you\s+to\s+(an?\s+)?interview/i,
  /next\s+steps?\s+(for|with|regarding)\s+your\b/i,
  /like\s+to\s+(meet|speak|chat|connect)\s+with\s+you/i,
  /phone\s+(screen|call|interview)/i,
  /technical\s+(assessment|interview|screen)/i,
  /take[\s-]home\s+(assignment|assessment|challenge)/i,
  /calendar\s+(invite|link)/i,
  /calendly\.com|cal\.com/i,
  /book\s+(a\s+)?(time|slot|meeting)/i,
  /coding\s+(challenge|test|exercise)/i,
  /panel\s+interview/i,
  /on-?site\s+interview/i,
  /final\s+round/i,
  /interview\s+(confirmation|confirmed|scheduled)/i,
  /reminder\s+(for|about|of)\s+(an?\s+|your\s+)?interview\b/i,
  /your\s+interview\s+(is|with|on|at)\b/i,
  /confirmation\s+details?\s+for\s+(the\s+|your\s+)?(call|interview)\b/i,
  /Invitation:\s*.*interview/i,
  /Updated invitation:\s*.*interview/i
]

const ACKNOWLEDGMENT_PATTERNS = [
  /we('ve| have)?\s+received\s+your\s+application/i,
  /thank\s+you\s+for\s+(applying|your\s+(interest|application))/i,
  /application\s+(has\s+been\s+|was\s+)?(received|submitted|confirmed)/i,
  /successfully\s+applied/i,
  /confirm(ing|ation\s+of)\s+your\s+application/i,
  /under\s+review/i,
  /will\s+review\s+your\s+(application|resume|qualifications)/i,
  /application\s+status/i,
  /currently\s+reviewing/i
]

function testPatterns(text: string, patterns: RegExp[]): { matched: boolean; matchCount: number } {
  let matchCount = 0
  for (const p of patterns) {
    if (p.test(text)) matchCount++
  }
  return { matched: matchCount > 0, matchCount }
}

/**
 * Classify an email as application-related (acknowledged, interviewing, denied)
 * or unclassified.
 *
 * Priority: denial > interview > acknowledgment, with one exception:
 * when interview patterns match but acknowledgment patterns are stronger
 * (more matches), the email is classified as acknowledged. This prevents
 * boilerplate ack emails with weak interview-adjacent language (e.g.
 * "next steps") from being misclassified as interview invitations.
 */
export function classifyEmail(subject: string, body: string, _sender: string): ClassificationResult {
  const text = `${subject}\n${body}`

  // Check denial first (highest priority — a rejection mentioning "interview" is still a denial)
  const denial = testPatterns(text, DENIAL_PATTERNS)
  if (denial.matched) {
    // Higher confidence with more matching patterns
    const confidence = Math.min(95, 60 + denial.matchCount * 15)
    return { classification: "denied", confidence }
  }

  // Interview signals
  const interview = testPatterns(text, INTERVIEW_PATTERNS)
  if (interview.matched) {
    // Guard: if acknowledgment signals are stronger, this is likely an ack
    // email with boilerplate interview-adjacent language (e.g. "next steps")
    const ack = testPatterns(text, ACKNOWLEDGMENT_PATTERNS)
    if (ack.matched && ack.matchCount > interview.matchCount) {
      const confidence = Math.min(90, 55 + ack.matchCount * 15)
      return { classification: "acknowledged", confidence }
    }
    const confidence = Math.min(95, 60 + interview.matchCount * 15)
    return { classification: "interviewing", confidence }
  }

  // Acknowledgment signals
  const ack = testPatterns(text, ACKNOWLEDGMENT_PATTERNS)
  if (ack.matched) {
    const confidence = Math.min(90, 55 + ack.matchCount * 15)
    return { classification: "acknowledged", confidence }
  }

  return { classification: "unclassified", confidence: 0 }
}
