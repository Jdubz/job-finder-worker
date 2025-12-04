import { cn } from "@/lib/utils"

export type StatPillTone =
  | "default"
  | "gray"
  | "amber"
  | "blue"
  | "green"
  | "emerald"
  | "red"
  | "orange"
  | "purple"

export interface StatPillProps {
  label: string
  value: string | number
  tone?: StatPillTone
  active?: boolean
  onClick?: () => void
}

const toneClasses: Record<StatPillTone, string> = {
  default: "border-muted-foreground/20 text-muted-foreground hover:bg-muted/50",
  gray: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
  amber: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  blue: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
  green: "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  red: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  orange: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100",
  purple: "border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100",
}

export function StatPill({ label, value, tone = "default", active = false, onClick }: StatPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
        toneClasses[tone],
        active && "ring-2 ring-offset-1 ring-primary"
      )}
    >
      <span className="uppercase tracking-wide text-[11px]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </button>
  )
}
