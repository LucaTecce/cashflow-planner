"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ConfirmDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => Promise<void> | void
}

export function ConfirmDeleteDialog({
                                      open,
                                      onOpenChange,
                                      title = "Delete item?",
                                      description = "This action cannot be undone.",
                                      confirmLabel = "Delete",
                                      loading,
                                      onConfirm,
                                    }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void onConfirm()
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={loading}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
