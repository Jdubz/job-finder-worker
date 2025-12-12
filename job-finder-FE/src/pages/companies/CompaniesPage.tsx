import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useCompanies } from "@/hooks/useCompanies"
import { useQueueItems } from "@/hooks/useQueueItems"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { normalizeDateValue } from "@/utils/dateFormat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Loader2, Plus, Building2, Search } from "lucide-react"
import type { Company } from "@shared/types"

// Defensive helper: never let arbitrary objects reach React text nodes
const safeText = (value: unknown, fallback = "—") => {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value === "string" || typeof value === "number") return value
  // Some backends occasionally send nested objects/arrays; stringify to avoid render crashes
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

// Fields we expect to be populated for a company to be considered "complete".
// Keep this focused on data we actually collect/render; optional extras (e.g., mission)
// aren't required for completeness.
const completenessFields: (keyof Company)[] = [
  "name",
  "website",
  "about",
  "culture",
  "industry",
  "headquartersLocation",
  "techStack",
]

const hasValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "string") return value.trim().length > 0
  return value !== null && value !== undefined
}

/**
 * Derive company status using a single, simple rule-set:
 * - Pending: an enrichment job is currently queued
 * - Complete: all tracked company properties have values
 * - Partial: anything else
 */
function getDataStatus(company: Company, isPending: boolean): { label: string; color: string } {
  if (isPending) return { label: "Pending", color: "bg-blue-100 text-blue-800" }

  const isComplete = completenessFields.every((field) => hasValue(company[field]))
  if (isComplete) return { label: "Complete", color: "bg-green-100 text-green-800" }

  return { label: "Partial", color: "bg-amber-100 text-amber-900" }
}

/** Badge component showing company data completeness status */
function CompanyStatusBadge({
  company,
  isPending,
  status,
}: {
  company: Company
  isPending: boolean
  status?: { label: string; color: string }
}) {
  const computed = status ?? getDataStatus(company, isPending)
  return <Badge className={computed.color}>{computed.label}</Badge>
}

