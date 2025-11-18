import React from "react"
import { Label } from "../../../components/ui/label"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"

interface FormFieldProps {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  type?: "text" | "textarea" | "month" | "url" | "email"
  required?: boolean
  placeholder?: string
  rows?: number
  className?: string
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  rows = 4,
  className,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className={className}>
      <Label htmlFor={name} className="mb-2 block">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {type === "textarea" ? (
        <Textarea
          id={name}
          name={name}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={rows}
          required={required}
          className="w-full"
        />
      ) : (
        <Input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          className="w-full"
        />
      )}
    </div>
  )
}
