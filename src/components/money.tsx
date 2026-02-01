import { cn } from "@/lib/utils"
import { formatEUR } from "@/lib/money"

export function Money({
                        value,
                        className,
                      }: {
  value: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        value < 0 ? "text-destructive" : "text-success",
        className
      )}
    >
      {formatEUR(value)}
    </span>
  )
}
