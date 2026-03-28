import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LayoutTemplate } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { TEMPLATES } from '../../engine/catalogue.ts'

// "Blank" template is redundant — the reset button on Competition Selection handles clearing
const TEMPLATE_NAMES = Object.keys(TEMPLATES).filter((n) => n !== 'Blank')

export function TemplateSelector() {
  const applyTemplate = useStore((s) => s.applyTemplate)
  const [selected, setSelected] = useState('')

  function handleChange(value: string) {
    if (!value) return
    setSelected(value)
    applyTemplate(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LayoutTemplate className="h-5 w-5" />
          Template
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={selected}
          onValueChange={handleChange}
          className="flex-wrap"
        >
          {TEMPLATE_NAMES.map((name) => (
            <ToggleGroupItem key={name} value={name} className="text-xs">
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  )
}
