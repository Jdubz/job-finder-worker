// Preload script - must use CommonJS require() for Electron compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron")

import type { GenerationProgress } from "./types.js"

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
})
