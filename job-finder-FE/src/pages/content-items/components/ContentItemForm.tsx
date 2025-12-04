import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import type { ContentItemFormValues, ContentItemAIContext } from "@/types/content-items"
import { AI_CONTEXT_OPTIONS } from "@/types/content-items"
import { remark } from "remark"
import remarkLint from "remark-lint"
import remarkPresetLintRecommended from "remark-preset-lint-recommended"

const markdownProcessor = remark().use(remarkLint).use(remarkPresetLintRecommended)

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
  aiContext: undefined
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
  const [lintMessages, setLintMessages] = useState<string[]>([])

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

  useEffect(() => {
    let cancelled = false
    const text = formValues.description ?? ""
    if (!text.trim()) {
      setLintMessages([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const file = await markdownProcessor.process(text)
        if (cancelled) return
        const messages = file.messages.map((message) => {
          const location = message.line ? ` (line ${message.line})` : ""
          return `${message.message}${location}`
        })
        setLintMessages(messages)
      } catch (_err) {
        if (!cancelled) {
          setLintMessages(["Markdown linting failed."])
          console.error("Markdown linting error:", _err)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [formValues.description])

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
        {lintMessages.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Markdown lint</div>
            <ul className="mt-1 list-disc pl-4">
              {lintMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tip: use # headings, lists, and backticks; live lint will flag common formatting issues.
          </p>
        )}
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
        <Label htmlFor="aiContext">AI Context</Label>
        <Select
          value={formValues.aiContext ?? ""}
          onValueChange={(value) =>
            setFormValues((prev) => ({
              ...prev,
              aiContext: value ? (value as ContentItemAIContext) : undefined
            }))
          }
        >
          <SelectTrigger id="aiContext">
            <SelectValue placeholder="Select context for document generation" />
          </SelectTrigger>
          <SelectContent>
            {AI_CONTEXT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="font-medium">{option.label}</span>
                <span className="ml-2 text-muted-foreground text-xs">
                  {option.description}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Determines how this item appears in generated resumes and cover letters
        </p>
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
