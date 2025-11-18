import { useState } from "react"
import type { ContentItemWithChildren, CompanyItem } from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  MapPin,
  Calendar,
  Edit2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FolderOpen,
} from "lucide-react"
import { format } from "date-fns"

interface CompanyListProps {
  items: ContentItemWithChildren[]
  onEdit: (item: ContentItemWithChildren) => void
  onDelete: (id: string) => void
}

export function CompanyList({ items, onEdit, onDelete }: CompanyListProps) {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())

  const toggleExpanded = (companyId: string) => {
    const newExpanded = new Set(expandedCompanies)
    if (newExpanded.has(companyId)) {
      newExpanded.delete(companyId)
    } else {
      newExpanded.add(companyId)
    }
    setExpandedCompanies(newExpanded)
  }

  const formatDateRange = (startDate: string, endDate?: string | null) => {
    try {
      const start = new Date(startDate + "-01") // Add day to YYYY-MM format
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
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">No Companies Yet</h3>
        <p className="text-sm text-muted-foreground">
          Add your first work experience to get started with your professional history.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const company = item as CompanyItem & { children?: ContentItemWithChildren[] }
        const isExpanded = expandedCompanies.has(company.id)
        const projectCount =
          company.children?.filter((child) => child.type === "project").length || 0

        return (
          <Card key={company.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      {company.company}
                    </CardTitle>
                    {company.website && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 h-auto"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>

                  {company.role && (
                    <p className="text-lg font-medium text-foreground mb-1">{company.role}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDateRange(company.startDate, company.endDate)}
                    </div>
                    {company.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {company.location}
                      </div>
                    )}
                    {company.visibility && (
                      <Badge variant={company.visibility === "published" ? "default" : "secondary"}>
                        {company.visibility}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(company)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(company.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {company.summary && (
                <div>
                  <h4 className="font-medium mb-2">Summary</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{company.summary}</p>
                </div>
              )}

              {company.accomplishments && company.accomplishments.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Key Accomplishments</h4>
                  <ul className="space-y-1">
                    {company.accomplishments.map((accomplishment, index) => (
                      <li
                        key={index}
                        className="text-sm text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-blue-600 mt-1.5 text-xs">•</span>
                        <span className="leading-relaxed">{accomplishment}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {company.technologies && company.technologies.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Technologies</h4>
                  <div className="flex flex-wrap gap-1">
                    {company.technologies.map((tech) => (
                      <Badge key={tech} variant="outline" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {projectCount > 0 && (
                <div className="border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(company.id)}
                    className="mb-3 p-0 h-auto font-medium"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1" />
                    )}
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {projectCount} Project{projectCount !== 1 ? "s" : ""}
                  </Button>

                  {isExpanded && company.children && (
                    <div className="space-y-3 ml-6">
                      {company.children
                        .filter((child) => child.type === "project")
                        .map((project) => (
                          <Card key={project.id} className="bg-muted/30">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <h5 className="font-medium">{project.name}</h5>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEdit(project)} // Projects use same edit flow
                                    className="h-7 w-7 p-0"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDelete(project.id)}
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>

                              {project.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  {project.description}
                                </p>
                              )}

                              {project.technologies && project.technologies.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {project.technologies.map((tech) => (
                                    <Badge key={tech} variant="outline" className="text-xs">
                                      {tech}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {company.notes && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground italic">{company.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
