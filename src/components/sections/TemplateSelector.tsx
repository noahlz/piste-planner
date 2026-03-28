import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LayoutTemplate } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { TEMPLATES } from '../../engine/catalogue.ts'

const TEMPLATE_NAMES = Object.keys(TEMPLATES)

export function TemplateSelector() {
  const applyTemplate = useStore((s) => s.applyTemplate)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LayoutTemplate className="h-5 w-5" />
          Template
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div>
          <Label htmlFor="template-select">Apply Template</Label>
          <Select onValueChange={(v) => applyTemplate(v)}>
            <SelectTrigger id="template-select" className="mt-1 w-full">
              <SelectValue placeholder="Select a template..." />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_NAMES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
