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

export interface GenerationStep {
  id: string
  name: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  duration?: number
  result?: {
    resumeUrl?: string
    coverLetterUrl?: string
  }
  error?: {
    message: string
    code?: string
  }
}

export interface GenerationProgress {
  requestId: string
  status: string
  steps: GenerationStep[]
  currentStep?: string
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
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
  uploadResume: (options?: {
    documentId?: string
    type?: "resume" | "coverLetter"
  }) => Promise<{ success: boolean; message: string; filePath?: string }>

  // Job submission
  submitJob: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>

  // Sidebar
  setSidebarState: (open: boolean) => Promise<void>
  getSidebarState: () => Promise<{ open: boolean }>

  // CDP status
  getCdpStatus: () => Promise<{ connected: boolean; message?: string }>

  // Job matches
  getJobMatches: (options?: { limit?: number; status?: string }) => Promise<{
    success: boolean
    data?: JobMatchListItem[]
    message?: string
  }>
  getJobMatch: (id: string) => Promise<{ success: boolean; data?: unknown; message?: string }>
  findJobMatchByUrl: (url: string) => Promise<{ success: boolean; data?: JobMatchListItem | null; message?: string }>
  updateJobMatchStatus: (options: {
    id: string
    status: "active" | "ignored" | "applied"
  }) => Promise<{ success: boolean; message?: string }>

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
  runGeneration: (options: {
    jobMatchId: string
    type: "resume" | "coverLetter" | "both"
  }) => Promise<{ success: boolean; data?: GenerationProgress; message?: string }>

  // Event listeners for generation progress
  onGenerationProgress: (callback: (progress: GenerationProgress) => void) => () => void
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
  uploadResume: (options?: { documentId?: string; type?: "resume" | "coverLetter" }) =>
    ipcRenderer.invoke("upload-resume", options),

  // Job submission
  submitJob: (provider: "claude" | "codex" | "gemini") => ipcRenderer.invoke("submit-job", provider),

  // Sidebar
  setSidebarState: (open: boolean) => ipcRenderer.invoke("set-sidebar-state", open),
  getSidebarState: () => ipcRenderer.invoke("get-sidebar-state"),

  // CDP status
  getCdpStatus: () => ipcRenderer.invoke("get-cdp-status"),

  // Job matches
  getJobMatches: (options?: { limit?: number; status?: string }) => ipcRenderer.invoke("get-job-matches", options),
  getJobMatch: (id: string) => ipcRenderer.invoke("get-job-match", id),
  findJobMatchByUrl: (url: string) => ipcRenderer.invoke("find-job-match-by-url", url),
  updateJobMatchStatus: (options: { id: string; status: "active" | "ignored" | "applied" }) =>
    ipcRenderer.invoke("update-job-match-status", options),

  // Documents
  getDocuments: (jobMatchId: string) => ipcRenderer.invoke("get-documents", jobMatchId),
  startGeneration: (options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }) =>
    ipcRenderer.invoke("start-generation", options),
  runGeneration: (options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }) =>
    ipcRenderer.invoke("run-generation", options),

  // Event listeners for generation progress
  onGenerationProgress: (callback: (progress: GenerationProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: GenerationProgress) => callback(progress)
    ipcRenderer.on("generation-progress", handler)
    // Return unsubscribe function
    return () => ipcRenderer.removeListener("generation-progress", handler)
  },
} satisfies ElectronAPI)
