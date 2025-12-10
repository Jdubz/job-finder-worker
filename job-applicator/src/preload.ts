import { contextBridge, ipcRenderer } from "electron"

// Types for job matches and documents
export interface JobMatchListItem {
  id: string
  matchScore: number
  status: "active" | "ignored" | "applied"
  listing: {
    id: string
    url: string
    title: string
    companyName: string
    location?: string
  }
}

export interface DocumentInfo {
  id: string
  generateType: "resume" | "coverLetter" | "both"
  status: "pending" | "processing" | "completed" | "failed"
  resumeUrl?: string
  coverLetterUrl?: string
  createdAt: string
  jobMatchId?: string
}

export interface FormFillSummary {
  totalFields: number
  filledCount: number
  skippedCount: number
  skippedFields: Array<{ label: string; reason: string }>
  duration: number
}

export interface ElectronAPI {
  // Navigation
  navigate: (url: string) => Promise<void>
  getUrl: () => Promise<string>

  // Form filling
  fillForm: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  fillFormEnhanced: (options: {
    provider: "claude" | "codex" | "gemini"
    jobMatchId?: string
    documentId?: string
  }) => Promise<{ success: boolean; data?: FormFillSummary; message?: string }>

  // File upload
  uploadResume: () => Promise<{ success: boolean; message: string }>

  // Job submission
  submitJob: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>

  // Sidebar
  setSidebarState: (open: boolean) => Promise<void>
  getSidebarState: () => Promise<{ open: boolean }>

  // Job matches
  getJobMatches: (options?: { limit?: number; status?: string }) => Promise<{
    success: boolean
    data?: JobMatchListItem[]
    message?: string
  }>
  getJobMatch: (id: string) => Promise<{ success: boolean; data?: unknown; message?: string }>

  // Documents
  getDocuments: (jobMatchId: string) => Promise<{
    success: boolean
    data?: DocumentInfo[]
    message?: string
  }>
  startGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; requestId?: string; message?: string }>
}

contextBridge.exposeInMainWorld("electronAPI", {
  // Navigation
  navigate: (url: string) => ipcRenderer.invoke("navigate", url),
  getUrl: () => ipcRenderer.invoke("get-url"),

  // Form filling
  fillForm: (provider: "claude" | "codex" | "gemini") => ipcRenderer.invoke("fill-form", provider),
  fillFormEnhanced: (options: { provider: "claude" | "codex" | "gemini"; jobMatchId?: string; documentId?: string }) =>
    ipcRenderer.invoke("fill-form-enhanced", options),

  // File upload
  uploadResume: () => ipcRenderer.invoke("upload-resume"),

  // Job submission
  submitJob: (provider: "claude" | "codex" | "gemini") => ipcRenderer.invoke("submit-job", provider),

  // Sidebar
  setSidebarState: (open: boolean) => ipcRenderer.invoke("set-sidebar-state", open),
  getSidebarState: () => ipcRenderer.invoke("get-sidebar-state"),

  // Job matches
  getJobMatches: (options?: { limit?: number; status?: string }) => ipcRenderer.invoke("get-job-matches", options),
  getJobMatch: (id: string) => ipcRenderer.invoke("get-job-match", id),

  // Documents
  getDocuments: (jobMatchId: string) => ipcRenderer.invoke("get-documents", jobMatchId),
  startGeneration: (options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }) =>
    ipcRenderer.invoke("start-generation", options),
} satisfies ElectronAPI)
