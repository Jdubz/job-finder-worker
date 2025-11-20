import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { LogOut, Shield, Info } from "lucide-react"
import { useState } from "react"
import { GoogleLogin } from "@react-oauth/google"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { user, isOwner, signOut, authenticateWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)

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
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={(response) => {
                    if (response.credential) {
                      authenticateWithGoogle(response.credential)
                      onOpenChange(false)
                      setError(null)
                    } else {
                      setError("Missing credential from Google. Please try again.")
                    }
                  }}
                  onError={() => setError("Failed to sign in. Please try again.")}
                  useOneTap={false}
                  size="large"
                  theme="outline"
                  text="continue_with"
                  shape="rectangular"
                />
              </div>

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
