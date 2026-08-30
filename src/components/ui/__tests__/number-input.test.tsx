import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NumberInput } from '../number-input'

describe('NumberInput', () => {
  it('renders the current value', () => {
    render(<NumberInput value={5} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(5)
  })

  it('increments on plus click', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('decrements on minus click', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={0} />)
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('does not decrement below min', () => {
    const onChange = vi.fn()
    render(<NumberInput value={0} onChange={onChange} min={0} />)
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not increment above max', () => {
    const onChange = vi.fn()
    render(<NumberInput value={10} onChange={onChange} max={10} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps typed value to min/max on blur', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={0} max={10} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(10)
  })

  // review finding E: commitOnChange used to clamp-and-commit an out-of-range
  // typed value immediately, which then rewrote the field's text mid-keystroke
  // via the value-sync effect (e.g. typing "-1" into a min=0 field committed 0
  // and the field's text flipped to "0" before the user could finish typing).
  it('commits nothing and leaves the local text alone when a commitOnChange edit goes out of range', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={0} max={10} commitOnChange />)
    const input = screen.getByRole('spinbutton')

    fireEvent.change(input, { target: { value: '-1' } })

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(-1)

    // Blur still resolves it exactly as the non-commitOnChange path does today.
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(0)
  })
})
