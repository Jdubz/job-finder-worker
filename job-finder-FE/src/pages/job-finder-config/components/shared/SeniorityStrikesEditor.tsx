import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Plus, X } from "lucide-react"

export type SeniorityStrikesEditorProps = {
  strikes: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

export function SeniorityStrikesEditor({ strikes, onChange }: SeniorityStrikesEditorProps) {
  const [newPattern, setNewPattern] = useState("")
  const [newPoints, setNewPoints] = useState(1)
  const entries = Object.entries(strikes)

  const handleAdd = () => {
    if (!newPattern.trim()) return
    onChange({ ...strikes, [newPattern.trim()]: newPoints })
    setNewPattern("")
    setNewPoints(1)
  }

  const handleRemove = (pattern: string) => {
    const { [pattern]: _removed, ...rest } = strikes
    onChange(rest)
  }

  return (
    <div className="space-y-3">
      <Label>Seniority Strikes</Label>
      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-sm text-gray-500">No seniority strike patterns configured.</p>
        )}
        {entries.map(([pattern, points]) => (
          <div key={pattern} className="grid grid-cols-6 gap-2 items-center">
            <div className="col-span-3">
              <Input value={pattern} readOnly />
            </div>
            <Input
              type="number"
              min="0"
              value={points}
              onChange={(e) =>
                onChange({ ...strikes, [pattern]: parseInt(e.target.value) || 0 })
              }
            />
            <Button variant="ghost" size="icon" onClick={() => handleRemove(pattern)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-2 items-center">
        <Input
          className="col-span-3"
          placeholder="e.g., principal engineer"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Input
          type="number"
          min="0"
          value={newPoints}
          onChange={(e) => setNewPoints(parseInt(e.target.value) || 0)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Button size="sm" onClick={handleAdd} className="col-span-2">
          <Plus className="h-4 w-4 mr-1" />
          Add Pattern
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Adds strike points when the title contains the pattern (case-insensitive).
      </p>
    </div>
  )
}
