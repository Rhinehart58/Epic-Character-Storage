import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = {
  hasError: boolean
  error: Error | null
}

/**
 * Catches render/lifecycle errors in the tree below so the Electron window does not stay blank.
 * Standard React resilience pattern (class boundary — still the only supported API).
 */
export class EcsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Epic Character Storage] UI error boundary', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    const { error, hasError } = this.state
    if (hasError && error) {
      return (
        <div
          className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100"
          role="alert"
          aria-live="assertive"
        >
          <div className="mx-auto max-w-lg rounded-xl border border-rose-500/35 bg-slate-900/95 p-6 shadow-2xl">
            <h1 className="text-lg font-bold tracking-tight text-rose-100">Something broke in the UI</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              The app caught an unexpected error so you are not left with a blank window. Try reloading; if it keeps
              happening, note what you clicked last and report it.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                onClick={this.handleRetry}
              >
                Try again
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-400/60 bg-rose-950/50 px-4 py-2 text-sm font-semibold text-rose-50 hover:bg-rose-900/60"
                onClick={this.handleReload}
              >
                Reload app
              </button>
            </div>
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-700 bg-black/40 p-3 text-[11px] leading-snug text-slate-300">
                {error.stack ?? error.message}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
