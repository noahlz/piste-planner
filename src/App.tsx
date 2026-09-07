import { useEffect, useRef } from 'react'
import { WorkbenchShell } from './components/workbench/WorkbenchShell.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
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
      <ErrorBoundary>
        <WorkbenchShell />
      </ErrorBoundary>
    </div>
  )
}

export default App
