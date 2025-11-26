import { createPortal } from "react-dom"
import { dismissToast, useToastStore, type ToastVariant } from "./toast-store"

const variantStyles: Record<ToastVariant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
}

const iconForVariant: Record<ToastVariant, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "⛔",
}

export const ToastViewport = () => {
  const { toasts } = useToastStore()

  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-50 flex max-w-sm flex-col gap-3">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex w-full flex-col gap-2 rounded-lg border shadow-lg transition hover:translate-y-[-1px] ${variantStyles[toast.variant]}`}
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3">
            <div className="flex gap-2">
              <span aria-hidden>{iconForVariant[toast.variant]}</span>
              <div className="flex flex-col">
                <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                {toast.description && (
                  <p className="mt-1 text-xs leading-snug text-inherit/80">{toast.description}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-full px-2 text-lg leading-none text-inherit transition hover:bg-black/5"
            >
              ×
            </button>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-b-lg bg-black/5">
            <span
              className="block h-full w-full origin-left animate-[toastShrink_6s_linear_forwards] bg-black/10"
              style={{ animationDuration: `${toast.duration}ms` }}
            />
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}

export default ToastViewport
