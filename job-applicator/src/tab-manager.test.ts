import { describe, it, expect, vi, beforeEach } from "vitest"
import type { BrowserWindow, Bounds } from "electron"
import type { TabManagerOptions, TabInfo } from "./tab-manager.js"

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Track setBrowserView calls
const mockSetBrowserView = vi.fn()
vi.mock("./tool-executor.js", () => ({
  setBrowserView: (...args: unknown[]) => mockSetBrowserView(...args),
}))

// ============================================================================
// Helpers
// ============================================================================

function createMockWebContents() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    session: { setUserAgent: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    }),
    removeListener: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    getURL: vi.fn(() => "about:blank"),
    isDestroyed: vi.fn(() => false),
    close: vi.fn(),
    _emit: (event: string, ...args: unknown[]) => {
      for (const cb of listeners[event] || []) cb(...args)
    },
  }
}

// Override BrowserView constructor — must be a class/function for `new`
const mockViews: unknown[] = []
vi.mock("electron", () => ({
  BrowserView: class MockBrowserView {
    webContents: ReturnType<typeof createMockWebContents>
    setAutoResize = vi.fn()
    setBounds = vi.fn()
    getBounds = vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 }))
    constructor() {
      this.webContents = createMockWebContents()
      mockViews.push(this as unknown as BrowserView & { _webContents: ReturnType<typeof createMockWebContents> })
    }
  },
}))

// Import after mocks
const { TabManager } = await import("./tab-manager.js")

function createMockWindow() {
  return {
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 })),
    setBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow
}

function createTabManager(overrides: Partial<TabManagerOptions> = {}) {
  const mainWindow = createMockWindow()
  const onTabsChanged = vi.fn()
  const onUrlChange = vi.fn()
  const boundsCalculator = vi.fn(() => ({ x: 300, y: 92, width: 900, height: 708 }))

  const tm = new TabManager({
    mainWindow,
    boundsCalculator,
    isOAuthPopup: () => false,
    userAgent: "test-agent",
    onTabsChanged,
    onUrlChange,
    setupOAuthProtection: vi.fn(),
    ...overrides,
  })

  return { tm, mainWindow, onTabsChanged, onUrlChange, boundsCalculator }
}

// ============================================================================
// Tests
// ============================================================================

