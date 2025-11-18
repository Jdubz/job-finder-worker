import { useState } from "react"
import type { ContentItemWithChildren, ProfileSectionItem } from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  User,
  Edit2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileText,
  Code,
  Link as LinkIcon,
} from "lucide-react"

interface ProfileSectionListProps {
  items: ContentItemWithChildren[]
  onEdit: (item: ContentItemWithChildren) => void
  onDelete: (id: string) => void
}

export function ProfileSectionList({ items, onEdit, onDelete }: ProfileSectionListProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleExpanded = (sectionId: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId)
    } else {
      newExpanded.add(sectionId)
    }
    setExpandedSections(newExpanded)
  }

  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">No Profile Sections Yet</h3>
        <p className="text-sm text-muted-foreground">
          Add profile sections to build your professional narrative.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const section = item as ProfileSectionItem & { children?: ContentItemWithChildren[] }
        const isExpanded = expandedSections.has(section.id)
        const hasStructuredData =
          section.structuredData && Object.keys(section.structuredData).length > 0

        return (
          <Card key={section.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <User className="h-5 w-5 text-teal-600" />
                      {section.heading}
                    </CardTitle>
                  </div>

                  {section.visibility && (
                    <Badge
                      variant={section.visibility === "published" ? "default" : "secondary"}
                      className="mb-2"
                    >
                      {section.visibility}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(section)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(section.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {section.content && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-600" />
                    Content
                  </h4>
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                </div>
              )}

              {hasStructuredData && (
                <div className="border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(section.id)}
                    className="mb-3 p-0 h-auto font-medium"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1" />
                    )}
                    View Structured Data
                  </Button>

                  {isExpanded && section.structuredData && (
                    <div className="space-y-4 ml-6">
                      {section.structuredData.name && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-1">Name</h5>
                          <p className="text-sm">{section.structuredData.name}</p>
                        </div>
                      )}

                      {section.structuredData.tagline && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-1">
                            Tagline
                          </h5>
                          <p className="text-sm italic">{section.structuredData.tagline}</p>
                        </div>
                      )}

                      {section.structuredData.role && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-1">Role</h5>
                          <p className="text-sm">{section.structuredData.role}</p>
                        </div>
                      )}

                      {section.structuredData.summary && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-1">
                            Summary
                          </h5>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {section.structuredData.summary}
                          </p>
                        </div>
                      )}

                      {section.structuredData.primaryStack &&
                        section.structuredData.primaryStack.length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                              <Code className="h-4 w-4" />
                              Primary Stack
                            </h5>
                            <div className="flex flex-wrap gap-1">
                              {section.structuredData.primaryStack.map((tech) => (
                                <Badge key={tech} variant="outline" className="text-xs">
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                      {section.structuredData.links && section.structuredData.links.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            Links
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {section.structuredData.links.map((link, index) => (
                              <Button key={index} variant="outline" size="sm" asChild>
                                <a href={link.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  {link.label}
                                </a>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {section.tags && section.tags.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex flex-wrap gap-1">
                    {section.tags.map((tag) => (
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
