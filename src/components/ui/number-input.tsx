import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /**
   * Treat an out-of-range typed entry as invalid on blur – restore the last
   * committed value instead of clamping to min/max and committing.
   */
  rejectOutOfRange?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  rejectOutOfRange = false,
  id,
  className,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value))

  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  function clamp(n: number): number {
    return Math.min(max, Math.max(min, n))
  }

  function handleDecrement() {
    const clamped = clamp(value - step)
    if (clamped !== value) onChange(clamped)
  }

  function handleIncrement() {
    const clamped = clamp(value + step)
    if (clamped !== value) onChange(clamped)
  }

  function handleBlur() {
    // Number over parseInt so "1e2" reads as 100, not 1. Number('') is 0, so
    // an emptied field needs its own guard to stay a revert.
    const trimmed = localValue.trim()
    const parsed = trimmed === '' ? NaN : Number(trimmed)
    // Non-numeric entries always revert. Reject mode also reverts out-of-range
    // and fractional entries – clamping or truncating would commit a value the
    // user never typed.
    if (
      isNaN(parsed) ||
      (rejectOutOfRange && (!Number.isInteger(parsed) || parsed < min || parsed > max))
    ) {
      setLocalValue(String(value))
      return
    }
    const committed = clamp(Math.trunc(parsed))
    if (committed !== value) onChange(committed)
    setLocalValue(String(committed))
  }

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label={ariaLabel ? `Decrease ${ariaLabel}` : 'Decrement'}
      >
        <Minus />
      </Button>
      <Input
        id={id}
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        min={min}
        max={max === Infinity ? undefined : max}
        className="h-6 w-14 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={ariaLabel}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={handleIncrement}
        disabled={value >= max}
        aria-label={ariaLabel ? `Increase ${ariaLabel}` : 'Increment'}
      >
        <Plus />
      </Button>
    </div>
  )
}
