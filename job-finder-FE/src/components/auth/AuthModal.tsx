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
import { LogOut, Shield, Info } from "lucide-react"
import { useState } from "react"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { user, isOwner, signOut } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true)
    setError(null)

    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      onOpenChange(false)
    } catch (err: unknown) {
      console.error("Sign in error:", err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to sign in. Please try again.")
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      onOpenChange(false)
    } catch (err: unknown) {
      console.error("Sign out error:", err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to sign out. Please try again.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Authentication
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
                      services. Your account helps us:
                    </p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Rate-limit requests appropriately</li>
                      <li>Protect against automated scraping</li>
                      <li>Provide a better, personalized experience</li>
                    </ul>
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
                  <div className="text-sm text-destructive bg-destructive/10 rounded p-3">
                    {error}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
