import { useMemo } from "react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { JobAnalysisResult, ScoreBreakdown } from "@shared/types"

// Accept both camelCase and snake_case from the worker
function pick<T>(
  obj: Record<string, unknown> | undefined,
  keys: string[],
  fallback?: T
): T | undefined {
  if (!obj) return fallback
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key] as T
  }
  return fallback
}

function normalizeBreakdown(analysis: Record<string, unknown>): ScoreBreakdown | null {
  const raw = pick<Record<string, unknown>>(analysis, ["score_breakdown", "scoreBreakdown"])
  if (raw) {
    const baseScoreRaw = raw.baseScore ?? raw.base_score
    const finalScoreRaw = raw.finalScore ?? raw.final_score
    const adjustmentsRaw = raw.adjustments
    const baseScore = typeof baseScoreRaw === "number" ? baseScoreRaw : Number(baseScoreRaw)
    const finalScore = typeof finalScoreRaw === "number" ? finalScoreRaw : Number(finalScoreRaw)
    const adjustments = Array.isArray(adjustmentsRaw)
      ? (adjustmentsRaw as string[])
      : []
    return {
      baseScore: Number.isFinite(baseScore) ? baseScore : 0,
      finalScore: Number.isFinite(finalScore)
        ? finalScore
        : Number.isFinite(baseScore)
          ? baseScore
          : 0,
      adjustments,
    }
  }

  // Fallback: derive base/final if only match_score present
  const matchScore = pick<number>(analysis, ["match_score", "matchScore"], undefined)
  if (matchScore === undefined) return null
  return {
    baseScore: matchScore,
    finalScore: matchScore,
    adjustments: [],
  }
}

function normalizeAnalysis(analysis?: JobAnalysisResult | Record<string, unknown>) {
  const data = (analysis || {}) as Record<string, unknown>
  const breakdown = normalizeBreakdown(data)
  const baseScore = breakdown?.baseScore ?? pick<number>(data, ["match_score", "matchScore"], 0)
  const finalScore = breakdown?.finalScore ?? baseScore
  const adjustments = breakdown?.adjustments ?? []
  const potentialConcerns = pick<string[]>(data, ["potential_concerns", "potentialConcerns"], []) || []
  const matchReasons = pick<string[]>(data, ["match_reasons", "matchReasons"], []) || []
  const keyStrengths = pick<string[]>(data, ["key_strengths", "keyStrengths"], []) || []
  const matchedSkills = pick<string[]>(data, ["matched_skills", "matchedSkills"], []) || []
  const missingSkills = pick<string[]>(data, ["missing_skills", "missingSkills"], []) || []

  const priority = pick<string>(data, ["application_priority", "applicationPriority"], undefined)

  return {
    baseScore,
    finalScore,
    adjustments,
    potentialConcerns,
    matchReasons,
    keyStrengths,
    matchedSkills,
    missingSkills,
    priority,
    raw: data,
  }
}

export function MatchBreakdown({ analysis }: { analysis?: JobAnalysisResult | Record<string, unknown> }) {
  const normalized = useMemo(() => normalizeAnalysis(analysis), [analysis])
  const [showRaw, setShowRaw] = useState(false)

  if (!analysis) {
    return <p className="mt-1 text-muted-foreground">—</p>
  }

  return (
    <Card className="bg-muted/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm">Match Breakdown</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">Base: {normalized.baseScore}</Badge>
            <Badge>{normalized.finalScore}</Badge>
            {normalized.priority ? (
              <Badge variant="secondary" className="uppercase tracking-wide text-[11px]">
                {normalized.priority} priority
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Adjustments</p>
          {normalized.adjustments.length ? (
            <ul className="text-sm space-y-1 list-disc list-inside">
              {normalized.adjustments.map((adj, idx) => (
                <li key={idx}>{adj}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No adjustments recorded.</p>
          )}
        </div>

        {normalized.potentialConcerns.length ? (
          <div>
            <Separator className="my-2" />
            <p className="text-xs text-muted-foreground mb-1">Concerns</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              {normalized.potentialConcerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {(normalized.matchReasons.length || normalized.keyStrengths.length || normalized.matchedSkills.length || normalized.missingSkills.length) ? (
          <div className="grid gap-3 md:grid-cols-2">
            {normalized.matchReasons.length ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Why it fits</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {normalized.matchReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {normalized.keyStrengths.length ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {normalized.keyStrengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {normalized.matchedSkills.length ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Matched skills</p>
                <div className="flex flex-wrap gap-1 text-xs">
                  {normalized.matchedSkills.map((s, i) => (
                    <Badge key={i} variant="outline" className="rounded-full">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {normalized.missingSkills.length ? (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Missing skills</p>
                <div className="flex flex-wrap gap-1 text-xs">
                  {normalized.missingSkills.map((s, i) => (
                    <Badge key={i} variant="destructive" className="rounded-full bg-rose-50 text-rose-800 border-rose-200">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
          >
            {showRaw ? (
              <>
                Hide raw JSON <ChevronUp className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                View raw JSON <ChevronDown className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
          {showRaw && (
            <pre className="mt-2 text-xs bg-background border rounded p-2 overflow-auto max-h-72 whitespace-pre-wrap break-all">
              {JSON.stringify(normalized.raw, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
