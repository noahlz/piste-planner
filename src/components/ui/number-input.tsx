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
  className?: string
  'aria-label'?: string
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
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
    const parsed = parseInt(localValue, 10)
    if (isNaN(parsed)) {
      setLocalValue(String(value))
      return
    }
    const clamped = clamp(parsed)
    onChange(clamped)
    setLocalValue(String(clamped))
  }

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label="Decrement"
      >
        <Minus />
      </Button>
      <Input
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
        aria-label="Increment"
      >
        <Plus />
      </Button>
    </div>
  )
}
