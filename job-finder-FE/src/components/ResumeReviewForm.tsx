import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Edit2, X } from "lucide-react"
import type { ResumeContent, CoverLetterContent, ReviewDocumentType } from "@/api/generator-client"

interface ResumeReviewFormProps {
  documentType: ReviewDocumentType
  content: ResumeContent | CoverLetterContent
  onSubmit: (content: ResumeContent | CoverLetterContent) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function ResumeReviewForm({
  documentType,
  content,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ResumeReviewFormProps) {
  const [editedContent, setEditedContent] = useState(content)
  const [isEditing, setIsEditing] = useState(false)

  if (documentType === "resume") {
    const resume = editedContent as ResumeContent
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              Review Generated Resume
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={() => onSubmit(editedContent)} disabled={isSubmitting}>
                <CheckCircle className="h-4 w-4 mr-1" />
                {isSubmitting ? "Submitting..." : "Approve & Continue"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Professional Summary */}
              <div>
                <Label className="text-sm font-semibold">Professional Summary</Label>
                {isEditing ? (
                  <Textarea
                    value={resume.professionalSummary || resume.personalInfo?.summary || ""}
                    onChange={(e) =>
                      setEditedContent({
                        ...resume,
                        professionalSummary: e.target.value,
                      })
                    }
                    className="mt-1"
                    rows={4}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {resume.professionalSummary || resume.personalInfo?.summary || "No summary provided"}
                  </p>
                )}
              </div>

              <Separator />

              {/* Experience */}
              <div>
                <Label className="text-sm font-semibold">Experience ({resume.experience?.length || 0})</Label>
                <div className="space-y-4 mt-2">
                  {resume.experience?.map((exp, idx) => (
                    <div key={idx} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{exp.role}</p>
                          <p className="text-sm text-muted-foreground">
                            {exp.company}
                            {exp.location && ` • ${exp.location}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {exp.startDate} - {exp.endDate || "Present"}
                          </p>
                        </div>
                      </div>
                      {exp.highlights && exp.highlights.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {exp.highlights.map((highlight, hIdx) => (
                            <li key={hIdx} className="text-sm flex items-start gap-2">
                              <span className="text-muted-foreground">•</span>
                              {isEditing ? (
                                <Input
                                  value={highlight}
                                  onChange={(e) => {
                                    const newExp = [...(resume.experience || [])]
                                    const newHighlights = [...(newExp[idx].highlights || [])]
                                    newHighlights[hIdx] = e.target.value
                                    newExp[idx] = { ...newExp[idx], highlights: newHighlights }
                                    setEditedContent({ ...resume, experience: newExp })
                                  }}
                                  className="flex-1 h-7 text-sm"
                                />
                              ) : (
                                <span>{highlight}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {exp.technologies && exp.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {exp.technologies.map((tech, tIdx) => (
                            <Badge key={tIdx} variant="secondary" className="text-xs">
                              {tech}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Skills */}
              <div>
                <Label className="text-sm font-semibold">Skills</Label>
                <div className="space-y-3 mt-2">
                  {resume.skills?.map((category, idx) => (
                    <div key={idx}>
                      <p className="text-sm font-medium">{category.category}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {category.items.map((skill, sIdx) => (
                          <Badge key={sIdx} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Education */}
              <div>
                <Label className="text-sm font-semibold">Education</Label>
                <div className="space-y-2 mt-2">
                  {resume.education?.map((edu, idx) => (
                    <div key={idx} className="border rounded-lg p-3">
                      <p className="font-medium">{edu.institution}</p>
                      <p className="text-sm text-muted-foreground">
                        {edu.degree}
                        {edu.field && ` in ${edu.field}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {edu.startDate} - {edu.endDate || "Present"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSubmitting}
            >
              {isEditing ? "Done Editing" : "Edit Details"}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={() => onSubmit(editedContent)} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Approve & Continue"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Cover letter review
  const coverLetter = editedContent as CoverLetterContent
  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Edit2 className="h-4 w-4" />
            Review Generated Cover Letter
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={() => onSubmit(editedContent)} disabled={isSubmitting}>
              <CheckCircle className="h-4 w-4 mr-1" />
              {isSubmitting ? "Submitting..." : "Approve & Continue"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Opening Paragraph</Label>
              {isEditing ? (
                <Textarea
                  value={coverLetter.openingParagraph}
                  onChange={(e) =>
                    setEditedContent({ ...coverLetter, openingParagraph: e.target.value })
                  }
                  className="mt-1"
                  rows={3}
                />
              ) : (
                <p className="text-sm mt-1 whitespace-pre-wrap">{coverLetter.openingParagraph}</p>
              )}
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-semibold">Body Paragraphs</Label>
              <div className="space-y-3 mt-2">
                {coverLetter.bodyParagraphs?.map((para, idx) => (
                  <div key={idx}>
                    {isEditing ? (
                      <Textarea
                        value={para}
                        onChange={(e) => {
                          const newParas = [...(coverLetter.bodyParagraphs || [])]
                          newParas[idx] = e.target.value
                          setEditedContent({ ...coverLetter, bodyParagraphs: newParas })
                        }}
                        rows={3}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{para}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-semibold">Closing Paragraph</Label>
              {isEditing ? (
                <Textarea
                  value={coverLetter.closingParagraph}
                  onChange={(e) =>
                    setEditedContent({ ...coverLetter, closingParagraph: e.target.value })
                  }
                  className="mt-1"
                  rows={3}
                />
              ) : (
                <p className="text-sm mt-1 whitespace-pre-wrap">{coverLetter.closingParagraph}</p>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            disabled={isSubmitting}
          >
            {isEditing ? "Done Editing" : "Edit Details"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => onSubmit(editedContent)} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Approve & Continue"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
