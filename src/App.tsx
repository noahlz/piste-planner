import { useEffect, useRef } from 'react'
import { WorkbenchShell } from './components/workbench/WorkbenchShell.tsx'
import { bootstrap } from './store/boot.ts'

function App() {
  const booted = useRef(false)

  // StrictMode invokes mount effects twice in development. Booting twice would
  // re-apply the preset over a shared link's state, so the ref gates it.
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    bootstrap()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between bg-slate-800 px-8 py-3 shadow-md">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold italic text-white">Piste Planner 🤺</h1>
          <span className="rounded-full bg-orange-500 px-3 py-0.5 text-xs font-semibold text-white">Work in Progress!</span>
        </div>
      </header>
      <WorkbenchShell />
    </div>
  )
}

export default App
