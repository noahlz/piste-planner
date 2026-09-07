import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Injectable for tests; jsdom's location.reload cannot be stubbed directly. */
  onReload?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }

  handleReload = () => {
    const reload = this.props.onReload ?? (() => window.location.reload())
    reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-6 text-sm">
        <p>Something went wrong.</p>
        <p className="text-muted-foreground">{error.message}</p>
        <Button onClick={this.handleReload}>Reload</Button>
      </div>
    )
  }
}
