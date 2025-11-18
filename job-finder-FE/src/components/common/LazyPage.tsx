import { Suspense } from "react"
import { PageLoader } from "./PageLoader"

export function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}
