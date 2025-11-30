import { Button } from "@/components/ui/button"
import { FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  useFormContext,
  useFieldArray,
  type Control,
  type FieldValues,
  type ArrayPath,
  type FieldPath,
  type FieldArray,
} from "react-hook-form"
import { Plus, Trash2 } from "lucide-react"

type StringListFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>
  name: ArrayPath<TFieldValues> | FieldPath<TFieldValues>
  label: string
  description?: string
  placeholder?: string
  helperError?: string
}

export function StringListField<TFieldValues extends FieldValues>(props: StringListFieldProps<TFieldValues>) {
  const { control, name, label, description, placeholder, helperError } = props
  const { register } = useFormContext<TFieldValues>()
  const { fields, append, remove } = useFieldArray({ control, name: name as ArrayPath<TFieldValues> })

  const emptyValue = "" as unknown as FieldArray<TFieldValues, ArrayPath<TFieldValues>>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(emptyValue)}
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2">
            <Input
              {...register(`${String(name)}.${index}` as FieldPath<TFieldValues>)}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {fields.length === 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => append(emptyValue)}
          >
            Add first value
          </Button>
        )}
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {helperError ? <FormMessage>{helperError}</FormMessage> : null}
    </div>
  )
}
