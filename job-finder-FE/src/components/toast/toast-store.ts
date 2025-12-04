import { useEffect, useState } from "react"

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  id?: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

export interface Toast extends Required<Pick<ToastOptions, "title">> {
  id: string
  description?: string
  variant: ToastVariant
  duration: number
}

type Listener = (toasts: Toast[]) => void

const listeners = new Set<Listener>()
let state: Toast[] = []

const notify = () => {
  const snapshot = [...state]
  listeners.forEach(listener => listener(snapshot))
}

export const generateToastId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`)

export const dismissToast = (id: string) => {
  state = state.filter(toast => toast.id !== id)
  notify()
}

export const clearToasts = () => {
  state = []
  notify()
}

export const pushToast = (options: ToastOptions): string => {
  const id = options.id ?? generateToastId()
  const toast: Toast = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant ?? "info",
    duration: options.duration ?? 6000,
  }

  state = [...state, toast]
  notify()

  if (toast.duration !== Infinity) {
    window.setTimeout(() => dismissToast(id), toast.duration)
  }

  if (import.meta.env.DEV) {
    // Handy breadcrumb for debugging why toasts may not be showing
    // eslint-disable-next-line no-console
    console.info("[toast] pushed", { id, variant: toast.variant, title: toast.title })
  }

  return id
}

export const toast = {
  info: (opts: Omit<ToastOptions, "variant">) => pushToast({ ...opts, variant: "info" }),
  success: (opts: Omit<ToastOptions, "variant">) => pushToast({ ...opts, variant: "success" }),
  warning: (opts: Omit<ToastOptions, "variant">) => pushToast({ ...opts, variant: "warning" }),
  error: (opts: Omit<ToastOptions, "variant">) => pushToast({ ...opts, variant: "error" }),
}

export const subscribeToToasts = (listener: Listener) => {
  listeners.add(listener)
  listener(state)
  return () => {
    listeners.delete(listener)
  }
}

export const useToastStore = () => {
  const [toasts, setToasts] = useState<Toast[]>(state)

  useEffect(() => {
    const unsubscribe = subscribeToToasts(setToasts)
    return () => {
      unsubscribe()
    }
  }, [])

  return { toasts, dismissToast, clearToasts }
}

// Dev-only helpers so we can easily confirm the UI renderer is working
if (typeof window !== "undefined" && import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__toast = toast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).__showToast = (opts?: Partial<ToastOptions>) =>
    toast.info({
      title: "Toast debug",
      description: "If you see this, the viewport is rendering fine.",
      duration: 5000,
      ...opts,
    })
}
