import { useEffect } from 'react'
import { KitchenSinkPage } from './components/KitchenSinkPage.tsx'
import { WizardShell } from './components/wizard/WizardShell.tsx'
import { decodeFromUrl } from './store/serialization.ts'
import { useStore } from './store/store.ts'

function LayoutToggle() {
  const layoutMode = useStore((s) => s.layoutMode)
  const setLayoutMode = useStore((s) => s.setLayoutMode)

  return (
    <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-sm">
      <button
        type="button"
        onClick={() => setLayoutMode('kitchen-sink')}
        className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
          layoutMode === 'kitchen-sink'
            ? 'bg-accent text-white shadow-sm'
            : 'text-muted hover:text-body'
        }`}
      >
        Kitchen Sink
      </button>
      <button
        type="button"
        onClick={() => setLayoutMode('wizard')}
        className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
          layoutMode === 'wizard'
            ? 'bg-accent text-white shadow-sm'
            : 'text-muted hover:text-body'
        }`}
      >
        Wizard
      </button>
    </div>
  )
}

function App() {
  const layoutMode = useStore((s) => s.layoutMode)

  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#config=')) {
      const result = decodeFromUrl(hash)
      if ('error' in result) {
        console.error('Failed to load config from URL:', result.error)
      } else {
        useStore.setState(result.state)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-slate-200 bg-card px-8 py-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-header">Piste Planner</h1>
        <LayoutToggle />
      </header>
      {layoutMode === 'wizard' ? <WizardShell /> : <KitchenSinkPage />}
    </div>
  )
}

export default App
