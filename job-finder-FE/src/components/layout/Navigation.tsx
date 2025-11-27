import { Link, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { ROUTES } from "@/types/routes"
import { cn } from "@/lib/utils"
import {
  Menu,
  Home,
  HelpCircle,
  FileText,
  Settings,
  Briefcase,
  ListChecks,
  Sparkles,
  FolderOpen,
  Building2,
  Rss,
} from "lucide-react"
import { useState } from "react"
import { AuthIcon } from "@/components/auth/AuthIcon"
import { AuthModal } from "@/components/auth/AuthModal"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface NavLink {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const publicLinks: NavLink[] = [
  { to: ROUTES.HOME, label: "Home", icon: Home },
  { to: ROUTES.HOW_IT_WORKS, label: "How It Works", icon: HelpCircle },
  { to: ROUTES.CONTENT_ITEMS, label: "Experience", icon: FolderOpen },
  { to: ROUTES.DOCUMENT_BUILDER, label: "Document Builder", icon: FileText },
]

const jobFinderLinks: NavLink[] = [
  { to: ROUTES.JOB_FINDER, label: "Job Finder", icon: Briefcase },
  { to: ROUTES.JOB_APPLICATIONS, label: "Job Applications", icon: FileText },
  { to: ROUTES.COMPANIES, label: "Companies", icon: Building2 },
  { to: ROUTES.SOURCES, label: "Sources", icon: Rss },
  { to: ROUTES.QUEUE_MANAGEMENT, label: "Queue Management", icon: ListChecks },
]

const systemLinks: NavLink[] = [
  { to: ROUTES.AI_PROMPTS, label: "AI Prompts", icon: Sparkles },
  { to: ROUTES.JOB_FINDER_CONFIG, label: "Configuration", icon: Settings },
  { to: ROUTES.SETTINGS, label: "Settings", icon: Settings },
]

export function Navigation() {
  const { isOwner } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  const isActive = (path: string) => location.pathname === path

  const NavLink = ({ link, onClick }: { link: NavLink; onClick?: () => void }) => {
    const Icon = link.icon
    return (
      <Link
        to={link.to}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
          "hover:bg-accent hover:text-accent-foreground",
          isActive(link.to) ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{link.label}</span>
      </Link>
    )
  }

  return (
    <>
      {/* Compact Top Bar */}
      <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between">
            {/* Drawer Trigger + Logo */}
            <div className="flex items-center gap-3">
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] sm:w-[320px]">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-left">
                      <img src="/logo.png" alt="Job Finder" className="h-8 w-auto" />
                      <span>Job Finder</span>
                    </SheetTitle>
                  </SheetHeader>

                  <div className="flex flex-col gap-6 mt-8">
                    {/* Main Navigation */}
                    <div className="space-y-1">
                      <h4 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Main
                      </h4>
                      {publicLinks.map((link) => (
                        <NavLink key={link.to} link={link} onClick={() => setDrawerOpen(false)} />
                      ))}
                    </div>

                    {/* Owner Tools */}
                    {isOwner && (
                      <>
                        <Separator />

                        <div className="space-y-1">
                          <h4 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Job Finder Tools
                          </h4>
                          {jobFinderLinks.map((link) => (
                            <NavLink
                              key={link.to}
                              link={link}
                              onClick={() => setDrawerOpen(false)}
                            />
                          ))}
                        </div>

                        <Separator />

                        <div className="space-y-1">
                          <h4 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            System
                          </h4>
                          {systemLinks.map((link) => (
                            <NavLink
                              key={link.to}
                              link={link}
                              onClick={() => setDrawerOpen(false)}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {/* Footer Info */}
                    <div className="mt-auto pt-6">
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        <p className="font-medium mb-1">Job Finder Portfolio</p>
                        <p>Build your career toolkit</p>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <Link to={ROUTES.HOME} className="flex items-center gap-2">
                <span className="font-semibold text-lg">Job Finder</span>
              </Link>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              <AuthIcon onClick={() => setAuthModalOpen(true)} />
            </div>
          </div>
        </div>
      </nav>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  )
}
