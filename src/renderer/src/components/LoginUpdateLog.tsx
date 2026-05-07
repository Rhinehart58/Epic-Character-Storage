import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { UpdateLogPayload } from '@shared/update-log'
import bundledRaw from '../../../../update-log.json'
import feedRaw from '../../../../update-feed.config.json'
import { cn } from '../lib/utils'

const POLL_MS = 5 * 60 * 1000
const POLL_MINUTES = Math.max(1, Math.round(POLL_MS / 60000))
const bundledUpdateLog = bundledRaw as UpdateLogPayload

type UpdateFeedConfig = { githubRepo?: string; branch?: string }

function githubRawUpdateLogUrl(config: UpdateFeedConfig): string {
  const repo = config.githubRepo?.trim()
  if (!repo) return ''
  const branch = (config.branch ?? 'main').trim() || 'main'
  return `https://raw.githubusercontent.com/${repo}/${branch}/update-log.json`
}

function parsePayload(raw: unknown): UpdateLogPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.updatedAt !== 'string' || !Array.isArray(o.entries)) return null
  const entries = o.entries.filter((row): row is UpdateLogPayload['entries'][number] => {
    if (!row || typeof row !== 'object') return false
    const e = row as Record<string, unknown>
    return typeof e.id === 'string' && typeof e.date === 'string' && typeof e.title === 'string'
  })
  return { updatedAt: o.updatedAt, entries }
}

async function fetchRemote(url: string): Promise<UpdateLogPayload | null> {
  const sep = url.includes('?') ? '&' : '?'
  const res = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return parsePayload(await res.json())
}

export function LoginUpdateLog(props: { className?: string }): JSX.Element {
  const { className } = props
  const [payload, setPayload] = useState<UpdateLogPayload>(() => parsePayload(bundledUpdateLog) ?? bundledUpdateLog)
  const [appVersion, setAppVersion] = useState<string>('')
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null)
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const remoteUrl =
    (import.meta.env.VITE_UPDATE_LOG_URL as string | undefined)?.trim() ||
    githubRawUpdateLogUrl(feedRaw as UpdateFeedConfig)

  const refresh = useCallback(async (): Promise<void> => {
    setFetchStatus('loading')
    let next = parsePayload(bundledUpdateLog) ?? bundledUpdateLog
    if (remoteUrl) {
      try {
        const remote = await fetchRemote(remoteUrl)
        if (remote) next = remote
        setFetchStatus('ok')
      } catch {
        setFetchStatus('error')
      }
    } else {
      setFetchStatus('ok')
    }
    setPayload(next)
    setLastFetchAt(new Date())
  }, [remoteUrl])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh])

  useEffect(() => {
    void window.appApi
      .getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => setAppVersion(''))
  }, [])

  const fromGithub = Boolean(remoteUrl?.includes('raw.githubusercontent.com'))

  const statusLabel =
    fetchStatus === 'loading'
      ? fromGithub
        ? 'Checking GitHub for updates…'
        : 'Checking for notes…'
      : fetchStatus === 'error'
        ? remoteUrl
          ? fromGithub
            ? 'Offline — showing bundled copy (GitHub unreachable)'
            : 'Offline — showing bundled copy (feed unreachable)'
          : 'Bundled log'
        : remoteUrl
          ? fromGithub
            ? `Live updates from GitHub — every ${POLL_MINUTES} min or when you return to this window`
            : `Live feed — every ${POLL_MINUTES} min or when you return to this window`
          : 'Bundled log — set githubRepo in update-feed.config.json or VITE_UPDATE_LOG_URL'

  return (
    <div
      className={cn(
        'flex max-h-[min(420px,calc(100vh-14rem))] min-h-0 flex-col rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md',
        className
      )}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-white/15 pb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Update log</div>
          <div className="mt-1 text-sm font-semibold text-white">What&apos;s new</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {appVersion ? (
            <span className="rounded-full bg-black/20 px-2 py-0.5 font-mono text-[10px] text-white/85">v{appVersion}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={fetchStatus === 'loading'}
            className="ecs-interactive rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 hover:bg-white/20 disabled:opacity-50"
          >
            {fetchStatus === 'loading' ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>
      <p className="mt-2 shrink-0 text-[11px] leading-relaxed text-white/75">{statusLabel}</p>
      {lastFetchAt ? (
        <p className="mt-1 shrink-0 text-[10px] text-white/55">
          Last checked {lastFetchAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      ) : null}
      <ul className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-left">
        {payload.entries.map((entry) => (
          <li key={entry.id} className="rounded-lg bg-black/15 px-3 py-2 text-white/95">
            <div className="text-[10px] font-medium uppercase tracking-wide text-violet-100/90">{entry.date}</div>
            <div className="mt-0.5 text-sm font-semibold leading-snug">{entry.title}</div>
            {entry.details ? <p className="mt-1 text-xs leading-relaxed text-white/80">{entry.details}</p> : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 shrink-0 text-[10px] text-white/50">
        Log data updated {new Date(payload.updatedAt).toLocaleDateString()}
      </p>
    </div>
  )
}
