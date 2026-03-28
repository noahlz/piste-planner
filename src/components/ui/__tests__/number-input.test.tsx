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
})
