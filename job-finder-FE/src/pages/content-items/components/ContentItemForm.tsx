import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { ContentItemFormValues } from "@/types/content-items"

interface ContentItemFormProps {
  initialValues?: ContentItemFormValues
  onSubmit: (values: ContentItemFormValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

const defaultValues: ContentItemFormValues = {
  title: "",
  role: "",
  location: "",
  website: "",
  startDate: "",
  endDate: "",
  description: "",
  skills: [],
  visibility: "published"
}

export function ContentItemForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save"
}: ContentItemFormProps) {
  const [formValues, setFormValues] = useState<ContentItemFormValues>({
    ...defaultValues,
    ...initialValues
  })
  const [skillsText, setSkillsText] = useState(
    initialValues?.skills?.length ? initialValues.skills.join(", ") : ""
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange =
    (field: keyof ContentItemFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value
      setFormValues((prev) => ({
        ...prev,
        [field]: value.length ? value : undefined
      }))
    }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedValues = Object.fromEntries(
      Object.entries(formValues).map(([key, value]) => {
        if (value === null || value === undefined) {
          return [key, undefined]
        }
        if (typeof value === "string" && value.trim().length === 0) {
          return [key, undefined]
        }
        return [key, value]
      })
    ) as ContentItemFormValues
    const payload: ContentItemFormValues = {
      ...normalizedValues,
      skills: parseSkills(skillsText)
    }

    setIsSubmitting(true)
    try {
      await onSubmit(payload)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={formValues.title ?? ""}
            onChange={handleChange("title")}
            placeholder="Senior Cloud Architect"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Input
            id="role"
            value={formValues.role ?? ""}
            onChange={handleChange("role")}
            placeholder="Fulfil Solutions"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formValues.location ?? ""}
            onChange={handleChange("location")}
            placeholder="Seattle, WA"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={formValues.website ?? ""}
            onChange={handleChange("website")}
            placeholder="https://example.com"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date (YYYY-MM)</Label>
          <Input
            id="startDate"
            value={formValues.startDate ?? ""}
            onChange={handleChange("startDate")}
            placeholder="2022-01"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End Date (YYYY-MM)</Label>
          <Input
            id="endDate"
            value={formValues.endDate ?? ""}
            onChange={handleChange("endDate")}
            placeholder="2023-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (Markdown supported)</Label>
        <Textarea
          id="description"
          rows={5}
          value={formValues.description ?? ""}
          onChange={handleChange("description")}
          placeholder="Describe the impact, responsibilities, and outcomes."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="skills">Skills (comma separated)</Label>
        <Input
          id="skills"
          value={skillsText}
          onChange={(event) => setSkillsText(event.target.value)}
          placeholder="AWS, Terraform, Kubernetes"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="visibility">Visibility</Label>
        <select
          id="visibility"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
          value={formValues.visibility ?? "published"}
          onChange={(event) =>
            setFormValues((prev) => ({
              ...prev,
              visibility: event.target.value as ContentItemFormValues["visibility"]
            }))
          }
        >
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function parseSkills(value: string): string[] | undefined {
  const skills = value
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)

  return skills.length ? skills : undefined
}
