import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { JobAnalysisResult, ScoreAdjustment } from "@shared/types"

interface MatchBreakdownProps {
  analysis?: JobAnalysisResult
}

export function MatchBreakdown({ analysis }: MatchBreakdownProps) {
  const [showRaw, setShowRaw] = useState(false)

  if (!analysis) {
    return <p className="mt-1 text-muted-foreground">—</p>
  }

  const scoringResult = analysis.scoringResult
  const { matchReasons, keyStrengths, matchedSkills, missingSkills, potentialConcerns } = analysis

  return (
    <Card className="bg-muted/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm">Match Breakdown</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {scoringResult && (
              <>
                <Badge variant="outline">Base: {scoringResult.baseScore}</Badge>
                <Badge>{scoringResult.finalScore}</Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score Adjustments */}
        {scoringResult && scoringResult.adjustments.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Adjustments</p>
            <div className="space-y-1.5">
              {scoringResult.adjustments.map((adj: ScoreAdjustment, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm bg-secondary/30 px-2 py-1.5 rounded"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-normal">
                      {adj.category}
                    </Badge>
                    <span className="text-muted-foreground">{adj.reason}</span>
                  </div>
                  <span
                    className={`font-mono font-medium ${
                      adj.points > 0
                        ? "text-green-600"
                        : adj.points < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {adj.points > 0 ? "+" : ""}
                    {adj.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Potential Concerns */}
        {potentialConcerns && potentialConcerns.length > 0 && (
          <div>
            <Separator className="my-2" />
            <p className="text-xs text-muted-foreground mb-1">Concerns</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              {potentialConcerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Match Details Grid */}
        {(matchReasons?.length || keyStrengths?.length || matchedSkills?.length || missingSkills?.length) ? (
          <div className="grid gap-3 md:grid-cols-2">
            {matchReasons && matchReasons.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Why it fits</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {matchReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {keyStrengths && keyStrengths.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {keyStrengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {matchedSkills && matchedSkills.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Matched skills</p>
                <div className="flex flex-wrap gap-1 text-xs">
                  {matchedSkills.map((s, i) => (
                    <Badge key={i} variant="outline" className="rounded-full">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {missingSkills && missingSkills.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Missing skills</p>
                <div className="flex flex-wrap gap-1 text-xs">
                  {missingSkills.map((s, i) => (
                    <Badge key={i} variant="destructive" className="rounded-full bg-rose-50 text-rose-800 border-rose-200">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Raw JSON toggle */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
            aria-controls="raw-json-content"
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
            <pre
              id="raw-json-content"
              className="mt-2 text-xs bg-background border rounded p-2 overflow-auto max-h-72 whitespace-pre-wrap break-all"
            >
              {JSON.stringify(analysis, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
