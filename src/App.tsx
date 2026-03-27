import { useEffect } from 'react'
import { KitchenSinkPage } from './components/KitchenSinkPage.tsx'
import { decodeFromUrl } from './store/serialization.ts'
import { useStore } from './store/store.ts'

function App() {
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
      <header className="border-b border-border bg-white px-8 py-4">
        <h1 className="text-2xl font-semibold text-slate-800">Piste Planner</h1>
      </header>
      <KitchenSinkPage />
    </div>
  )
}

export default App
