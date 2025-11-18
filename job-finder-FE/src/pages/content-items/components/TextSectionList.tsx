import type { ContentItemWithChildren, TextSectionItem } from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Edit2, Trash2, AlignLeft } from "lucide-react"

interface TextSectionListProps {
  items: ContentItemWithChildren[]
  onEdit: (item: ContentItemWithChildren) => void
  onDelete: (id: string) => void
}

export function TextSectionList({ items, onEdit, onDelete }: TextSectionListProps) {
  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">No Text Sections Yet</h3>
        <p className="text-sm text-muted-foreground">
          Add text sections to provide additional context and narrative to your experience.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const section = item as TextSectionItem

        return (
          <Card key={section.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlignLeft className="h-5 w-5 text-indigo-600" />
                      {section.heading || "Untitled Section"}
                    </CardTitle>
                    {section.format && (
                      <Badge variant="outline" className="text-xs">
                        {section.format}
                      </Badge>
                    )}
                  </div>
                  {section.visibility && (
                    <Badge variant={section.visibility === "published" ? "default" : "secondary"}>
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
                  <div
                    className="text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {section.format === "markdown" ? (
                      // For now, display as plain text. Can add markdown parser later
                      <div>{section.content}</div>
                    ) : section.format === "html" ? (
                      <div dangerouslySetInnerHTML={{ __html: section.content }} />
                    ) : (
                      <div>{section.content}</div>
                    )}
                  </div>
                </div>
              )}

              {section.tags && section.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {section.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
