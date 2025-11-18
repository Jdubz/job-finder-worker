import { useState } from "react"
import type { ContentItemWithChildren, ProjectItem } from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Folder,
  Calendar,
  Edit2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Target,
  AlertCircle,
} from "lucide-react"
import { format } from "date-fns"

interface ProjectListProps {
  items: ContentItemWithChildren[]
  onEdit: (item: ContentItemWithChildren) => void
  onDelete: (id: string) => void
}

export function ProjectList({ items, onEdit, onDelete }: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const toggleExpanded = (projectId: string) => {
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId)
    } else {
      newExpanded.add(projectId)
    }
    setExpandedProjects(newExpanded)
  }

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

  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <Folder className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">No Projects Yet</h3>
        <p className="text-sm text-muted-foreground">
          Add your first project to showcase your work and achievements.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const project = item as ProjectItem & { children?: ContentItemWithChildren[] }
        const isExpanded = expandedProjects.has(project.id)
        const hasDetails =
          (project.accomplishments && project.accomplishments.length > 0) ||
          (project.challenges && project.challenges.length > 0)

        return (
          <Card key={project.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Folder className="h-5 w-5 text-purple-600" />
                      {project.name}
                    </CardTitle>
                  </div>

                  {project.role && (
                    <p className="text-lg font-medium text-foreground mb-1">{project.role}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {project.startDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDateRange(project.startDate, project.endDate)}
                      </div>
                    )}
                    {project.visibility && (
                      <Badge variant={project.visibility === "published" ? "default" : "secondary"}>
                        {project.visibility}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(project)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(project.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {project.description && (
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {project.description}
                  </p>
                </div>
              )}

              {project.context && (
                <div>
                  <h4 className="font-medium mb-2">Context</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.context}</p>
                </div>
              )}

              {project.technologies && project.technologies.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Technologies</h4>
                  <div className="flex flex-wrap gap-1">
                    {project.technologies.map((tech) => (
                      <Badge key={tech} variant="outline" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {project.links && project.links.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Links</h4>
                  <div className="flex flex-wrap gap-2">
                    {project.links.map((link, index) => (
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

              {hasDetails && (
                <div className="border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(project.id)}
                    className="mb-3 p-0 h-auto font-medium"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1" />
                    )}
                    View Details
                  </Button>

                  {isExpanded && (
                    <div className="space-y-4">
                      {project.accomplishments && project.accomplishments.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-600" />
                            Key Accomplishments
                          </h4>
                          <ul className="space-y-1">
                            {project.accomplishments.map((accomplishment, index) => (
                              <li
                                key={index}
                                className="text-sm text-muted-foreground flex items-start gap-2"
                              >
                                <span className="text-green-600 mt-1.5 text-xs">•</span>
                                <span className="leading-relaxed">{accomplishment}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {project.challenges && project.challenges.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            Challenges Overcome
                          </h4>
                          <ul className="space-y-1">
                            {project.challenges.map((challenge, index) => (
                              <li
                                key={index}
                                className="text-sm text-muted-foreground flex items-start gap-2"
                              >
                                <span className="text-orange-600 mt-1.5 text-xs">•</span>
                                <span className="leading-relaxed">{challenge}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {project.tags && project.tags.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex flex-wrap gap-1">
                    {project.tags.map((tag) => (
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
