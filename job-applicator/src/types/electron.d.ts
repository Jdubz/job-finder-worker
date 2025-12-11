declare module "electron" {
  export interface CommandLine {
    appendSwitch: (flag: string) => void
  }

  export interface App {
    disableHardwareAcceleration(): void
    commandLine: CommandLine
    whenReady(): Promise<void>
    on(event: string, listener: (...args: unknown[]) => void): void
    quit(): void
  }

  export interface Bounds {
    x: number
    y: number
    width: number
    height: number
  }

  export interface BrowserWindow {
    getBounds(): Bounds
    setBrowserView(view: BrowserView): void
    setAutoResize(options: { width?: boolean; height?: boolean }): void
    setBounds(bounds: Bounds): void
    loadFile(path: string): Promise<void>
    on(event: string, listener: (...args: unknown[]) => void): void
    webContents: WebContents
  }

  export interface BrowserWindowConstructor {
    new (options: unknown): BrowserWindow
  }

  export interface BrowserView {
    webContents: WebContents
    setAutoResize(options: { width?: boolean; height?: boolean }): void
    setBounds(bounds: Bounds): void
  }

  export interface BrowserViewConstructor {
    new (options: unknown): BrowserView
  }

  export interface IpcMainInvokeEvent {
    sender?: WebContents
  }

  export interface IpcMain {
    handle(channel: string, listener: (...args: unknown[]) => unknown): void
    on(channel: string, listener: (...args: unknown[]) => void): void
  }

  export interface GlobalShortcut {
    register(accelerator: string, callback: () => void): void
    unregisterAll(): void
  }

  export type Menu = unknown

  export interface MenuStatic {
    buildFromTemplate(template: unknown[]): Menu
    setApplicationMenu(menu: Menu): void
  }

  export interface ContextBridge {
    exposeInMainWorld: (key: string, api: unknown) => void
  }

  export interface IpcRendererEvent {
    sender?: unknown
  }

  export interface IpcRenderer {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
    removeListener: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void
  }

  export interface WebContentsDebugger {
    attach(protocolVersion: string): void
    detach(): void
    sendCommand(method: string, params: Record<string, unknown>): Promise<unknown>
  }

  export interface WebContents {
    debugger: WebContentsDebugger
    getURL(): string
    loadURL(url: string): Promise<void>
    executeJavaScript<T>(code: string): Promise<T>
    openDevTools(options?: unknown): void
    isDevToolsOpened(): boolean
    closeDevTools(): void
    setAutoResize(options: { width?: boolean; height?: boolean }): void
    setBounds(bounds: Bounds): void
  }

  export interface RenderProcessGoneDetails {
    reason?: string
  }

  export const app: App
  export const BrowserWindow: BrowserWindowConstructor
  export const BrowserView: BrowserViewConstructor
  export const ipcMain: IpcMain
  export const globalShortcut: GlobalShortcut
  export const Menu: MenuStatic
  export const contextBridge: ContextBridge
  export const ipcRenderer: IpcRenderer
}
