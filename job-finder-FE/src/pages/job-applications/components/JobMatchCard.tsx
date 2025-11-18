import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Sparkles, TrendingUp, AlertCircle } from "lucide-react"
import type { JobMatch } from "@shared/types"

interface JobMatchCardProps {
  match: JobMatch
  onViewDetails: (match: JobMatch) => void
}

export function JobMatchCard({ match, onViewDetails }: JobMatchCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-500"
      case "Medium":
        return "bg-yellow-500"
      case "Low":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600"
    if (score >= 70) return "text-yellow-600"
    return "text-orange-600"
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{match.jobTitle}</CardTitle>
            <CardDescription className="text-base font-medium mt-1">
              {match.companyName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getPriorityColor(match.applicationPriority)}>
              {match.applicationPriority}
            </Badge>
            <div className={`text-2xl font-bold ${getScoreColor(match.matchScore)}`}>
              {match.matchScore}%
            </div>
          </div>
        </div>

        {match.location && (
          <div className="text-sm text-muted-foreground mt-2">
            📍 {match.location}
            {match.salaryRange && ` • 💰 ${match.salaryRange}`}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Match Reasons */}
        {match.matchReasons && match.matchReasons.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              <span className="font-semibold text-sm">Why This Matches</span>
            </div>
            <ul className="text-sm space-y-1">
              {match.matchReasons.slice(0, 3).map((reason, idx) => (
                <li key={idx} className="text-muted-foreground">
                  • {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Strengths */}
        {match.keyStrengths && match.keyStrengths.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="font-semibold text-sm">Key Strengths</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {match.keyStrengths.slice(0, 4).map((strength, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {strength}
                </Badge>
              ))}
              {match.keyStrengths.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{match.keyStrengths.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Skills Match */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Matched Skills:</span>
            <span className="ml-2 font-semibold text-green-600">
              {match.matchedSkills?.length || 0}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Missing Skills:</span>
            <span className="ml-2 font-semibold text-orange-600">
              {match.missingSkills?.length || 0}
            </span>
          </div>
        </div>

        {/* Potential Concerns */}
        {match.potentialConcerns && match.potentialConcerns.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-md">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <span className="font-semibold text-sm text-orange-700 dark:text-orange-400">
                Consider
              </span>
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-300">
              {match.potentialConcerns[0]}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={() => onViewDetails(match)} className="flex-1">
            View Full Details
          </Button>
          <Button variant="outline" size="icon" onClick={() => window.open(match.url, "_blank")}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
