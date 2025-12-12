import { useState, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useJobListings } from "@/hooks/useJobListings"
import { useQueueItems } from "@/hooks/useQueueItems"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { normalizeDateValue } from "@/utils/dateFormat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Search, Plus } from "lucide-react"
import { StatPill } from "@/components/ui/stat-pill"
import { logger } from "@/services/logging/FrontendLogger"
import type { JobListingRecord, JobListingStatus, SubmitJobRequest } from "@shared/types"

// Extracted hooks and components
import { useAddJobForm } from "./hooks/useAddJobForm"
import { useJobListingStats } from "./hooks/useJobListingStats"
import { AddJobDialog } from "./components/AddJobDialog"
import { JobListingsTable } from "./components/JobListingsTable"

export function JobListingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { listings, loading, deleteListing, setFilters } = useJobListings({
    limit: 100,
    sortBy: "updated",
    sortOrder: "desc",
  })
  const { submitJob } = useQueueItems()
  const { openModal, closeModal } = useEntityModal()

  // Filter and sort state
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"updated" | "date" | "title" | "company" | "status">("updated")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  // Delete confirmation state
  const [deleteRequest, setDeleteRequest] = useState<{ id: string; title?: string }>({ id: "", title: "" })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Use extracted hooks
  const { stats } = useJobListingStats({ enabled: !!user })
  const addJobForm = useAddJobForm()

  const handleDelete = useCallback((id: string, title?: string) => {
    setDeleteRequest({ id, title })
  }, [])

  const handleResubmitBypass = useCallback(
    async (listing: JobListingRecord) => {
      try {
        const payload: SubmitJobRequest = {
          url: listing.url,
          companyName: listing.companyName,
          companyId: listing.companyId ?? undefined,
          title: listing.title,
          description: listing.description,
          location: listing.location ?? undefined,
          bypassFilter: true,
          metadata: { job_listing_id: listing.id },
        }
        await submitJob(payload)
        closeModal()
      } catch (err) {
        logger.error("JobListings", "resubmitListing", "Failed to resubmit listing", {
          error: { type: "ResubmitError", message: err instanceof Error ? err.message : String(err) },
        })
        throw err
      }
    },
    [submitJob, closeModal, navigate]
  )

  const handleSearch = useCallback(() => {
    setFilters({
      search: searchTerm || undefined,
      status: statusFilter !== "all" ? (statusFilter as JobListingStatus) : undefined,
      limit: 100,
      sortBy,
      sortOrder,
    })
  }, [searchTerm, statusFilter, sortBy, sortOrder, setFilters])

  const handleStatusFilterChange = useCallback(
    (value: string) => {
      setStatusFilter(value)
      setFilters({
        search: searchTerm || undefined,
        status: value !== "all" ? (value as JobListingStatus) : undefined,
        limit: 100,
        sortBy,
        sortOrder,
      })
    },
    [searchTerm, sortBy, sortOrder, setFilters]
  )

  const handleSortChange = useCallback(
    (value: string) => {
      const nextSort = value as typeof sortBy
      setSortBy(nextSort)
      setFilters({
        search: searchTerm || undefined,
        status: statusFilter !== "all" ? (statusFilter as JobListingStatus) : undefined,
        limit: 100,
        sortBy: nextSort,
        sortOrder,
      })
    },
    [searchTerm, statusFilter, sortOrder, setFilters]
  )

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      setSortOrder(value)
      setFilters({
        search: searchTerm || undefined,
        status: statusFilter !== "all" ? (statusFilter as JobListingStatus) : undefined,
        limit: 100,
        sortBy,
        sortOrder: value,
      })
    },
    [searchTerm, statusFilter, sortBy, setFilters]
  )

  const handleRowClick = useCallback(
    (listing: JobListingRecord) => {
      openModal({
        type: "jobListing",
        listing,
        onDelete: (id) => handleDelete(id, listing.title),
        onResubmit: () => handleResubmitBypass(listing),
      })
    },
    [openModal, handleDelete, handleResubmitBypass]
  )

  const handleCompanyClick = useCallback(
    (companyId: string | undefined) => {
      openModal({ type: "company", companyId })
    },
    [openModal]
  )

  // Filter listings locally for immediate search feedback (memoized)
  const getTime = (value: unknown) => normalizeDateValue(value)?.getTime() ?? 0

  const filteredListings = useMemo(() => {
    const filtered = listings.filter((listing) => {
      if (
        searchTerm &&
        !listing.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !listing.companyName.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false
      }
      if (statusFilter !== "all" && listing.status !== statusFilter) {
        return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      const direction = sortOrder === "asc" ? 1 : -1
      switch (sortBy) {
        case "company":
          return direction * a.companyName.localeCompare(b.companyName)
        case "title":
          return direction * a.title.localeCompare(b.title)
        case "status":
          return direction * a.status.localeCompare(b.status)
        case "date": {
          const diff = getTime(a.createdAt) - getTime(b.createdAt)
          return direction * diff
        }
        case "updated":
        default: {
          const diff = getTime(a.updatedAt ?? a.createdAt) - getTime(b.updatedAt ?? b.createdAt)
          return direction * diff
        }
      }
    })
  }, [listings, searchTerm, statusFilter, sortBy, sortOrder])

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Listings</h1>
          <p className="text-muted-foreground mt-2">View scraped job listings (sign in required)</p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sign in to view job listings.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Listings</h1>
          <p className="text-muted-foreground mt-2">All job listings discovered through scraping</p>
        </div>
        <Button onClick={() => addJobForm.setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Job
        </Button>
      </div>

      {/* Stats Overview - Clickable Pills */}
      {!loading && stats && (
        <div className="flex overflow-x-auto pb-2 sm:flex-wrap items-center gap-2 text-sm scrollbar-thin">
          <StatPill
            label="Total"
            value={stats.total}
            active={statusFilter === "all"}
            onClick={() => handleStatusFilterChange("all")}
          />
          <StatPill
            label="Pending"
            value={stats.pending}
            tone="gray"
            active={statusFilter === "pending"}
            onClick={() => handleStatusFilterChange("pending")}
          />
          <StatPill
            label="Analyzing"
            value={stats.analyzing}
            tone="blue"
            active={statusFilter === "analyzing"}
            onClick={() => handleStatusFilterChange("analyzing")}
          />
          <StatPill
            label="Analyzed"
            value={stats.analyzed}
            tone="green"
            active={statusFilter === "analyzed"}
            onClick={() => handleStatusFilterChange("analyzed")}
          />
          <StatPill
            label="Matched"
            value={stats.matched}
            tone="emerald"
            active={statusFilter === "matched"}
            onClick={() => handleStatusFilterChange("matched")}
          />
          <StatPill
            label="Skipped"
            value={stats.skipped}
            tone="red"
            active={statusFilter === "skipped"}
            onClick={() => handleStatusFilterChange("skipped")}
          />
        </div>
      )}

      {/* Listings Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Job Listings</CardTitle>
              <CardDescription>Click on a listing to view details</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search listings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full sm:w-[200px]"
              />
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated">Updated (newest)</SelectItem>
                    <SelectItem value="date">Created (newest)</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value) => handleSortOrderChange(value as "asc" | "desc")}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Desc</SelectItem>
                    <SelectItem value="asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="flex-1 sm:w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="analyzing">Analyzing</SelectItem>
                    <SelectItem value="analyzed">Analyzed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={handleSearch} className="flex-shrink-0">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <JobListingsTable
            listings={filteredListings}
            loading={loading}
            onRowClick={handleRowClick}
            onCompanyClick={handleCompanyClick}
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRequest.id} onOpenChange={(open) => !open && setDeleteRequest({ id: "", title: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteRequest.title ? `"${deleteRequest.title}"` : "this listing"} and associated
              analysis. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteRequest({ id: "", title: "" })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmingDelete}
              onClick={async () => {
                if (!deleteRequest.id) return
                setConfirmingDelete(true)
                try {
                  await deleteListing(deleteRequest.id)
                  closeModal()
                } catch (err) {
                  logger.error("JobListings", "deleteListing", "Failed to delete job listing", {
                    error: { type: "DeleteError", message: err instanceof Error ? err.message : String(err) },
                  })
                  throw err
                } finally {
                  setConfirmingDelete(false)
                  setDeleteRequest({ id: "", title: "" })
                }
              }}
            >
              {confirmingDelete ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Job Dialog */}
      <AddJobDialog
        open={addJobForm.isModalOpen}
        onOpenChange={addJobForm.setIsModalOpen}
        formState={addJobForm.formState}
        isSubmitting={addJobForm.isSubmitting}
        submitError={addJobForm.submitError}
        onFieldChange={addJobForm.setField}
        onSubmit={addJobForm.handleSubmit}
      />
    </div>
  )
}
