// Type declaration for the exposed API
interface ElectronAPI {
  navigate: (url: string) => Promise<void>
  getUrl: () => Promise<string>
  fillForm: (provider: "claude" | "codex" | "gemini") => Promise<{ success: boolean; message: string }>
  uploadResume: () => Promise<{ success: boolean; message: string }>
}

// Extend Window interface
const electronAPI = (window as unknown as { electronAPI: ElectronAPI }).electronAPI

// DOM elements
const urlInput = document.getElementById("urlInput") as HTMLInputElement
const goBtn = document.getElementById("goBtn") as HTMLButtonElement
const providerSelect = document.getElementById("providerSelect") as HTMLSelectElement
const fillBtn = document.getElementById("fillBtn") as HTMLButtonElement
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement
const statusEl = document.getElementById("status") as HTMLSpanElement

function setStatus(message: string, type: "success" | "error" | "loading" | "" = "") {
  statusEl.textContent = message
  statusEl.className = "status" + (type ? ` ${type}` : "")
}

function setButtonsEnabled(enabled: boolean) {
  goBtn.disabled = !enabled
  fillBtn.disabled = !enabled
  uploadBtn.disabled = !enabled
}

// Navigate to URL
async function navigate() {
  const url = urlInput.value.trim()
  if (!url) {
    setStatus("Enter a URL", "error")
    return
  }

  // Add https:// if no protocol
  const fullUrl = url.startsWith("http") ? url : `https://${url}`

  try {
    setButtonsEnabled(false)
    setStatus("Loading...", "loading")
    await electronAPI.navigate(fullUrl)
    setStatus("Page loaded", "success")
  } catch (err) {
    setStatus(`Navigation failed: ${err}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Fill form with AI
async function fillForm() {
  const provider = providerSelect.value as "claude" | "codex" | "gemini"

  try {
    setButtonsEnabled(false)
    setStatus(`Filling form with ${provider}...`, "loading")
    const result = await electronAPI.fillForm(provider)

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      setStatus(result.message, "error")
    }
  } catch (err) {
    setStatus(`Fill failed: ${err}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Upload resume
async function uploadResume() {
  try {
    setButtonsEnabled(false)
    setStatus("Uploading resume...", "loading")
    const result = await electronAPI.uploadResume()

    if (result.success) {
      setStatus(result.message, "success")
    } else {
      setStatus(result.message, "error")
    }
  } catch (err) {
    setStatus(`Upload failed: ${err}`, "error")
  } finally {
    setButtonsEnabled(true)
  }
}

// Event listeners
goBtn.addEventListener("click", navigate)

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    navigate()
  }
})

fillBtn.addEventListener("click", fillForm)
uploadBtn.addEventListener("click", uploadResume)

// Initialize
setStatus("Ready")
