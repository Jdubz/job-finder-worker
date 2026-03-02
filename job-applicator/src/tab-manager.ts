/**
 * Tab Manager
 *
 * Manages multiple BrowserView instances as browser tabs.
 * Only the active tab's view is attached to the window at a time.
 */

import { BrowserView } from "electron"
import type { BrowserWindow, Bounds } from "electron"
import { logger } from "./logger.js"
import { setBrowserView } from "./tool-executor.js"

// ============================================================================
// Types
// ============================================================================

export interface Tab {
  id: string
  browserView: BrowserView
  title: string
  url: string
}

export interface TabInfo {
  id: string
  title: string
  url: string
  active: boolean
}

export interface TabManagerOptions {
  mainWindow: BrowserWindow
  boundsCalculator: () => Bounds
  isOAuthPopup: (url: string) => boolean
  userAgent: string
  onTabsChanged: (tabs: TabInfo[]) => void
  onUrlChange: (data: { url: string; tabId: string }) => void
  setupOAuthProtection: (childWindow: Electron.BrowserWindow, details: { url: string }, parentView: BrowserView) => void
}

// ============================================================================
// TabManager
// ============================================================================

let nextTabId = 1

export class TabManager {
  private tabs: Tab[] = []
  private activeTabId: string | null = null
  private toolExecutorLocked = false
  private mainWindow: BrowserWindow
  private boundsCalculator: () => Bounds
  private isOAuthPopup: (url: string) => boolean
  private userAgent: string
  private onTabsChanged: (tabs: TabInfo[]) => void
  private onUrlChange: (data: { url: string; tabId: string }) => void
  private setupOAuthProtection: (childWindow: Electron.BrowserWindow, details: { url: string }, parentView: BrowserView) => void

  constructor(options: TabManagerOptions) {
    this.mainWindow = options.mainWindow
    this.boundsCalculator = options.boundsCalculator
    this.isOAuthPopup = options.isOAuthPopup
    this.userAgent = options.userAgent
    this.onTabsChanged = options.onTabsChanged
    this.onUrlChange = options.onUrlChange
    this.setupOAuthProtection = options.setupOAuthProtection
  }

