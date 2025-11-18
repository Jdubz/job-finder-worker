import { Outlet } from "react-router-dom"
import { Navigation } from "./Navigation"
import { Footer } from "./Footer"

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="container mx-auto px-4 py-8 flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
