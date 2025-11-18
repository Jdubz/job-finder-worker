import { useState } from "react"
import type { ContentItemWithChildren, SkillGroupItem } from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  GraduationCap,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
  Star,
  StarHalf,
  Circle,
} from "lucide-react"

interface SkillGroupListProps {
  items: ContentItemWithChildren[]
  onEdit: (item: ContentItemWithChildren) => void
  onDelete: (id: string) => void
}

const ProficiencyIcon = ({ level }: { level?: string }) => {
  switch (level) {
    case "expert":
      return <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
    case "advanced":
      return <Star className="h-3 w-3 fill-blue-500 text-blue-500" />
    case "intermediate":
      return <StarHalf className="h-3 w-3 text-blue-400" />
    case "beginner":
      return <Circle className="h-3 w-3 text-gray-400" />
    default:
      return null
  }
}

const getProficiencyColor = (level?: string) => {
  switch (level) {
    case "expert":
      return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
    case "advanced":
      return "border-blue-500 bg-blue-50 dark:bg-blue-950"
    case "intermediate":
      return "border-blue-300 bg-blue-50/50 dark:bg-blue-950/50"
    case "beginner":
      return "border-gray-300 bg-gray-50 dark:bg-gray-900"
    default:
      return ""
  }
}

export function SkillGroupList({ items, onEdit, onDelete }: SkillGroupListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleExpanded = (groupId: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">No Skill Groups Yet</h3>
        <p className="text-sm text-muted-foreground">
          Add your first skill group to organize your technical expertise.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const skillGroup = item as SkillGroupItem & { children?: ContentItemWithChildren[] }
        const isExpanded = expandedGroups.has(skillGroup.id)
        const hasSubcategories = skillGroup.subcategories && skillGroup.subcategories.length > 0

        return (
          <Card key={skillGroup.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-green-600" />
                      {skillGroup.category}
                    </CardTitle>
                  </div>

                  {skillGroup.visibility && (
                    <Badge
                      variant={skillGroup.visibility === "published" ? "default" : "secondary"}
                      className="mb-2"
                    >
                      {skillGroup.visibility}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(skillGroup)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(skillGroup.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {skillGroup.skills && skillGroup.skills.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {skillGroup.skills.map((skill) => {
                      const proficiency = skillGroup.proficiency?.[skill]
                      return (
                        <Badge
                          key={skill}
                          variant="outline"
                          className={`text-xs flex items-center gap-1 ${getProficiencyColor(proficiency)}`}
                        >
                          <ProficiencyIcon level={proficiency} />
                          {skill}
                          {proficiency && (
                            <span className="ml-1 text-[10px] opacity-70">({proficiency})</span>
                          )}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}

              {skillGroup.proficiency && Object.keys(skillGroup.proficiency).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Proficiency Levels</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      <span className="text-muted-foreground">Expert</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-blue-500 text-blue-500" />
                      <span className="text-muted-foreground">Advanced</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <StarHalf className="h-3 w-3 text-blue-400" />
                      <span className="text-muted-foreground">Intermediate</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Circle className="h-3 w-3 text-gray-400" />
                      <span className="text-muted-foreground">Beginner</span>
                    </div>
                  </div>
                </div>
              )}

              {hasSubcategories && (
                <div className="border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(skillGroup.id)}
                    className="mb-3 p-0 h-auto font-medium"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1" />
                    )}
                    <Layers className="h-4 w-4 mr-2" />
                    {skillGroup.subcategories?.length ?? 0} Subcategor
                    {(skillGroup.subcategories?.length ?? 0) !== 1 ? "ies" : "y"}
                  </Button>

                  {isExpanded && skillGroup.subcategories && (
                    <div className="space-y-3 ml-6">
                      {skillGroup.subcategories.map((subcategory, index) => (
                        <Card key={index} className="bg-muted/30">
                          <CardContent className="p-4">
                            <h5 className="font-medium mb-2">{subcategory.name}</h5>
                            <div className="flex flex-wrap gap-1">
                              {subcategory.skills.map((skill) => {
                                const proficiency = skillGroup.proficiency?.[skill]
                                return (
                                  <Badge
                                    key={skill}
                                    variant="outline"
                                    className={`text-xs flex items-center gap-1 ${getProficiencyColor(proficiency)}`}
                                  >
                                    <ProficiencyIcon level={proficiency} />
                                    {skill}
                                  </Badge>
                                )
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {skillGroup.tags && skillGroup.tags.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex flex-wrap gap-1">
                    {skillGroup.tags.map((tag) => (
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