  /**
   * Create a new tab and switch to it.
   */
  createTab(url?: string): Tab {
    const id = String(nextTabId++)
    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    view.webContents.session.setUserAgent(this.userAgent)

    const tab: Tab = {
      id,
      browserView: view,
      title: "New Tab",
      url: url || "about:blank",
    }

    // Listen for navigation events
    view.webContents.on("did-navigate", (_event, navUrl) => {
      tab.url = navUrl
      logger.info(`[Tab ${id}] Navigated to: ${navUrl}`)
      if (this.activeTabId === id) {
        this.onUrlChange({ url: navUrl, tabId: id })
      }
      this.fireTabsChanged()
    })

    view.webContents.on("did-navigate-in-page", (_event, navUrl) => {
      tab.url = navUrl
      logger.info(`[Tab ${id}] In-page navigation to: ${navUrl}`)
      if (this.activeTabId === id) {
        this.onUrlChange({ url: navUrl, tabId: id })
      }
      this.fireTabsChanged()
    })

    view.webContents.on("page-title-updated", (_event, title) => {
      tab.title = title
      this.fireTabsChanged()
    })

    // Handle new window requests — non-OAuth links open as tabs
    view.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
      // Block unsafe schemes
      try {
        const scheme = new URL(popupUrl).protocol
        if (!["http:", "https:", "about:"].includes(scheme)) {
          logger.warn(`[Tab ${id}] Blocking popup with unsafe scheme: ${popupUrl}`)
          return { action: "deny" as const }
        }
      } catch {
        // about:blank and empty URLs don't parse — allow them (common OAuth pattern)
        logger.info(`[Tab ${id}] Allowing popup (unparseable URL, likely OAuth): ${popupUrl}`)
        return { action: "allow" as const }
      }

      // Allow about:blank popups as real windows — OAuth flows commonly open
      // about:blank first, then redirect to the auth provider via JS.
      if (!popupUrl || popupUrl === "about:blank") {
        logger.info(`[Tab ${id}] Allowing about:blank popup (likely OAuth)`)
        return { action: "allow" as const }
      }

      if (this.isOAuthPopup(popupUrl)) {
        logger.info(`[Tab ${id}] Allowing OAuth popup: ${popupUrl}`)
        return { action: "allow" as const }
      }

      // Open as a new tab instead
      logger.info(`[Tab ${id}] Opening link in new tab: ${popupUrl}`)
      this.createTab(popupUrl)
      return { action: "deny" as const }
    })

    // Handle OAuth popup protection (for popups that were allowed)
    view.webContents.on("did-create-window", (childWindow, details) => {
      this.setupOAuthProtection(childWindow, details, view)
    })

    this.tabs.push(tab)
    this.switchTab(id)

    // Navigate if URL provided
    if (url && url !== "about:blank") {
      view.webContents.loadURL(url).catch((err) => {
        logger.error(`[Tab ${id}] Failed to load URL: ${err}`)
      })
    }

    return tab
  }

  /**
   * Close a tab by ID.
   */
  closeTab(id: string): void {
    const index = this.tabs.findIndex((t) => t.id === id)
    if (index === -1) return

    const tab = this.tabs[index]

    // If this is the last tab, create a new blank one first
    if (this.tabs.length === 1) {
      this.createTab()
      // createTab already switched to the new tab, now remove the old one
      const oldIndex = this.tabs.findIndex((t) => t.id === id)
      if (oldIndex !== -1) {
        this.tabs.splice(oldIndex, 1)
        this.destroyView(tab)
      }
      this.fireTabsChanged()
      return
    }

    // Remove from array
    this.tabs.splice(index, 1)

    // If we're closing the active tab, switch to an adjacent one
    if (this.activeTabId === id) {
      const newIndex = Math.min(index, this.tabs.length - 1)
      this.switchTab(this.tabs[newIndex].id)
    }

    this.destroyView(tab)
    this.fireTabsChanged()
  }

  /**
   * Switch to a tab by ID.
   */
  switchTab(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return

    // Remove old view from window
    if (this.activeTabId) {
      const oldTab = this.tabs.find((t) => t.id === this.activeTabId)
      if (oldTab) {
        try {
          this.mainWindow.removeBrowserView(oldTab.browserView)
        } catch {
          // View may already be removed
        }
      }
    }

    // Attach new view
    this.activeTabId = id
    this.mainWindow.setBrowserView(tab.browserView)
    tab.browserView.setAutoResize({ width: true, height: true })
    this.updateActiveBounds()

    // Update tool executor reference (unless locked during form fill)
    if (!this.toolExecutorLocked) {
      setBrowserView(tab.browserView)
    }

    // Notify renderer of URL change
    this.onUrlChange({ url: tab.url, tabId: id })
    this.fireTabsChanged()
  }

  /**
   * Update the bounds of the active tab's BrowserView.
   */
  updateActiveBounds(): void {
    const tab = this.getActiveTab()
    if (!tab) return
    tab.browserView.setBounds(this.boundsCalculator())
  }

  /**
   * Get the active tab's BrowserView.
   */
  getActiveView(): BrowserView | null {
    const tab = this.getActiveTab()
    return tab?.browserView ?? null
  }

  /**
   * Get the active tab.
   */
  getActiveTab(): Tab | null {
    if (!this.activeTabId) return null
    return this.tabs.find((t) => t.id === this.activeTabId) ?? null
  }

  /**
   * Get all tabs as TabInfo (for sending to renderer).
   */
  getTabInfos(): TabInfo[] {
    return this.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      active: t.id === this.activeTabId,
    }))
  }

  /**
   * Lock the tool executor so tab switches don't change its BrowserView reference.
   * Used during form fill to keep the agent on its original tab.
   */
  lockToolExecutor(): void {
    this.toolExecutorLocked = true
    logger.info("[TabManager] Tool executor locked")
  }

  /**
   * Unlock the tool executor and sync it to the current active tab.
   */
  unlockToolExecutor(): void {
    this.toolExecutorLocked = false
    const tab = this.getActiveTab()
    if (tab) {
      setBrowserView(tab.browserView)
    }
    logger.info("[TabManager] Tool executor unlocked")
  }

  /**
   * Switch to the next tab (wraps around).
   */
  nextTab(): void {
    if (this.tabs.length <= 1) return
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId)
    const nextIndex = (index + 1) % this.tabs.length
    this.switchTab(this.tabs[nextIndex].id)
  }

  /**
   * Switch to the previous tab (wraps around).
   */
  previousTab(): void {
    if (this.tabs.length <= 1) return
    const index = this.tabs.findIndex((t) => t.id === this.activeTabId)
    const prevIndex = (index - 1 + this.tabs.length) % this.tabs.length
    this.switchTab(this.tabs[prevIndex].id)
  }

  /**
   * Destroy all tabs (cleanup on window close).
   */
  destroyAll(): void {
    for (const tab of this.tabs) {
      this.destroyView(tab)
    }
    this.tabs = []
    this.activeTabId = null
    setBrowserView(null)
  }

  private destroyView(tab: Tab): void {
    try {
      this.mainWindow.removeBrowserView(tab.browserView)
    } catch {
      // View may already be removed
    }
    try {
      if (!tab.browserView.webContents.isDestroyed()) {
        tab.browserView.webContents.close()
      }
    } catch {
      // Already destroyed
    }
  }

  private fireTabsChanged(): void {
    this.onTabsChanged(this.getTabInfos())
  }
}
