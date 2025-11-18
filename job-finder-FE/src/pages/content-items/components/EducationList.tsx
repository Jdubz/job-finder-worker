import type { ContentItemWithChildren, EducationItem } from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  GraduationCap,
  MapPin,
  Calendar,
  Edit2,
  Trash2,
  ExternalLink,
  Award,
  BookOpen,
  AlertCircle,
} from "lucide-react"
import { format } from "date-fns"

interface EducationListProps {
  items: ContentItemWithChildren[]
  onEdit: (item: ContentItemWithChildren) => void
  onDelete: (id: string) => void
}

export function EducationList({ items, onEdit, onDelete }: EducationListProps) {
  const formatDateRange = (startDate?: string, endDate?: string | null) => {
    if (!startDate) return null

    try {
      const start = new Date(startDate + "-01")
      const startFormatted = format(start, "MMM yyyy")

      if (!endDate) {
        return `${startFormatted} - Present`
      }

      const end = new Date(endDate + "-01")
      const endFormatted = format(end, "MMM yyyy")
      return `${startFormatted} - ${endFormatted}`
    } catch {
      return startDate + (endDate ? ` - ${endDate}` : " - Present")
    }
  }

  const formatExpirationDate = (expiresAt?: string) => {
    if (!expiresAt) return null

    try {
      const date = new Date(expiresAt)
      return format(date, "MMM dd, yyyy")
    } catch {
      return expiresAt
    }
  }

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false
    try {
      const date = new Date(expiresAt)
      return date < new Date()
    } catch {
      return false
    }
  }

  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">No Education Yet</h3>
        <p className="text-sm text-muted-foreground">
          Add your educational background to highlight your qualifications.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const education = item as EducationItem & { children?: ContentItemWithChildren[] }
        const hasCredential = education.credentialId || education.credentialUrl
        const expired = isExpired(education.expiresAt)

        return (
          <Card key={education.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-indigo-600" />
                      {education.institution}
                    </CardTitle>
                  </div>

                  {education.degree && (
                    <p className="text-lg font-medium text-foreground mb-1">
                      {education.degree}
                      {education.field && ` in ${education.field}`}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {education.startDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDateRange(education.startDate, education.endDate)}
                      </div>
                    )}
                    {education.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {education.location}
                      </div>
                    )}
                    {education.visibility && (
                      <Badge
                        variant={education.visibility === "published" ? "default" : "secondary"}
                      >
                        {education.visibility}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(education)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(education.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {education.honors && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-600" />
                    Honors
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {education.honors}
                  </p>
                </div>
              )}

              {education.description && (
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {education.description}
                  </p>
                </div>
              )}

              {education.relevantCourses && education.relevantCourses.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-600" />
                    Relevant Courses
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {education.relevantCourses.map((course) => (
                      <Badge key={course} variant="outline" className="text-xs">
                        {course}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {hasCredential && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Award className="h-4 w-4 text-green-600" />
                    Credential Information
                  </h4>
                  <div className="space-y-2">
                    {education.credentialId && (
                      <p className="text-sm">
                        <span className="font-medium">ID:</span>{" "}
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {education.credentialId}
                        </code>
                      </p>
                    )}
                    {education.expiresAt && (
                      <p className="text-sm flex items-center gap-2">
                        <span className="font-medium">Expires:</span>
                        <span className={expired ? "text-destructive" : "text-muted-foreground"}>
                          {formatExpirationDate(education.expiresAt)}
                        </span>
                        {expired && (
                          <Badge variant="destructive" className="text-xs flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Expired
                          </Badge>
                        )}
                      </p>
                    )}
                    {education.credentialUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={education.credentialUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Credential
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {education.tags && education.tags.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex flex-wrap gap-1">
                    {education.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
