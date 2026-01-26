// Preload script - must use CommonJS require() for Electron compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron")

import type { GenerationProgress, AgentOutputData, AgentStatusData } from "./types.js"
import type { IpcRendererEvent } from "electron"
import type { DraftContentResponse, ResumeContent, CoverLetterContent } from "@shared/types"

contextBridge.exposeInMainWorld("electronAPI", {
  // Logging - forwards to main process logger (logs to both console and file)
  log: {
    info: (...args: unknown[]) => ipcRenderer.send("renderer-log", "info", args),
    warn: (...args: unknown[]) => ipcRenderer.send("renderer-log", "warn", args),
    error: (...args: unknown[]) => ipcRenderer.send("renderer-log", "error", args),
    debug: (...args: unknown[]) => ipcRenderer.send("renderer-log", "debug", args),
  },

  // Authentication
  auth: {
    login: (): Promise<{ success: boolean; user?: { email: string; name?: string }; message?: string }> =>
      ipcRenderer.invoke("auth-login"),
    logout: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke("auth-logout"),
    getUser: (): Promise<{ authenticated: boolean; user?: { email: string; name?: string } }> =>
      ipcRenderer.invoke("auth-get-user"),
  },

  // Navigation
  navigate: (url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("navigate", url),
  getUrl: () => ipcRenderer.invoke("get-url"),
  goBack: (): Promise<{ success: boolean; canGoBack: boolean; message?: string }> =>
    ipcRenderer.invoke("go-back"),
  getNavigationState: (): Promise<{ url: string; canGoBack: boolean }> =>
    ipcRenderer.invoke("get-navigation-state"),

  // BrowserView control (for modal overlays)
  hideBrowserView: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("hide-browser-view"),
  showBrowserView: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("show-browser-view"),

  // Form Fill API (MCP-based)
  fillForm: (options: { jobMatchId: string; jobContext: string; resumeUrl?: string; coverLetterUrl?: string }) =>
    ipcRenderer.invoke("fill-form", options),
  stopFillForm: () => ipcRenderer.invoke("stop-fill-form"),
  sendAgentInput: (input: string) => ipcRenderer.invoke("send-agent-input", input),
  pauseAgent: () => ipcRenderer.invoke("pause-agent"),

  // Agent event listeners (used by form fill)
  onAgentOutput: (callback: (data: AgentOutputData) => void) => {
    const handler = (_event: IpcRendererEvent, data: AgentOutputData) => callback(data)
    ipcRenderer.on("agent-output", handler)
    return () => ipcRenderer.removeListener("agent-output", handler)
  },
  onAgentStatus: (callback: (data: AgentStatusData) => void) => {
    const handler = (_event: IpcRendererEvent, data: AgentStatusData) => callback(data)
    ipcRenderer.on("agent-status", handler)
    return () => ipcRenderer.removeListener("agent-status", handler)
  },

  // Browser URL change listener
  onBrowserUrlChanged: (callback: (data: { url: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { url: string }) => callback(data)
    ipcRenderer.on("browser-url-changed", handler)
    return () => ipcRenderer.removeListener("browser-url-changed", handler)
  },

  // File upload
  uploadResume: (options?: { documentUrl?: string; type?: "resume" | "coverLetter" }) =>
    ipcRenderer.invoke("upload-resume", options),

  // Job submission (uses Gemini API for extraction)
  submitJob: (provider: "gemini") => ipcRenderer.invoke("submit-job", provider),

  // CDP status
  getCdpStatus: () => ipcRenderer.invoke("get-cdp-status"),
  checkFileInput: () => ipcRenderer.invoke("check-file-input"),

  // Job matches
  getJobMatches: (options?: { limit?: number; status?: string }) =>
    ipcRenderer.invoke("get-job-matches", options),
  getJobMatch: (id: string) => ipcRenderer.invoke("get-job-match", id),
  findJobMatchByUrl: (url: string) => ipcRenderer.invoke("find-job-match-by-url", url),
  updateJobMatchStatus: (options: { id: string; status: "active" | "ignored" | "applied" }) =>
    ipcRenderer.invoke("update-job-match-status", options),

  // Documents
  getDocuments: (jobMatchId: string) => ipcRenderer.invoke("get-documents", jobMatchId),
  openDocument: (documentPath: string) => ipcRenderer.invoke("open-document", documentPath),
  startGeneration: (options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }) =>
    ipcRenderer.invoke("start-generation", options),
  runGeneration: (options: { jobMatchId: string; type: "resume" | "coverLetter" | "both" }) =>
    ipcRenderer.invoke("run-generation", options),

  // Event listeners for generation progress
  onGenerationProgress: (callback: (progress: GenerationProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: GenerationProgress) => callback(progress)
    ipcRenderer.on("generation-progress", handler)
    return () => ipcRenderer.removeListener("generation-progress", handler)
  },

  // Event listener for when generation needs review
  onGenerationAwaitingReview: (callback: (progress: GenerationProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: GenerationProgress) => callback(progress)
    ipcRenderer.on("generation-awaiting-review", handler)
    return () => ipcRenderer.removeListener("generation-awaiting-review", handler)
  },

  // Fetch draft content for review
  fetchDraftContent: (requestId: string): Promise<{ success: boolean; data?: DraftContentResponse; message?: string }> =>
    ipcRenderer.invoke("fetch-draft-content", requestId),

  // Submit document review
  submitDocumentReview: (options: {
    requestId: string
    documentType: "resume" | "coverLetter"
    content: ResumeContent | CoverLetterContent
  }): Promise<{ success: boolean; data?: GenerationProgress; message?: string }> =>
    ipcRenderer.invoke("submit-document-review", options),

  // Event listener for refresh job matches (triggered by global Ctrl+R shortcut)
  onRefreshJobMatches: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on("refresh-job-matches", handler)
    return () => ipcRenderer.removeListener("refresh-job-matches", handler)
  },
})
