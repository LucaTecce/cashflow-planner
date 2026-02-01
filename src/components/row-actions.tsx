"use client"

import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type RowActionsProps<T> = {
  row: T
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  editLabel?: string
  deleteLabel?: string
}

export function RowActions<T>({
                                row,
                                onEdit,
                                onDelete,
                                editLabel = "Edit",
                                deleteLabel = "Delete",
                              }: RowActionsProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem onClick={() => onEdit?.(row)} disabled={!onEdit}>
          {editLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete?.(row)}
          className="text-destructive focus:text-destructive"
          disabled={!onDelete}
        >
          {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
