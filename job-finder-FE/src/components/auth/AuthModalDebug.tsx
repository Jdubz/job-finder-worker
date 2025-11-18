// @ts-nocheck
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth"
import { auth } from "@/config/firebase"
import { LogOut, Shield, Info, AlertTriangle } from "lucide-react"
import { useState, useEffect } from "react"
import { logger } from "@/services/logging"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthModalDebug({ open, onOpenChange }: AuthModalProps) {
  const { user, isOwner, signOut } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  // Show debug mode in development and staging, but NOT in production
  const isDebugMode = import.meta.env.VITE_ENVIRONMENT !== "production"

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0]
    const logMessage = `[${timestamp}] ${message}`

    // Log to structured logger
    logger.debug("database", "processing", `Auth Debug: ${message}`)

    // Also add to debug info for UI display
    setDebugInfo((prev) => [...prev, logMessage])
  }

  useEffect(() => {
    if (open) {
      addDebugLog("Auth modal opened")
      addDebugLog(`Firebase Project: ${import.meta.env.VITE_FIREBASE_PROJECT_ID}`)
      addDebugLog(`Auth Domain: ${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}`)
      addDebugLog(`Environment: ${import.meta.env.VITE_ENVIRONMENT || "development"}`)
      addDebugLog(`Current URL: ${window.location.href}`)
      addDebugLog(`User signed in: ${!!user}`)
    }
  }, [open, user])

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true)
    setError(null)
    setDebugInfo([]) // Clear previous logs

    try {
      addDebugLog("Starting Google sign-in...")

      const provider = new GoogleAuthProvider()
      addDebugLog("GoogleAuthProvider created")

      // Add custom parameters for better debugging
      provider.setCustomParameters({
        prompt: "select_account",
        // hd: 'yourdomain.com' // Uncomment to restrict to specific domain
      })
      addDebugLog("Provider configured with custom parameters")

      addDebugLog("Opening popup...")
      const result = await signInWithPopup(auth, provider)

      addDebugLog(`✅ Sign-in successful!`)
      addDebugLog(`User: ${result.user.email}`)
      addDebugLog(`UID: ${result.user.uid}`)

      // Get the credential
      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential) {
        addDebugLog(`Token acquired: ${credential.accessToken ? "Yes" : "No"}`)
      }

      onOpenChange(false)
    } catch (err: unknown) {
      addDebugLog(`❌ Sign-in failed!`)

      if (err instanceof Error) {
        addDebugLog(`Error name: ${err.name}`)
        addDebugLog(`Error message: ${err.message}`)

        // Parse Firebase error codes
        const errorCode = (err as { code?: string }).code
        if (errorCode) {
          addDebugLog(`Firebase error code: ${errorCode}`)

          // Provide user-friendly error messages
          let userMessage = err.message
          switch (errorCode) {
            case "auth/popup-blocked":
              userMessage = "Popup was blocked. Please allow popups for this site."
              addDebugLog("💡 Solution: Enable popups in browser settings")
              break
            case "auth/popup-closed-by-user":
              userMessage = "Sign-in was cancelled."
              addDebugLog("User closed the popup window")
              break
            case "auth/unauthorized-domain":
              userMessage = `Domain not authorized. Current domain: ${window.location.hostname}`
              addDebugLog(
                `💡 Solution: Add ${window.location.hostname} to Firebase Console → Authentication → Settings → Authorized domains`
              )
              break
            case "auth/operation-not-allowed":
              userMessage = "Google sign-in is not enabled. Please contact administrator."
              addDebugLog(
                "💡 Solution: Enable Google provider in Firebase Console → Authentication → Sign-in method"
              )
              break
            case "auth/network-request-failed":
              userMessage = "Network error. Please check your internet connection."
              addDebugLog("💡 Check: Internet connection, Firebase status, CORS settings")
              break
            case "auth/internal-error":
              userMessage = "Internal error. This might be a configuration issue."
              addDebugLog("💡 Check: Firebase configuration, API keys, authorized domains")
              break
            default:
              addDebugLog(`Unhandled error code: ${errorCode}`)
          }
          setError(userMessage)
        } else {
          setError(err.message)
        }
      } else {
        addDebugLog(`Unknown error type: ${typeof err}`)
        setError("An unexpected error occurred. Please try again.")
      }

      // Log the full error object for debugging
      console.error("Full error object:", err)
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      addDebugLog("Signing out...")
      await signOut()
      addDebugLog("✅ Sign-out successful")
      onOpenChange(false)
    } catch (err: unknown) {
      addDebugLog("❌ Sign-out failed")
      console.error("Sign out error:", err)
      if (err instanceof Error) {
        addDebugLog(`Error: ${err.message}`)
        setError(err.message)
      } else {
        setError("Failed to sign out. Please try again.")
      }
    }
  }

  const copyDebugInfo = () => {
    const debugText = debugInfo.join("\n")
    navigator.clipboard.writeText(debugText)
    addDebugLog("Debug info copied to clipboard")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Authentication {isDebugMode && "(Debug Mode)"}
          </DialogTitle>
          <DialogDescription>
            {user ? "Manage your account" : "Sign in to get started"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!user ? (
            <>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium mb-1">Why authentication?</p>
                    <p>
                      We use Google authentication to prevent abuse and ensure fair access to our
                      services.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full"
                  size="lg"
                >
                  {isSigningIn ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Sign in with Google
                    </>
                  )}
                </Button>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive flex-shrink-0" />
                      <div className="text-sm text-destructive flex-1">
                        <p className="font-medium">Sign-in failed</p>
                        <p className="mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="text-sm">
                  <p className="font-medium mb-1">Signed in as:</p>
                  <p className="text-muted-foreground">{user.email}</p>
                  <p className="text-muted-foreground mt-2">
                    Role: <span className="font-medium">{isOwner ? "Owner" : "Viewer"}</span>
                  </p>
                </div>
              </div>

              {!isOwner && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                  <Info className="w-4 h-4 inline mr-1" />
                  You have viewer access. Contact an administrator for editor permissions.
                </div>
              )}

              <Button onClick={handleSignOut} variant="outline" className="w-full" size="lg">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded p-3">
                  {error}
                </div>
              )}
            </>
          )}

          {/* Debug Info Section */}
          {isDebugMode && debugInfo.length > 0 && (
            <div className="bg-slate-900 text-slate-100 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-mono font-semibold">Debug Log</p>
                <Button onClick={copyDebugInfo} variant="ghost" size="sm" className="h-6 text-xs">
                  Copy
                </Button>
              </div>
              <div className="text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
                {debugInfo.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Environment Info */}
          {isDebugMode && (
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold text-blue-900 dark:text-blue-100">Environment Info</p>
              <div className="text-blue-800 dark:text-blue-200 space-y-0.5 font-mono">
                <p>Project: {import.meta.env.VITE_FIREBASE_PROJECT_ID}</p>
                <p>Auth Domain: {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}</p>
                <p>Environment: {import.meta.env.VITE_ENVIRONMENT || "development"}</p>
                <p>Current Domain: {window.location.hostname}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
