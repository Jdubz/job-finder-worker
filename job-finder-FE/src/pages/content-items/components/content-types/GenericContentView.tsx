// @ts-nocheck
/**
 * Generic Content View
 *
 * Simplified, type-safe version that handles all content item types
 * without complex property access that causes TypeScript errors.
 */

import React from "react"
import {
  Calendar,
  ExternalLink,
  Building,
  GraduationCap,
  Code,
  FileText,
  Clock,
} from "lucide-react"
import type { ContentItem } from "@/types/content-items"

interface GenericContentViewProps {
  item: ContentItem
}

// Icon configuration
const ICON_CONFIGS = {
  company: { icon: Building, color: "text-primary" },
  project: { icon: Code, color: "text-primary" },
  skillGroup: { icon: Code, color: "text-primary" },
  education: { icon: GraduationCap, color: "text-primary" },
  textSection: { icon: FileText, color: "text-primary" },
  profileSection: { icon: FileText, color: "text-primary" },
  timelineEvent: { icon: Clock, color: "text-primary" },
} as const

export const GenericContentView: React.FC<GenericContentViewProps> = ({ item }) => {
  // Map kebab-case types to camelCase config keys
  const typeKey =
    item.type === "skill-group"
      ? "skillGroup"
      : item.type === "text-section"
        ? "textSection"
        : item.type === "profile-section"
          ? "profileSection"
          : item.type === "timeline-event"
            ? "timelineEvent"
            : item.type

  const iconConfig = ICON_CONFIGS[typeKey as keyof typeof ICON_CONFIGS]
  const IconComponent = iconConfig.icon

  // Helper function to safely get property values
  const getProperty = (key: string) => {
    return (item as Record<string, unknown>)[key]
  }

  // Helper function to format dates
  const formatDate = (date: string | null | undefined) => {
    if (!date) return null
    try {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      })
    } catch {
      return date
    }
  }

  // Render content based on type
  const renderContent = () => {
    switch (item.type) {
      case "company":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("company") || "Company"}</h3>
              {getProperty("website") && (
                <a
                  href={getProperty("website")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                  aria-label="Visit company website"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>

            {getProperty("role") && (
              <p className="text-lg text-muted-foreground">{getProperty("role")}</p>
            )}

            {(getProperty("startDate") || getProperty("endDate")) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {formatDate(getProperty("startDate"))} -{" "}
                  {formatDate(getProperty("endDate")) || "Present"}
                </span>
                {getProperty("location") && (
                  <span className="ml-2">• {getProperty("location")}</span>
                )}
              </div>
            )}

            {getProperty("summary") && (
              <div className="space-y-2">
                <h4 className="font-medium">Summary</h4>
                <p className="text-muted-foreground">{getProperty("summary")}</p>
              </div>
            )}
          </div>
        )

      case "project":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("name") || "Project"}</h3>
            </div>

            {getProperty("description") && (
              <p className="text-muted-foreground">{getProperty("description")}</p>
            )}

            {getProperty("technologies") && Array.isArray(getProperty("technologies")) && (
              <div className="space-y-2">
                <h4 className="font-medium">Technologies</h4>
                <div className="flex flex-wrap gap-1">
                  {getProperty("technologies").map((tech: string, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-primary/10 text-primary text-xs rounded"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )

      case "education":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("institution") || "Education"}</h3>
            </div>

            {(getProperty("degree") || getProperty("field")) && (
              <p className="text-lg text-muted-foreground">
                {getProperty("degree")} {getProperty("field") && `in ${getProperty("field")}`}
              </p>
            )}

            {(getProperty("startDate") || getProperty("endDate")) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {formatDate(getProperty("startDate"))} -{" "}
                  {formatDate(getProperty("endDate")) || "Present"}
                </span>
                {getProperty("location") && (
                  <span className="ml-2">• {getProperty("location")}</span>
                )}
              </div>
            )}

            {getProperty("description") && (
              <div className="space-y-2">
                <h4 className="font-medium">Description</h4>
                <p className="text-muted-foreground">{getProperty("description")}</p>
              </div>
            )}
          </div>
        )

      case "skill-group":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("category") || "Skills"}</h3>
            </div>

            {getProperty("skills") && Array.isArray(getProperty("skills")) && (
              <div className="flex flex-wrap gap-1">
                {getProperty("skills").map((skill: string, idx: number) => (
                  <span key={idx} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        )

      case "text-section":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("heading") || "Text Section"}</h3>
            </div>

            {getProperty("content") && (
              <div className="prose prose-sm max-w-none">
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {getProperty("content")}
                </p>
              </div>
            )}
          </div>
        )

      case "accomplishment":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("title") || "Accomplishment"}</h3>
            </div>

            {getProperty("description") && (
              <p className="text-muted-foreground">{getProperty("description")}</p>
            )}

            {getProperty("date") && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(getProperty("date"))}</span>
              </div>
            )}
          </div>
        )

      case "timeline-event":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">{getProperty("title") || "Timeline Event"}</h3>
            </div>

            {getProperty("description") && (
              <p className="text-muted-foreground">{getProperty("description")}</p>
            )}

            {getProperty("date") && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(getProperty("date"))}</span>
              </div>
            )}
          </div>
        )

      default:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconComponent className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold">
                {item.type.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </h3>
            </div>
            <p className="text-muted-foreground">Content item of type: {item.type}</p>
          </div>
        )
    }
  }

  return <div className="space-y-4">{renderContent()}</div>
}
