export function DefaultLabel({ isDefault }: { isDefault: boolean }) {
  if (!isDefault) return null
  return <span className="ml-1 text-xs text-muted">(Default)</span>
}
