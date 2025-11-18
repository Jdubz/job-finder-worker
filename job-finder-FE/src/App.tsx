import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { FirestoreProvider } from "@/contexts/FirestoreContext"
import { router } from "@/router"

function App() {
  return (
    <AuthProvider>
      <FirestoreProvider>
        <RouterProvider router={router} />
      </FirestoreProvider>
    </AuthProvider>
  )
}

export default App
