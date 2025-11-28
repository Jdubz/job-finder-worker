import { GoogleLogin } from "@react-oauth/google"
import { useNavigate } from "react-router-dom"
import { ROUTES } from "@/types/routes"
import { useAuth } from "@/contexts/AuthContext"
import { useState } from "react"

export function LoginPage() {
  const navigate = useNavigate()
  const { loginWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSuccess = async (credential?: string | null) => {
    if (!credential) {
      setError("Missing credential from Google. Please try again.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await loginWithGoogle(credential)
      navigate(ROUTES.HOME)
    } catch (err: unknown) {
      console.error("Login error:", err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to sign in. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md space-y-8 p-8 border rounded-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Sign In</h1>
          <p className="text-muted-foreground mt-2">Sign in to access Job Finder</p>
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(response) => handleSuccess(response.credential)}
            onError={() => setError("Failed to sign in. Please try again.")}
            useOneTap={false}
            theme="outline"
            size="large"
            text="continue_with"
            shape="rectangular"
          />
        </div>

        {isLoading && (
          <div className="text-sm text-muted-foreground text-center">
            Signing in...
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded p-3 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
