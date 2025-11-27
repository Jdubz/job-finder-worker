import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useCompanies } from "@/hooks/useCompanies"
import { useQueueItems } from "@/hooks/useQueueItems"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { AlertCircle, CheckCircle2, Loader2, Plus, Building2, ExternalLink, Trash2, Search } from "lucide-react"
import type { Company } from "@shared/types"

function formatDate(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else if (typeof date === "object" && date !== null && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function") {
    d = (date as { toDate: () => Date }).toDate()
  } else {
    return "—"
  }
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const tierColors: Record<string, string> = {
  S: "bg-purple-100 text-purple-800",
  A: "bg-blue-100 text-blue-800",
  B: "bg-green-100 text-green-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-gray-100 text-gray-800",
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  complete: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
}

export function CompaniesPage() {
  const { user } = useAuth()
  const { companies, loading, deleteCompany, refetch, setFilters } = useCompanies({ limit: 100 })
  const { submitCompany } = useQueueItems()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("all")

  // Form state
  const [companyName, setCompanyName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")

  const resetForm = () => {
    setCompanyName("")
    setWebsiteUrl("")
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

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

      setSuccess("Company discovery task created! The company will appear here once analyzed.")
      setTimeout(() => {
        resetForm()
        setIsAddModalOpen(false)
        refetch()
      }, 2000)
    } catch (err) {
      console.error("Failed to submit company:", err)
      setError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this company?")) return
    try {
      await deleteCompany(id)
      setSelectedCompany(null)
    } catch (err) {
      console.error("Failed to delete company:", err)
    }
  }

  const handleSearch = () => {
    setFilters({
      search: searchTerm || undefined,
      tier: tierFilter !== "all" ? (tierFilter as Company["tier"]) : undefined,
      limit: 100,
    })
  }

  // Filter companies locally for search (in addition to server-side filtering)
  const filteredCompanies = companies.filter((company) => {
    if (searchTerm && !company.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (tierFilter !== "all" && company.tier !== tierFilter) {
      return false
    }
    return true
  })

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

              {success && (
                <Alert className="border-green-500 bg-green-50 text-green-900">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>{success}</AlertDescription>
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tracked Companies</CardTitle>
              <CardDescription>
                Click on a company to view details
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-[200px]"
              />
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="S">S Tier</SelectItem>
                  <SelectItem value="A">A Tier</SelectItem>
                  <SelectItem value="B">B Tier</SelectItem>
                  <SelectItem value="C">C Tier</SelectItem>
                  <SelectItem value="D">D Tier</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
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
                  <TableHead>Tier</TableHead>
                  <TableHead className="hidden md:table-cell">Industry</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company: Company) => (
                  <TableRow
                    key={company.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedCompany(company)}
                  >
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>
                      {company.tier ? (
                        <Badge className={tierColors[company.tier] ?? tierColors.D}>
                          {company.tier}
                        </Badge>
                      ) : (
                        <Badge className={tierColors.D}>—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {company.industry || "—"}
                    </TableCell>
                    <TableCell>
                      {company.analysisStatus ? (
                        <Badge className={statusColors[company.analysisStatus] ?? statusColors.pending}>
                          {company.analysisStatus.replace("_", " ")}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)}>
        <DialogContent className="sm:max-w-[600px]">
          {selectedCompany && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">{selectedCompany.name}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {selectedCompany.industry || "Industry not specified"}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCompany.analysisStatus && (
                      <Badge className={statusColors[selectedCompany.analysisStatus] ?? statusColors.pending}>
                        {selectedCompany.analysisStatus.replace("_", " ")}
                      </Badge>
                    )}
                    {selectedCompany.tier && (
                      <Badge className={tierColors[selectedCompany.tier] ?? tierColors.D}>
                        {selectedCompany.tier}
                      </Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Website */}
                {selectedCompany.website && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Website</Label>
                    <a
                      href={selectedCompany.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-blue-600 hover:underline mt-1"
                    >
                      {selectedCompany.website}
                      <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}

                {/* Tech Stack */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tech Stack</Label>
                  {selectedCompany.techStack && selectedCompany.techStack.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedCompany.techStack.map((tech) => (
                        <Badge key={tech} variant="outline" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">No tech stack information available</p>
                  )}
                </div>

                {/* Description if available */}
                {selectedCompany.description && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Description</Label>
                    <p className="mt-1 text-sm">{selectedCompany.description}</p>
                  </div>
                )}

                {/* Headquarters/Location if available */}
                {selectedCompany.headquarters && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Headquarters</Label>
                    <p className="mt-1">{selectedCompany.headquarters}</p>
                  </div>
                )}

                {/* Size if available */}
                {selectedCompany.size && (
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Company Size</Label>
                    <p className="mt-1">{selectedCompany.size}</p>
                  </div>
                )}

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(selectedCompany.createdAt)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Updated</Label>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(selectedCompany.updatedAt)}</p>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex justify-between sm:justify-between">
                <Button
                  variant="destructive"
                  onClick={() => selectedCompany.id && handleDelete(selectedCompany.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setSelectedCompany(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
