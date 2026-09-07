import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select'

describe('Select group parts', () => {
  it('groups items under their labelled group', () => {
    render(
      <Select defaultOpen>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Tournaments</SelectLabel>
            <SelectItem value="t1">NAC Fall</SelectItem>
            <SelectItem value="t2">NAC Spring</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Templates</SelectLabel>
            <SelectItem value="p1">Default Template</SelectItem>
            <SelectItem value="p2">Compact Template</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    )

    expect(screen.getByText('Tournaments')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()

    const tournamentsGroup = screen.getByRole('group', { name: 'Tournaments' })
    expect(within(tournamentsGroup).getByText('NAC Fall')).toBeInTheDocument()
    expect(within(tournamentsGroup).getByText('NAC Spring')).toBeInTheDocument()
    expect(within(tournamentsGroup).queryByText('Default Template')).not.toBeInTheDocument()

    const templatesGroup = screen.getByRole('group', { name: 'Templates' })
    expect(within(templatesGroup).getByText('Default Template')).toBeInTheDocument()
    expect(within(templatesGroup).getByText('Compact Template')).toBeInTheDocument()
    expect(within(templatesGroup).queryByText('NAC Fall')).not.toBeInTheDocument()
  })
})
