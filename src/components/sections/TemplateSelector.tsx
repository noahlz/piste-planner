import { useStore } from '../../store/store.ts'
import { TEMPLATES } from '../../engine/catalogue.ts'

const TEMPLATE_NAMES = Object.keys(TEMPLATES)

export function TemplateSelector() {
  const applyTemplate = useStore((s) => s.applyTemplate)

  return (
    <div className="rounded border border-border bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Template</h2>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="template-select">
          Apply Template
        </label>
        <select
          id="template-select"
          className="mt-1 w-full rounded border border-border px-2 py-1"
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
