import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { contentItemsClient } from "@/api"
import type {
  ContentItem,
  ContentItemType,
  CreateContentItemData,
  UpdateContentItemData,
  ContentItemVisibility,
} from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, X } from "lucide-react"
// Removed unused imports

interface ContentItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: ContentItemType
  item?: ContentItem | null
  onSave: () => void
}

export function ContentItemDialog({
  open,
  onOpenChange,
  type,
  item,
  onSave,
}: ContentItemDialogProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Common fields
  const [visibility, setVisibility] = useState<ContentItemVisibility>("published")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  // Company fields
  const [company, setCompany] = useState("")
  const [role, setRole] = useState("")
  const [location, setLocation] = useState("")
  const [website, setWebsite] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [summary, setSummary] = useState("")
  const [accomplishments, setAccomplishments] = useState<string[]>([])
  const [accomplishmentInput, setAccomplishmentInput] = useState("")
  const [technologies, setTechnologies] = useState<string[]>([])
  const [techInput, setTechInput] = useState("")
  const [notes, setNotes] = useState("")

  // Project fields
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [projectChallenges, setProjectChallenges] = useState<string[]>([])

  // Skill group fields
  const [category, setCategory] = useState("")
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState("")

  // Text section fields
  const [heading, setHeading] = useState("")
  const [content, setContent] = useState("")
  const [format, setFormat] = useState<"markdown" | "plain" | "html">("markdown")

  // Education fields
  const [institution, setInstitution] = useState("")
  const [degree, setDegree] = useState("")
  const [field, setField] = useState("")
  const [honors, setHonors] = useState("")
  const [educationDescription, setEducationDescription] = useState("")

  // Reset form when dialog opens/closes or item changes
  useEffect(() => {
    if (open) {
      resetForm()
      if (item) {
        populateForm(item)
      }
    }
  }, [open, item])

  const resetForm = () => {
    setVisibility("published")
    setTags([])
    setTagInput("")

    // Company fields
    setCompany("")
    setRole("")
    setLocation("")
    setWebsite("")
    setStartDate("")
    setEndDate("")
    setSummary("")
    setAccomplishments([])
    setAccomplishmentInput("")
    setTechnologies([])
    setTechInput("")
    setNotes("")

    // Project fields
    setProjectName("")
    setProjectDescription("")
    setProjectChallenges([])

    // Skill group fields
    setCategory("")
    setSkills([])
    setSkillInput("")

    // Text section fields
    setHeading("")
    setContent("")
    setFormat("markdown")

    // Education fields
    setInstitution("")
    setDegree("")
    setField("")
    setHonors("")
    setEducationDescription("")

    setAlert(null)
  }

  const populateForm = (item: ContentItem) => {
    setVisibility(item.visibility || "published")
    setTags(item.tags || [])

    switch (item.type) {
      case "company": {
        const companyItem = item as ContentItem & {
          company?: string
          role?: string
          location?: string
          website?: string
          startDate?: string
          endDate?: string | null
          summary?: string
          accomplishments?: string[]
          technologies?: string[]
          notes?: string
        }
        setCompany(companyItem.company || "")
        setRole(companyItem.role || "")
        setLocation(companyItem.location || "")
        setWebsite(companyItem.website || "")
        setStartDate(companyItem.startDate || "")
        setEndDate(companyItem.endDate || "")
        setSummary(companyItem.summary || "")
        setAccomplishments(companyItem.accomplishments || [])
        setTechnologies(companyItem.technologies || [])
        setNotes(companyItem.notes || "")
        break
      }

      case "project": {
        const projectItem = item as ContentItem & {
          name?: string
          role?: string
          startDate?: string
          endDate?: string | null
          description?: string
          accomplishments?: string[]
          technologies?: string[]
          challenges?: string[]
        }
        setProjectName(projectItem.name || "")
        setRole(projectItem.role || "")
        setStartDate(projectItem.startDate || "")
        setEndDate(projectItem.endDate || "")
        setProjectDescription(projectItem.description || "")
        setAccomplishments(projectItem.accomplishments || [])
        setTechnologies(projectItem.technologies || [])
        setProjectChallenges(projectItem.challenges || [])
        break
      }

      case "skill-group": {
        const skillItem = item as ContentItem & { category?: string; skills?: string[] }
        setCategory(skillItem.category || "")
        setSkills(skillItem.skills || [])
        break
      }

      case "text-section": {
        const textItem = item as ContentItem & {
          heading?: string
          content?: string
          format?: "markdown" | "plain" | "html"
        }
        setHeading(textItem.heading || "")
        setContent(textItem.content || "")
        setFormat(textItem.format || "markdown")
        break
      }

      case "education": {
        const eduItem = item as ContentItem & {
          institution?: string
          degree?: string
          field?: string
          location?: string
          startDate?: string
          endDate?: string | null
          honors?: string
          description?: string
        }
        setInstitution(eduItem.institution || "")
        setDegree(eduItem.degree || "")
        setField(eduItem.field || "")
        setLocation(eduItem.location || "")
        setStartDate(eduItem.startDate || "")
        setEndDate(eduItem.endDate || "")
        setHonors(eduItem.honors || "")
        setEducationDescription(eduItem.description || "")
        break
      }
    }
  }

  const addToList = (
    list: string[],
    setList: (list: string[]) => void,
    input: string,
    setInput: (input: string) => void
  ) => {
    if (input.trim() && !list.includes(input.trim())) {
      setList([...list, input.trim()])
      setInput("")
    }
  }

  const removeFromList = (list: string[], setList: (list: string[]) => void, item: string) => {
    setList(list.filter((i) => i !== item))
  }

  const handleSave = async () => {
    try {
      setLoading(true)
      setAlert(null)

      let data: CreateContentItemData | UpdateContentItemData

      const baseData = {
        type,
        parentId: null,
        order: 0,
        visibility,
        tags: tags.length > 0 ? tags : undefined,
      }

      switch (type) {
        case "company":
          data = {
            ...baseData,
            company,
            role: role || undefined,
            location: location || undefined,
            website: website || undefined,
            startDate,
            endDate: endDate || null,
            summary: summary || undefined,
            accomplishments: accomplishments.length > 0 ? accomplishments : undefined,
            technologies: technologies.length > 0 ? technologies : undefined,
            notes: notes || undefined,
          }
          break

        case "project":
          data = {
            ...baseData,
            name: projectName,
            role: role || undefined,
            startDate: startDate || undefined,
            endDate: endDate || null,
            description: projectDescription,
            accomplishments: accomplishments.length > 0 ? accomplishments : undefined,
            technologies: technologies.length > 0 ? technologies : undefined,
            challenges: projectChallenges.length > 0 ? projectChallenges : undefined,
          }
          break

        case "skill-group":
          data = {
            ...baseData,
            category,
            skills,
          }
          break

        case "text-section":
          data = {
            ...baseData,
            heading: heading || undefined,
            content,
            format,
          }
          break

        case "education":
          data = {
            ...baseData,
            institution,
            degree: degree || undefined,
            field: field || undefined,
            location: location || undefined,
            startDate: startDate || undefined,
            endDate: endDate || null,
            honors: honors || undefined,
            description: educationDescription || undefined,
          }
          break

        default:
          throw new Error(`Unsupported content item type: ${type}`)
      }

      if (!user) {
        throw new Error("User must be authenticated")
      }
      if (!user.email) {
        throw new Error("User email is required to manage content items")
      }

      if (item) {
        // Update existing item using client
        await contentItemsClient.updateContentItem(item.id, user.email, data)
      } else {
        // Create new item using client
        const createData = data as CreateContentItemData
        await contentItemsClient.createContentItem(user.uid, user.email, createData)
      }

      onSave()
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save content item:", error)
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save content item",
      })
    } finally {
      setLoading(false)
    }
  }

  const getDialogTitle = () => {
    const action = item ? "Edit" : "Create"
    const typeName = type.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())
    return `${action} ${typeName}`
  }

  const renderFormFields = () => {
    switch (type) {
      case "company":
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company">Company *</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Job title/role"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, State"
                />
              </div>
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="month"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="month"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="Leave empty for current"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://company.com"
              />
            </div>

            <div>
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief description of your role and responsibilities"
                rows={3}
              />
            </div>

            <div>
              <Label>Key Accomplishments</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={accomplishmentInput}
                  onChange={(e) => setAccomplishmentInput(e.target.value)}
                  placeholder="Add an accomplishment"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToList(
                        accomplishments,
                        setAccomplishments,
                        accomplishmentInput,
                        setAccomplishmentInput
                      )
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    addToList(
                      accomplishments,
                      setAccomplishments,
                      accomplishmentInput,
                      setAccomplishmentInput
                    )
                  }
                >
                  Add
                </Button>
              </div>
              {accomplishments.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {accomplishments.map((accomplishment) => (
                    <Badge
                      key={accomplishment}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {accomplishment}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() =>
                          removeFromList(accomplishments, setAccomplishments, accomplishment)
                        }
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Technologies</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  placeholder="Add a technology"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToList(technologies, setTechnologies, techInput, setTechInput)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addToList(technologies, setTechnologies, techInput, setTechInput)}
                >
                  Add
                </Button>
              </div>
              {technologies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {technologies.map((tech) => (
                    <Badge key={tech} variant="outline" className="flex items-center gap-1">
                      {tech}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFromList(technologies, setTechnologies, tech)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes (not shown publicly)"
                rows={2}
              />
            </div>
          </>
        )

      case "skill-group":
        return (
          <>
            <div>
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Programming Languages, Frameworks, Tools"
                required
              />
            </div>

            <div>
              <Label>Skills</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="Add a skill"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToList(skills, setSkills, skillInput, setSkillInput)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addToList(skills, setSkills, skillInput, setSkillInput)}
                >
                  Add
                </Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {skills.map((skill) => (
                    <Badge key={skill} variant="outline" className="flex items-center gap-1">
                      {skill}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFromList(skills, setSkills, skill)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </>
        )

      case "text-section":
        return (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label htmlFor="heading">Heading</Label>
                <Input
                  id="heading"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="Section heading"
                />
              </div>
              <div>
                <Label htmlFor="format">Format</Label>
                <Select
                  value={format}
                  onValueChange={(value: "markdown" | "plain" | "html") => setFormat(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="plain">Plain Text</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Section content"
                rows={6}
                required
              />
            </div>
          </>
        )

      default:
        return (
          <div className="text-center text-muted-foreground py-8">
            Form for {type} coming soon...
          </div>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        {alert && (
          <Alert variant={alert.type === "error" ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value: ContentItemVisibility) => setVisibility(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addToList(tags, setTags, tagInput, setTagInput)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => addToList(tags, setTags, tagInput, setTagInput)}
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFromList(tags, setTags, tag)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Type-specific fields */}
          {renderFormFields()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {item ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
