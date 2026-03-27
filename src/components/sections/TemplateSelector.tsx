import { useStore } from '../../store/store.ts'
import { TEMPLATES } from '../../engine/catalogue.ts'

const TEMPLATE_NAMES = Object.keys(TEMPLATES)

export function TemplateSelector() {
  const applyTemplate = useStore((s) => s.applyTemplate)

  return (
    <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-header">Template</h2>
      <div>
        <label className="block text-sm font-medium text-header" htmlFor="template-select">
          Apply Template
        </label>
        <select
          id="template-select"
          className="mt-1 w-full rounded-md border border-slate-200 bg-card px-3 py-1.5 text-sm text-body focus:ring-2 focus:ring-accent focus:border-accent focus:outline-none"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) applyTemplate(e.target.value)
          }}
        >
          <option value="" disabled>
            Select a template...
          </option>
          {TEMPLATE_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
