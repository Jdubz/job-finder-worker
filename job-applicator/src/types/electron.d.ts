declare module "electron" {
  export const app: any
  export const BrowserWindow: any
  export type BrowserWindow = any
  export const BrowserView: any
  export type BrowserView = any
  export const ipcMain: any
  export type IpcMainInvokeEvent = any
  export const globalShortcut: any
  export const Menu: any
  export const contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => void
  }
  export type IpcRendererEvent = any
  export const ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => Promise<any>
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => void
    removeListener: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => void
  }

  export interface WebContents {
    debugger: any
    getURL(): string
    loadURL(url: string): Promise<void>
    executeJavaScript<T>(code: string): Promise<T>
    openDevTools(options?: unknown): void
    isDevToolsOpened(): boolean
    closeDevTools(): void
    setAutoResize(options: { width?: boolean; height?: boolean }): void
    setBounds(bounds: { x: number; y: number; width: number; height: number }): void
  }

  export interface RenderProcessGoneDetails {
    reason?: string
  }
}
