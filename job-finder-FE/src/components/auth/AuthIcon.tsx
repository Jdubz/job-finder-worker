import { HelpCircle, Eye, Edit } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

interface AuthIconProps {
  onClick: () => void
  className?: string
}

export function AuthIcon({ onClick, className }: AuthIconProps) {
  const { user, isOwner, loading } = useAuth()

  if (loading) {
    return (
      <button
        disabled
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center bg-muted opacity-50",
          className
        )}
        aria-label="Loading authentication status"
      >
        <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
      </button>
    )
  }

  const getIconAndLabel = () => {
    if (!user) {
      return {
        icon: <HelpCircle className="w-4 h-4" />,
        label: "Not signed in - Click to learn about authentication",
        bgColor: "bg-muted hover:bg-muted/80",
        iconColor: "text-muted-foreground",
      }
    }

    if (isOwner) {
      return {
        icon: <Edit className="w-4 h-4" />,
        label: "Signed in as Owner - Click for account options",
        bgColor: "bg-primary hover:bg-primary/90",
        iconColor: "text-primary-foreground",
      }
    }

    return {
      icon: <Eye className="w-4 h-4" />,
      label: "Signed in as Viewer - Click for account options",
      bgColor: "bg-secondary hover:bg-secondary/80",
      iconColor: "text-secondary-foreground",
    }
  }

  const { icon, label, bgColor, iconColor } = getIconAndLabel()

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
        bgColor,
        iconColor,
        className
      )}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  )
}