export function CompaniesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { companies, loading, deleteCompany, setFilters } = useCompanies({ limit: 100 })
  const { submitCompany, queueItems: pendingQueueItems } = useQueueItems({
    status: "pending",
    type: "company",
    limit: 500,
  })
  const { openModal } = useEntityModal()
  const [deleteRequest, setDeleteRequest] = useState<
    | {
        id: string
        name?: string | null
        resolve: () => void
        reject: (reason?: unknown) => void
      }
    | null
  >(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState<"updated_at" | "created_at" | "name">("updated_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  // Form state
  const [companyName, setCompanyName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")

  const resetForm = () => {
    setCompanyName("")
    setWebsiteUrl("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!companyName.trim()) {
      setError("Company name is required")
      return
    }
    if (!websiteUrl.trim()) {
      setError("Website URL is required")
      return
    }

    try {
      setIsSubmitting(true)
      await submitCompany({
        companyName: companyName.trim(),
        websiteUrl: websiteUrl.trim(),
      })
      resetForm()
      setIsAddModalOpen(false)
      navigate("/queue-management")
    } catch (err) {
      console.error("Failed to submit company:", err)
      setError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) =>
    new Promise<void>((resolve, reject) => {
      const company = companies.find((c) => c.id === id)
      setDeleteRequest({ id, name: company?.name, resolve, reject })
    })

  const handleReanalyze = async (company: Company) => {
    if (!company.id) {
      throw new Error("Company ID is missing, cannot re-analyze.")
    }
    try {
      await submitCompany({
        companyName: company.name,
        websiteUrl: company.website || undefined,
        companyId: company.id,
        allowReanalysis: true,
      })
    } catch (err) {
      console.error("Failed to submit re-analysis:", err)
      throw err
    }
  }

  const handleSearch = () => {
    setFilters({
      search: searchTerm || undefined,
      limit: 100,
      sortBy,
      sortOrder,
    })
  }

  const handleSortChange = (value: string) => {
    const nextSort = value as typeof sortBy
    setSortBy(nextSort)
    setFilters({
      search: searchTerm || undefined,
      limit: 100,
      sortBy: nextSort,
      sortOrder,
    })
  }

  const handleSortOrderChange = (value: "asc" | "desc") => {
    setSortOrder(value)
    setFilters({
      search: searchTerm || undefined,
      limit: 100,
      sortBy,
      sortOrder: value,
    })
  }

  const getTime = (value: unknown) => normalizeDateValue(value)?.getTime() ?? 0

  // Filter companies locally for search and apply sort (memoized)
  const pendingCompanyIds = useMemo(
    () =>
      new Set(
        pendingQueueItems
          .filter((item) => item.type === "company" && item.company_id)
          .map((item) => item.company_id as string)
      ),
    [pendingQueueItems]
  )

  const filteredCompanies = useMemo(() => {
    const filtered = companies.filter((company) => {
      if (searchTerm && !company.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      const direction = sortOrder === "asc" ? 1 : -1
      switch (sortBy) {
        case "name":
          return direction * a.name.localeCompare(b.name)
        case "created_at": {
          const diff = getTime(a.createdAt) - getTime(b.createdAt)
          return direction * diff
        }
        case "updated_at":
        default: {
          const diff = getTime(a.updatedAt ?? a.createdAt) - getTime(b.updatedAt ?? b.createdAt)
          return direction * diff
        }
      }
    })
  }, [companies, searchTerm, sortBy, sortOrder])

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground mt-2">
            Discover and track companies (sign in required)
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sign in to view companies.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground mt-2">
            Companies discovered and analyzed for job opportunities
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Company
        </Button>
        {/* Delete confirmation dialog */}
        <AlertDialog open={!!deleteRequest} onOpenChange={(open) => !open && deleteRequest?.reject(new Error("Delete canceled"))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete company?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove
                {deleteRequest?.name ? ` "${deleteRequest.name}"` : " this company"} and its associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  deleteRequest?.reject(new Error("Delete canceled"))
                  setDeleteRequest(null)
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmingDelete}
                onClick={async () => {
                  if (!deleteRequest) return
                  setConfirmingDelete(true)
                  try {
                    await deleteCompany(deleteRequest.id)
                    deleteRequest.resolve()
                  } catch (err) {
                    deleteRequest.reject(err)
                  } finally {
                    setConfirmingDelete(false)
                    setDeleteRequest(null)
                  }
                }}
              >
                {confirmingDelete ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog
          open={isAddModalOpen}
          onOpenChange={(open) => {
            setIsAddModalOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Discover Company</DialogTitle>
              <DialogDescription>
                Enter a company name and website to analyze their tech stack and find job boards
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Acme Corporation"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="websiteUrl">
                  Website URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="websiteUrl"
                  type="url"
                  placeholder="https://acme.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-sm text-muted-foreground">The company's main website</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Discover Company"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Companies List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Tracked Companies</CardTitle>
              <CardDescription>
                Click on a company to view details. Statuses: “Pending” = enrichment queued, “Complete” = all
                properties filled, “Partial” = anything else.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="flex gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full sm:w-[200px]"
                />
                <Button variant="outline" size="icon" onClick={handleSearch} className="flex-shrink-0">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated_at">Updated (newest)</SelectItem>
                    <SelectItem value="created_at">Created (newest)</SelectItem>
                    <SelectItem value="name">Name (A–Z)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value) => handleSortOrderChange(value as "asc" | "desc")}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Desc</SelectItem>
                    <SelectItem value="asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No companies found.</p>
              <p className="text-sm">Click "Add Company" to discover new companies.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Industry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company: Company) => {
                  const isPending = company.id ? pendingCompanyIds.has(company.id) : false
                  const status = getDataStatus(company, isPending)
                  return (
                    <TableRow
                      key={company.id}
                      className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                      onClick={() =>
                        openModal({
                          type: "company",
                          company,
                          handlers: {
                            onDelete: company.id ? () => handleDelete(company.id as string) : undefined,
                            onReanalyze: handleReanalyze,
                          },
                        })
                      }
                    >
                      <TableCell>
                        <div className="font-medium">{safeText(company.name)}</div>
                        {/* Show industry on mobile as secondary text */}
                        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                          {safeText(company.industry, "")}
                        </div>
                      </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {safeText(company.industry)}
                    </TableCell>
                    <TableCell>
                      <CompanyStatusBadge company={company} isPending={isPending} status={status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {status.label !== "Complete" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async (event) => {
                            event.stopPropagation()
                            try {
                              await handleReanalyze(company)
                            } catch (_err) {
                              // handleReanalyze already logs; swallow to avoid unhandled rejection
                            }
                          }}
                        >
                          Re-analyze
                        </Button>
                      )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
