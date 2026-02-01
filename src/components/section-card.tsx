import type { ReactNode } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

export function SectionCard({
                              title,
                              description,
                              children,
                            }: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
