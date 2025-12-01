import { Button } from "@/components/ui/button"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  useFieldArray,
  useFormContext,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

// Lightweight checkbox row used across config tabs
export type CheckboxRowProps = {
  label: string
  description?: string
  field: { value?: boolean; onChange: (val: boolean) => void }
  info?: string
}

export const InfoTooltip = ({ content }: { content?: string }) => {
  if (!content) return null
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            tabIndex={0}
            className="h-4 w-4 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border flex items-center justify-center"
            aria-label="Field info"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function CheckboxRow({ label, description, info, field }: CheckboxRowProps) {
  return (
    <div className="flex items-center space-x-3">
      <Checkbox checked={Boolean(field.value)} onCheckedChange={(val) => field.onChange(Boolean(val))} />
      <div>
        <Label className="flex items-center gap-1">
          {label}
          <InfoTooltip content={info} />
        </Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  )
}

// Shared numeric input wired to RHF
export type NumericFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: string
  disabled?: boolean
  inputClassName?: string
  info?: string
}

export function NumericField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  inputClassName,
  info,
}: NumericFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1">
            {label}
            <InfoTooltip content={info} />
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              value={typeof field.value === "number" || typeof field.value === "string" ? field.value : ""}
              onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
              className={cn("max-w-[11rem]", inputClassName)}
              disabled={disabled}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Shared text input wired to RHF
export type TextInputFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: string
  disabled?: boolean
  info?: string
}

export function TextInputField<T extends FieldValues>({ control, name, label, description, disabled, info }: TextInputFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1">
            {label}
            <InfoTooltip content={info} />
          </FormLabel>
          <FormControl>
            <Input {...field} value={(field.value as string | undefined) ?? ""} disabled={disabled} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
        </FormItem>
      )}
    />
  )
}

// Reusable string list field for RHF arrays
export type StringListFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>
  name: ArrayPath<TFieldValues> | FieldPath<TFieldValues>
  label: string
  description?: string
  placeholder?: string
  helperError?: string
  info?: string
}

export function StringListField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  helperError,
  info,
}: StringListFieldProps<TFieldValues>) {
  const { register } = useFormContext<TFieldValues>()
  const { fields, append, remove } = useFieldArray({ control, name: name as ArrayPath<TFieldValues> })

  const emptyValue = "" as unknown as FieldArray<TFieldValues, ArrayPath<TFieldValues>>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1">
          {label}
          <InfoTooltip content={info} />
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={() => append(emptyValue)}>
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
          <Button type="button" variant="ghost" size="sm" onClick={() => append(emptyValue)}>
            Add first value
          </Button>
        )}
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {helperError ? <FormMessage>{helperError}</FormMessage> : null}
    </div>
  )
}
