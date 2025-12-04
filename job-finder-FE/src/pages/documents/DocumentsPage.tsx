import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { generatorClient, type GeneratorRequestRecord } from "@/api/generator-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Loader2, Search, FileText, Eye, Download, Building2 } from "lucide-react"
import { ROUTES } from "@/types/routes"
import { DocumentPreviewModal } from "./components/DocumentPreviewModal"
import { getAbsoluteArtifactUrl } from "@/config/api"

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getStatusBadge(status: GeneratorRequestRecord["status"]) {
  const variants: Record<typeof status, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "outline",
    processing: "secondary",
    completed: "default",
    failed: "destructive",
  }
  return <Badge variant={variants[status]}>{status}</Badge>
}

export function DocumentsPage() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<GeneratorRequestRecord[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<GeneratorRequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<string>("date")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Modal state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState("")

  // Fetch documents
  useEffect(() => {
    async function fetchDocuments() {
      try {
        setLoading(true)
        const docs = await generatorClient.listDocuments()
        setDocuments(docs)
        setError(null)
      } catch (err) {
        setError("Failed to load documents. Please try again.")
        console.error("Failed to fetch documents:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchDocuments()
  }, [])

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...documents]

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((doc) => doc.status === statusFilter)
    }

    // Search filter (company name or job role)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (doc) =>
          doc.job.company.toLowerCase().includes(query) ||
          doc.job.role.toLowerCase().includes(query)
      )
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "company":
          return a.job.company.localeCompare(b.job.company)
        case "role":
          return a.job.role.localeCompare(b.job.role)
        default:
          return 0
      }
    })

    setFilteredDocuments(filtered)
  }, [documents, searchQuery, sortBy, statusFilter])

  const handleViewDocument = (url: string, title: string) => {
    const fullUrl = getAbsoluteArtifactUrl(url)
    setPreviewUrl(fullUrl)
    setPreviewTitle(title)
    setPreviewOpen(true)
  }

  const handleDownload = (url: string, filename: string) => {
    const fullUrl = getAbsoluteArtifactUrl(url)
    if (!fullUrl) return
    const link = document.createElement("a")
    link.href = fullUrl
    link.download = filename
    link.target = "_blank"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const { completedCount, processingCount } = useMemo(() => {
    return documents.reduce(
      (acc, doc) => {
        if (doc.status === "completed") {
          acc.completedCount += 1
        } else if (doc.status === "processing" || doc.status === "pending") {
          acc.processingCount += 1
        }
        return acc
      },
      { completedCount: 0, processingCount: 0 }
    )
  }, [documents])

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-2">Generated resumes and cover letters</p>
        </div>
        <Button onClick={() => navigate(ROUTES.DOCUMENT_BUILDER)}>
          <FileText className="mr-2 h-4 w-4" />
          Generate New
        </Button>
      </div>

      {/* Stats Overview */}
      {!loading && documents.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <div className="bg-secondary p-4 rounded-lg">
            <div className="text-2xl font-bold">{documents.length}</div>
            <div className="text-sm text-muted-foreground">Total Requests</div>
          </div>
          <div className="bg-green-100 dark:bg-green-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <div className="text-sm text-green-700 dark:text-green-400">Completed</div>
          </div>
          <div className="bg-yellow-100 dark:bg-yellow-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{processingCount}</div>
            <div className="text-sm text-yellow-700 dark:text-yellow-400">In Progress</div>
          </div>
          <div className="bg-blue-100 dark:bg-blue-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {documents.reduce((sum, d) => sum + d.artifacts.length, 0)}
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-400">Total Files</div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Documents List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Generation History</CardTitle>
              <CardDescription>Click view to preview documents</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-[180px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="role">Role</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No documents yet</p>
              <p className="text-sm mt-1">Generate your first resume or cover letter</p>
              <Button className="mt-4" onClick={() => navigate(ROUTES.DOCUMENT_BUILDER)}>
                Get Started
              </Button>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No documents match your filters</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("")
                  setStatusFilter("all")
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-[150px] sm:max-w-[200px]">
                      <div className="font-medium truncate">{doc.job.role}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{doc.job.company}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {doc.generateType === "both"
                          ? "Both"
                          : doc.generateType === "resume"
                            ? "Resume"
                            : "Cover Letter"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(doc.status)}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {doc.resumeUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleViewDocument(
                                  doc.resumeUrl!,
                                  `Resume - ${doc.job.role} at ${doc.job.company}`
                                )
                              }
                              title="View Resume"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View Resume</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const artifact = doc.artifacts.find((a) => a.artifactType === "resume")
                                handleDownload(doc.resumeUrl!, artifact?.filename || "resume.pdf")
                              }}
                              title="Download Resume"
                            >
                              <Download className="h-4 w-4" />
                              <span className="sr-only">Download Resume</span>
                            </Button>
                          </>
                        )}
                        {doc.coverLetterUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleViewDocument(
                                  doc.coverLetterUrl!,
                                  `Cover Letter - ${doc.job.role} at ${doc.job.company}`
                                )
                              }
                              title="View Cover Letter"
                            >
                              <Eye className="h-4 w-4 text-blue-500" />
                              <span className="sr-only">View Cover Letter</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const artifact = doc.artifacts.find((a) => a.artifactType === "cover-letter")
                                handleDownload(doc.coverLetterUrl!, artifact?.filename || "cover-letter.pdf")
                              }}
                              title="Download Cover Letter"
                            >
                              <Download className="h-4 w-4 text-blue-500" />
                              <span className="sr-only">Download Cover Letter</span>
                            </Button>
                          </>
                        )}
                        {!doc.resumeUrl && !doc.coverLetterUrl && (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <DocumentPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewUrl}
        title={previewTitle}
      />
    </div>
  )
}
