import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, X } from "lucide-react"

export type StringListEditorProps = {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  description?: string
  addTestId?: string
}

export function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  description,
  addTestId,
}: StringListEditorProps) {
  const [inputValue, setInputValue] = useState("")

  const handleAdd = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onChange([...values.filter((v) => v !== trimmed), trimmed])
    setInputValue("")
  }

  const handleRemove = (value: string) => {
    onChange(values.filter((v) => v !== value))
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Button size="sm" onClick={handleAdd} data-testid={addTestId}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {values.length > 0 ? (
          values.map((value) => (
            <Badge key={value} variant="secondary" className="pl-3 pr-1 py-1">
              {value}
              <button
                onClick={() => handleRemove(value)}
                className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>
    </div>
  )
}
