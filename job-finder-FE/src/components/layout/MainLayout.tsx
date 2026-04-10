import { Outlet } from "react-router-dom"
import { Navigation } from "./Navigation"
import { Footer } from "./Footer"

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background/90 flex flex-col">
      <Navigation />
      <main className="mx-auto w-full max-w-7xl px-2 sm:px-4 lg:px-8 py-8 flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
