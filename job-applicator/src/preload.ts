import { contextBridge, ipcRenderer } from "electron"

export interface ElectronAPI {
  navigate: (url: string) => Promise<void>
  getUrl: () => Promise<string>
  fillForm: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  uploadResume: () => Promise<{ success: boolean; message: string }>
  submitJob: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
}

contextBridge.exposeInMainWorld("electronAPI", {
  navigate: (url: string) => ipcRenderer.invoke("navigate", url),
  getUrl: () => ipcRenderer.invoke("get-url"),
  fillForm: (provider: "claude" | "codex" | "gemini") => ipcRenderer.invoke("fill-form", provider),
  uploadResume: () => ipcRenderer.invoke("upload-resume"),
  submitJob: (provider: "claude" | "codex" | "gemini") => ipcRenderer.invoke("submit-job", provider),
} satisfies ElectronAPI)
