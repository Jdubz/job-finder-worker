const TOKEN_KEY = "jobfinder.authToken"
let memoryToken: string | null = null

const getStorage = () => (typeof window !== "undefined" ? window.localStorage : null)

export function storeAuthToken(token: string) {
  memoryToken = token
  const storage = getStorage()
  if (storage) {
    storage.setItem(TOKEN_KEY, token)
  }
}

export function getStoredAuthToken(): string | null {
  const storage = getStorage()
  if (storage) {
    const stored = storage.getItem(TOKEN_KEY)
    if (stored) {
      memoryToken = stored
      return stored
    }
  }
  return memoryToken
}

export function clearStoredAuthToken() {
  memoryToken = null
  const storage = getStorage()
  if (storage) {
    storage.removeItem(TOKEN_KEY)
  }
}
