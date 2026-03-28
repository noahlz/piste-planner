import { Badge } from '@/components/ui/badge'

export function DefaultLabel({ isDefault }: { isDefault: boolean }) {
  if (!isDefault) return null
  return (
    <Badge variant="outline" className="ml-1 text-xs font-normal text-muted-foreground">
      Default
    </Badge>
  )
}
