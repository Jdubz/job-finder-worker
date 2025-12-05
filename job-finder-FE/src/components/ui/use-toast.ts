import { clearToasts, dismissToast, pushToast, type ToastOptions, type ToastVariant } from "../toast/toast-store"

type AllowedVariant = ToastVariant | "destructive"

type ToastInput = Omit<ToastOptions, "variant"> & { variant?: AllowedVariant }

const mapVariant = (variant?: AllowedVariant): ToastVariant => {
  if (variant === "destructive") return "error"
  return variant ?? "info"
}

export function useToast() {
  const toast = (options: ToastInput) => pushToast({ ...options, variant: mapVariant(options.variant) })

  return {
    toast,
    dismiss: dismissToast,
    clear: clearToasts
  }
}
