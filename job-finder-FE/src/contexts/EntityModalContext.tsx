/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type { Company, JobListingRecord, JobMatchWithListing, JobSource, QueueItem } from "@shared/types"
import { EntityModalHost } from "@/components/modals/EntityModalHost"

export type EntityModalDescriptor =
  | { type: "company"; company?: Company | null; companyId?: string | null }
  | {
      type: "jobListing"
      listing: JobListingRecord
      onDelete?: (id: string) => void | Promise<void>
      onResubmit?: (id: string) => void | Promise<void>
    }
  | {
      type: "jobMatch"
      match: JobMatchWithListing
      onGenerateResume?: (match: JobMatchWithListing) => void
    }
  | {
      type: "jobSource"
      source: JobSource
      onToggleStatus?: (source: JobSource) => void | Promise<void>
      onDelete?: (id: string) => void | Promise<void>
    }
  | {
      type: "jobQueueItem"
      item: QueueItem
      onCancel?: (item: QueueItem) => void | Promise<void>
    }

interface EntityModalContextValue {
  modal: EntityModalDescriptor | null
  openModal: (descriptor: EntityModalDescriptor) => void
  closeModal: () => void
}

const EntityModalContext = createContext<EntityModalContextValue | undefined>(undefined)

export function EntityModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<EntityModalDescriptor | null>(null)

  const openModal = useCallback((descriptor: EntityModalDescriptor) => {
    setModal(descriptor)
  }, [])

  const closeModal = useCallback(() => setModal(null), [])

  const value = useMemo(() => ({ modal, openModal, closeModal }), [modal, openModal, closeModal])

  return (
    <EntityModalContext.Provider value={value}>
      {children}
      <EntityModalHost />
    </EntityModalContext.Provider>
  )
}

export function useEntityModal() {
  const ctx = useContext(EntityModalContext)
  if (!ctx) {
    throw new Error("useEntityModal must be used within an EntityModalProvider")
  }
  return ctx
}
