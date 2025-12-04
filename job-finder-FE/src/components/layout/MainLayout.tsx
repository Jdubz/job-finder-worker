import { Outlet } from "react-router-dom"
import { Navigation } from "./Navigation"
import { Footer } from "./Footer"

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background/90 flex flex-col">
      <Navigation />
      <main className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