describe("TabManager", () => {
  beforeEach(() => {
    mockViews.length = 0
    mockSetBrowserView.mockClear()
  })

  describe("createTab", () => {
    it("creates a tab and sets it as active", () => {
      const { tm } = createTabManager()
      const tab = tm.createTab()

      expect(tab.id).toBeDefined()
      expect(tab.title).toBe("New Tab")
      expect(tm.getActiveView()).toBe(tab.browserView)
    })

    it("sets the user agent on the view", () => {
      const { tm } = createTabManager()
      const tab = tm.createTab()
      const wc = tab.browserView.webContents as unknown as ReturnType<typeof createMockWebContents>
      expect(wc.session.setUserAgent).toHaveBeenCalledWith("test-agent")
    })

    it("creates tab with URL and loads it", () => {
      const { tm } = createTabManager()
      const tab = tm.createTab("https://example.com")
      const wc = tab.browserView.webContents as unknown as ReturnType<typeof createMockWebContents>
      expect(wc.loadURL).toHaveBeenCalledWith("https://example.com")
    })

    it("fires onTabsChanged callback", () => {
      const { tm, onTabsChanged } = createTabManager()
      tm.createTab()
      expect(onTabsChanged).toHaveBeenCalled()
      const tabs: TabInfo[] = onTabsChanged.mock.calls[onTabsChanged.mock.calls.length - 1][0]
      expect(tabs).toHaveLength(1)
      expect(tabs[0].active).toBe(true)
    })

    it("sets tool executor to the new view", () => {
      const { tm } = createTabManager()
      const tab = tm.createTab()
      expect(mockSetBrowserView).toHaveBeenCalledWith(tab.browserView)
    })
  })

  describe("switchTab", () => {
    it("switches active tab and updates tool executor", () => {
      const { tm } = createTabManager()
      const tab1 = tm.createTab()
      const tab2 = tm.createTab()

      expect(tm.getActiveView()).toBe(tab2.browserView)

      tm.switchTab(tab1.id)
      expect(tm.getActiveView()).toBe(tab1.browserView)
      expect(mockSetBrowserView).toHaveBeenLastCalledWith(tab1.browserView)
    })

    it("fires onUrlChange for the switched-to tab", () => {
      const { tm, onUrlChange } = createTabManager()
      const tab1 = tm.createTab("https://a.com")
      tm.createTab("https://b.com")

      onUrlChange.mockClear()
      tm.switchTab(tab1.id)
      expect(onUrlChange).toHaveBeenCalledWith(expect.objectContaining({ tabId: tab1.id }))
    })

    it("does nothing for nonexistent tab id", () => {
      const { tm } = createTabManager()
      tm.createTab()
      const view = tm.getActiveView()
      tm.switchTab("nonexistent")
      expect(tm.getActiveView()).toBe(view)
    })
  })

  describe("closeTab", () => {
    it("closes a tab and switches to adjacent", () => {
      const { tm } = createTabManager()
      const tab1 = tm.createTab()
      const tab2 = tm.createTab()

      tm.closeTab(tab2.id)
      expect(tm.getActiveView()).toBe(tab1.browserView)
      expect(tm.getTabInfos()).toHaveLength(1)
    })

    it("creates new blank tab when closing the last one", () => {
      const { tm } = createTabManager()
      const tab1 = tm.createTab()

      tm.closeTab(tab1.id)
      const tabs = tm.getTabInfos()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].id).not.toBe(tab1.id)
    })

    it("does nothing for nonexistent tab id", () => {
      const { tm } = createTabManager()
      tm.createTab()
      const before = tm.getTabInfos().length
      tm.closeTab("nonexistent")
      expect(tm.getTabInfos()).toHaveLength(before)
    })
  })

  describe("tool executor lock", () => {
    it("lockToolExecutor prevents tab switch from updating tool executor", () => {
      const { tm } = createTabManager()
      const tab1 = tm.createTab()
      tm.createTab()

      tm.lockToolExecutor()
      mockSetBrowserView.mockClear()

      tm.switchTab(tab1.id)
      expect(tm.getActiveView()).toBe(tab1.browserView)
      expect(mockSetBrowserView).not.toHaveBeenCalled()
    })

    it("unlockToolExecutor syncs tool executor to current active tab", () => {
      const { tm } = createTabManager()
      const tab1 = tm.createTab()
      tm.createTab()

      tm.lockToolExecutor()
      tm.switchTab(tab1.id)
      mockSetBrowserView.mockClear()

      tm.unlockToolExecutor()
      expect(mockSetBrowserView).toHaveBeenCalledWith(tab1.browserView)
    })

    it("createTab during lock does not update tool executor", () => {
      const { tm } = createTabManager()
      tm.createTab()
      tm.lockToolExecutor()
      mockSetBrowserView.mockClear()

      tm.createTab()
      expect(mockSetBrowserView).not.toHaveBeenCalled()
    })
  })

  describe("nextTab / previousTab", () => {
    it("nextTab cycles forward and wraps around", () => {
      const { tm } = createTabManager()
      const tab1 = tm.createTab()
      tm.createTab()
      tm.createTab()

      // Currently on tab3 (last created)
      tm.nextTab() // wraps to tab1
      expect(tm.getActiveView()).toBe(tab1.browserView)
    })

    it("previousTab cycles backward and wraps around", () => {
      const { tm } = createTabManager()
      tm.createTab()
      tm.createTab()
      const tab3 = tm.createTab()

      tm.switchTab(tm.getTabInfos()[0].id) // go to tab1
      tm.previousTab() // wraps to tab3
      expect(tm.getActiveView()).toBe(tab3.browserView)
    })

    it("nextTab is a no-op with single tab", () => {
      const { tm } = createTabManager()
      const tab = tm.createTab()
      tm.nextTab()
      expect(tm.getActiveView()).toBe(tab.browserView)
    })
  })

  describe("getTabInfos", () => {
    it("returns correct tab info with active flag", () => {
      const { tm } = createTabManager()
      tm.createTab("https://a.com")
      const tab2 = tm.createTab("https://b.com")

      const infos = tm.getTabInfos()
      expect(infos).toHaveLength(2)
      expect(infos[0].active).toBe(false)
      expect(infos[1].active).toBe(true)
      expect(infos[1].id).toBe(tab2.id)
    })
  })

  describe("updateActiveBounds", () => {
    it("applies bounds from calculator to active view", () => {
      const { tm, boundsCalculator } = createTabManager()
      const tab = tm.createTab()

      const bounds: Bounds = { x: 300, y: 92, width: 900, height: 708 }
      boundsCalculator.mockReturnValue(bounds)

      tm.updateActiveBounds()
      expect(tab.browserView.setBounds).toHaveBeenCalledWith(bounds)
    })
  })

  describe("destroyAll", () => {
    it("clears all tabs and resets tool executor", () => {
      const { tm } = createTabManager()
      tm.createTab()
      tm.createTab()

      tm.destroyAll()
      expect(tm.getActiveView()).toBeNull()
      expect(tm.getTabInfos()).toHaveLength(0)
      expect(mockSetBrowserView).toHaveBeenLastCalledWith(null)
    })
  })
})
