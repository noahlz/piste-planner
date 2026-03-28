import { useEffect } from 'react'
import { KitchenSinkPage } from './components/KitchenSinkPage.tsx'
import { WizardShell } from './components/wizard/WizardShell.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, Wand2 } from 'lucide-react'
import { decodeFromUrl } from './store/serialization.ts'
import { useStore } from './store/store.ts'

function LayoutToggle() {
  const layoutMode = useStore((s) => s.layoutMode)
  const setLayoutMode = useStore((s) => s.setLayoutMode)

  return (
    <Tabs value={layoutMode} onValueChange={(v) => setLayoutMode(v as typeof layoutMode)}>
      <TabsList>
        <TabsTrigger value="kitchen-sink">
          <LayoutDashboard className="mr-1.5 h-4 w-4" />
          Single Page
        </TabsTrigger>
        <TabsTrigger value="wizard">
          <Wand2 className="mr-1.5 h-4 w-4" />
          Wizard
        </TabsTrigger>
      </TabsList>
    </Tabs>
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
        <h1 className="text-2xl font-semibold text-card-foreground">Piste Planner</h1>
        <LayoutToggle />
      </header>
      {layoutMode === 'wizard' ? <WizardShell /> : <KitchenSinkPage />}
    </div>
  )
}

export default App
