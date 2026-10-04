import { Badge } from '@/components/ui/badge'

export function DefaultLabel({ isDefault }: { isDefault: boolean }) {
  if (!isDefault) return null
  return (
    <Badge variant="outline" className="ml-1 border-neutral-200 bg-neutral-100 text-[11px] font-normal text-neutral-700">
      Default
    </Badge>
  )
}
