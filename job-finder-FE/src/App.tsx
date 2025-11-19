import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { router } from "@/router"

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App
