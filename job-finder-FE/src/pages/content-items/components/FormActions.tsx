import React from "react"
import { Button } from "../../../components/ui/button"

interface FormActionsProps {
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
  isSubmitting?: boolean
  isDeleting?: boolean
}

export const FormActions: React.FC<FormActionsProps> = ({
  onCancel,
  onSave,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
}) => {
  return (
    <div className="flex gap-3 mt-4 pt-4 border-t">
      <Button
        type="button"
        onClick={onCancel}
        variant="outline"
        disabled={isSubmitting || isDeleting}
      >
        Cancel
      </Button>
      <Button type="button" onClick={onSave} disabled={isSubmitting || isDeleting}>
        {isSubmitting ? "Saving..." : "Save"}
      </Button>
      <Button
        type="button"
        onClick={onDelete}
        variant="destructive"
        disabled={isSubmitting || isDeleting}
        className="ml-auto"
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </Button>
    </div>
  )
}
