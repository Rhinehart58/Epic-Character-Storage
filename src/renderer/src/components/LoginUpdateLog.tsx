import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { UpdateLogPayload } from '@shared/update-log'
import bundledRaw from '../../../../update-log.json'
import feedRaw from '../../../../update-feed.config.json'
import { cn } from '../lib/utils'
import { backend } from '../lib/backend'

const POLL_MS = 5 * 60 * 1000
const POLL_MINUTES = Math.max(1, Math.round(POLL_MS / 60000))
const bundledUpdateLog = bundledRaw as UpdateLogPayload

type UpdateFeedConfig = { githubRepo?: string; branch?: string }

// Mirrors the App ColorScheme without importing from there to avoid a cycle.
type LogScheme =
  | 'default'
  | 'violet'
  | 'teal'
  | 'sunset'
  | 'wii'
  | 'ps3'
  | 'xbox360'
  | 'cube'
  | 'wiiu'
  | '3ds'
  | 'bee'

type Tone = {
  /** outer panel chrome */
  shell: string
  /** divider between header and body */
  divider: string
  /** small label text ("Update log") */
  caption: string
  /** big heading ("What's new") */
  heading: string
  /** version pill */
  versionPill: string
  /** refresh button */
  refreshBtn: string
  /** status / "last checked" muted text */
  muted: string
  /** entry card background */
  entryBg: string
  /** entry date label */
  entryDate: string
  /** entry title */
  entryTitle: string
  /** entry details paragraph */
  entryDetails: string
  /** footer "Log data updated …" */
  footer: string
}

const TONES: Record<LogScheme, Tone> = {
  // Default (light/dark): clean neutral panel that works on either app mode.
  default: {
    shell:
      'border border-slate-200/90 bg-slate-50/90 text-slate-900 shadow-sm backdrop-blur-md dark:border-slate-600/90 dark:bg-slate-900/85 dark:text-slate-100',
    divider: 'border-slate-200 dark:border-slate-700',
    caption: 'text-slate-500 dark:text-slate-400',
    heading: 'text-slate-900 dark:text-slate-50',
    versionPill: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    refreshBtn: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800',
    muted: 'text-slate-600 dark:text-slate-400',
    entryBg: 'bg-slate-50 text-slate-800 dark:bg-slate-800/70 dark:text-slate-100',
    entryDate: 'text-slate-500 dark:text-slate-400',
    entryTitle: 'text-slate-900 dark:text-slate-50',
    entryDetails: 'text-slate-700 dark:text-slate-200',
    footer: 'text-slate-500 dark:text-slate-400'
  },
  // Aero glass — light translucent panel, classic Vista feel.
  violet: {
    shell:
      'border border-cyan-200/75 bg-white/70 text-cyan-950 shadow-aero-card backdrop-blur-lg dark:border-teal-700/55 dark:bg-slate-900/75 dark:text-cyan-50',
    divider: 'border-cyan-200/65 dark:border-teal-700/55',
    caption: 'text-cyan-800/80 dark:text-cyan-200/85',
    heading: 'text-cyan-950 dark:text-cyan-50',
    versionPill: 'bg-cyan-100/80 text-cyan-900 dark:bg-cyan-900/55 dark:text-cyan-100',
    refreshBtn: 'border border-cyan-300/70 bg-white/85 text-cyan-900 hover:bg-white dark:border-cyan-500/35 dark:bg-slate-800/70 dark:text-cyan-100 dark:hover:bg-slate-800',
    muted: 'text-cyan-800/85 dark:text-cyan-200/85',
    entryBg: 'bg-white/65 text-cyan-950 dark:bg-slate-800/65 dark:text-cyan-50',
    entryDate: 'text-sky-700 dark:text-sky-300',
    entryTitle: 'text-cyan-950 dark:text-cyan-50',
    entryDetails: 'text-cyan-900/90 dark:text-cyan-100/90',
    footer: 'text-cyan-800/70 dark:text-cyan-200/70'
  },
  // Win98 chrome — beveled gray.
  teal: {
    shell: 'rounded-md border-2 border-black/35 bg-[#ece9d8] text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff,4px_4px_0_rgba(0,0,0,0.18)] dark:border-black/55 dark:bg-[#5a5a5a] dark:text-gray-100',
    divider: 'border-black/30 dark:border-black/55',
    caption: 'text-[#000080] dark:text-[#9ec1ff]',
    heading: 'text-gray-900 dark:text-gray-50',
    versionPill: 'bg-[#d4d0c8] text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] dark:bg-[#4a4a4a] dark:text-gray-100',
    refreshBtn: 'border border-black/40 bg-[#d4d0c8] text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] hover:bg-[#c8c4bc] dark:border-black/55 dark:bg-[#404040] dark:text-gray-100',
    muted: 'text-gray-700 dark:text-gray-300',
    entryBg: 'rounded-sm bg-white text-gray-900 shadow-[inset_1px_1px_0_#ffffff,inset_-1px_-1px_0_#808080] dark:bg-[#3a3a3a] dark:text-gray-100',
    entryDate: 'text-[#000080] dark:text-[#9ec1ff]',
    entryTitle: 'text-gray-900 dark:text-gray-50',
    entryDetails: 'text-gray-800 dark:text-gray-200',
    footer: 'text-gray-700 dark:text-gray-300'
  },
  // Y2K neon — high-contrast.
  sunset: {
    shell: 'border-2 border-pink-400/80 bg-white/85 text-indigo-950 shadow-[0_10px_36px_rgba(219,39,119,0.25)] backdrop-blur-md dark:border-fuchsia-500/55 dark:bg-slate-950/85 dark:text-slate-50',
    divider: 'border-pink-300/70 dark:border-fuchsia-500/40',
    caption: 'text-fuchsia-700 dark:text-fuchsia-300',
    heading: 'text-indigo-950 dark:text-slate-50',
    versionPill: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/55 dark:text-fuchsia-100',
    refreshBtn: 'border-2 border-pink-300 bg-white/90 text-indigo-950 hover:bg-white dark:border-fuchsia-500/45 dark:bg-slate-900/80 dark:text-fuchsia-100',
    muted: 'text-indigo-900/80 dark:text-slate-300',
    entryBg: 'bg-pink-50/85 text-indigo-950 dark:bg-slate-900/70 dark:text-slate-50',
    entryDate: 'text-fuchsia-700 dark:text-fuchsia-300',
    entryTitle: 'text-indigo-950 dark:text-slate-50',
    entryDetails: 'text-indigo-900/85 dark:text-slate-200',
    footer: 'text-indigo-800/70 dark:text-slate-400'
  },
  // Wii — silvery rounded glass.
  wii: {
    shell:
      'rounded-[1.5rem] border border-white/70 bg-white/75 text-gray-900 shadow-[0_18px_52px_rgba(15,23,42,0.07)] backdrop-blur-lg dark:border-gray-600/50 dark:bg-gray-800/80 dark:text-gray-50',
    divider: 'border-gray-300/70 dark:border-gray-600/55',
    caption: 'text-sky-700 dark:text-sky-300',
    heading: 'text-gray-900 dark:text-gray-50',
    versionPill: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100',
    refreshBtn: 'border border-gray-400/70 bg-white/85 text-gray-900 hover:bg-white dark:border-gray-600 dark:bg-gray-700/85 dark:text-gray-100',
    muted: 'text-gray-700 dark:text-gray-300',
    entryBg: 'bg-white/72 text-gray-900 shadow-sm dark:bg-gray-700/85 dark:text-gray-50',
    entryDate: 'text-sky-700 dark:text-sky-300',
    entryTitle: 'text-gray-900 dark:text-gray-50',
    entryDetails: 'text-gray-800 dark:text-gray-200',
    footer: 'text-gray-600 dark:text-gray-400'
  },
  // PS3 XMB — cool slate + cyan readout.
  ps3: {
    shell:
      'rounded-lg border border-slate-600/50 bg-slate-900/85 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_38px_rgba(0,0,0,0.42)] backdrop-blur-lg',
    divider: 'border-slate-600/55',
    caption: 'text-sky-300',
    heading: 'text-slate-50',
    versionPill: 'bg-slate-800 text-slate-100',
    refreshBtn: 'border border-slate-600/70 bg-slate-800/65 text-slate-100 hover:bg-slate-700/85',
    muted: 'text-slate-300',
    entryBg: 'bg-slate-800/70 text-slate-50',
    entryDate: 'text-sky-300',
    entryTitle: 'text-slate-50',
    entryDetails: 'text-slate-200',
    footer: 'text-slate-400'
  },
  // Xbox 360 NXE — charcoal + Xbox green accent.
  xbox360: {
    shell:
      'rounded-lg border border-zinc-700/60 bg-zinc-950/88 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_38px_rgba(0,0,0,0.5)] backdrop-blur-lg',
    divider: 'border-zinc-700/55',
    caption: 'text-lime-300',
    heading: 'text-zinc-50',
    versionPill: 'bg-zinc-900 text-lime-100',
    refreshBtn: 'border border-lime-700/50 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800/90',
    muted: 'text-zinc-400',
    entryBg: 'bg-zinc-900/75 text-zinc-50',
    entryDate: 'text-lime-300',
    entryTitle: 'text-zinc-50',
    entryDetails: 'text-zinc-200',
    footer: 'text-zinc-500'
  },
  // GameCube — indigo glass.
  cube: {
    shell: 'rounded-xl border border-indigo-300/65 bg-white/92 text-indigo-950 shadow-[0_14px_42px_rgba(30,64,175,0.14)] dark:border-indigo-400/45 dark:bg-slate-900/94 dark:text-slate-50',
    divider: 'border-indigo-200/70 dark:border-indigo-400/35',
    caption: 'text-indigo-700 dark:text-indigo-300',
    heading: 'text-indigo-950 dark:text-slate-50',
    versionPill: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/55 dark:text-indigo-100',
    refreshBtn: 'border border-indigo-300 bg-white/90 text-indigo-900 hover:bg-white dark:border-indigo-400/55 dark:bg-indigo-950/55 dark:text-indigo-100',
    muted: 'text-indigo-800/85 dark:text-slate-300',
    entryBg: 'bg-white/72 text-indigo-950 dark:bg-slate-800/75 dark:text-slate-50',
    entryDate: 'text-indigo-700 dark:text-indigo-300',
    entryTitle: 'text-indigo-950 dark:text-slate-50',
    entryDetails: 'text-indigo-900/90 dark:text-slate-200',
    footer: 'text-indigo-800/70 dark:text-slate-400'
  },
  // Wii U — cyan glass.
  wiiu: {
    shell: 'rounded-2xl border border-cyan-200/85 bg-white/94 text-cyan-900 shadow-[0_12px_36px_rgba(14,116,144,0.12)] dark:border-cyan-500/45 dark:bg-slate-900/94 dark:text-cyan-50',
    divider: 'border-cyan-200/75 dark:border-cyan-500/35',
    caption: 'text-cyan-700 dark:text-cyan-300',
    heading: 'text-cyan-950 dark:text-cyan-50',
    versionPill: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/55 dark:text-cyan-100',
    refreshBtn: 'border border-cyan-300/75 bg-white/90 text-cyan-900 hover:bg-white dark:border-cyan-500/45 dark:bg-cyan-950/45 dark:text-cyan-100',
    muted: 'text-cyan-800/85 dark:text-cyan-200/85',
    entryBg: 'bg-white/72 text-cyan-950 dark:bg-slate-800/75 dark:text-cyan-50',
    entryDate: 'text-cyan-700 dark:text-cyan-300',
    entryTitle: 'text-cyan-950 dark:text-cyan-50',
    entryDetails: 'text-cyan-900/90 dark:text-cyan-100/90',
    footer: 'text-cyan-800/70 dark:text-cyan-200/70'
  },
  // 3DS — rose plastic.
  '3ds': {
    shell: 'rounded-md border border-rose-300/80 bg-white/94 text-rose-950 shadow-[0_8px_22px_rgba(244,63,94,0.15)] dark:border-rose-500/45 dark:bg-zinc-900/92 dark:text-rose-50',
    divider: 'border-rose-200/75 dark:border-rose-500/35',
    caption: 'text-rose-700 dark:text-rose-300',
    heading: 'text-rose-950 dark:text-rose-50',
    versionPill: 'bg-rose-100 text-rose-900 dark:bg-rose-900/45 dark:text-rose-100',
    refreshBtn: 'border border-rose-300 bg-white/90 text-rose-900 hover:bg-white dark:border-rose-500/45 dark:bg-rose-950/45 dark:text-rose-100',
    muted: 'text-rose-800/85 dark:text-rose-200/85',
    entryBg: 'bg-white/72 text-rose-950 dark:bg-zinc-800/75 dark:text-rose-50',
    entryDate: 'text-rose-700 dark:text-rose-300',
    entryTitle: 'text-rose-950 dark:text-rose-50',
    entryDetails: 'text-rose-900/85 dark:text-rose-100/90',
    footer: 'text-rose-800/70 dark:text-rose-200/70'
  },
  // Honey bee — warm amber on deep comb.
  bee: {
    shell:
      'rounded-[1.35rem] border border-amber-400/80 bg-amber-50/95 text-amber-950 shadow-[0_10px_32px_rgba(245,158,11,0.22)] backdrop-blur-md dark:border-amber-500/45 dark:bg-zinc-950/92 dark:text-amber-50',
    divider: 'border-amber-300/80 dark:border-amber-600/40',
    caption: 'text-amber-800 dark:text-amber-200/90',
    heading: 'text-amber-950 dark:text-amber-50',
    versionPill: 'bg-amber-200/90 text-amber-950 dark:bg-amber-900/55 dark:text-amber-100',
    refreshBtn:
      'border border-amber-500/70 bg-white/90 text-amber-950 hover:bg-amber-50 dark:border-amber-500/50 dark:bg-zinc-900/80 dark:text-amber-100 dark:hover:bg-zinc-900',
    muted: 'text-amber-900/80 dark:text-amber-200/85',
    entryBg: 'bg-white/80 text-amber-950 dark:bg-zinc-900/75 dark:text-amber-50',
    entryDate: 'text-amber-800 dark:text-amber-300',
    entryTitle: 'text-amber-950 dark:text-amber-50',
    entryDetails: 'text-amber-900/90 dark:text-amber-100/90',
    footer: 'text-amber-800/75 dark:text-amber-300/75'
  }
}

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

export function LoginUpdateLog(props: { className?: string; colorScheme?: LogScheme | 'bionicle' }): JSX.Element {
  const { className, colorScheme: rawScheme = 'default' } = props
  const colorScheme: LogScheme = rawScheme === 'bionicle' ? 'default' : rawScheme
  const tone = TONES[colorScheme] ?? TONES.default
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
    void backend.appApi
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
    <div className={cn('flex max-h-[min(420px,calc(100vh-14rem))] min-h-0 flex-col p-4', tone.shell, className)}>
      <div className={cn('flex shrink-0 flex-wrap items-start justify-between gap-2 border-b pb-3', tone.divider)}>
        <div>
          <div className={cn('text-[10px] font-semibold uppercase tracking-[0.2em]', tone.caption)}>Update log</div>
          <div className={cn('mt-1 text-sm font-semibold', tone.heading)}>What&apos;s new</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {appVersion ? (
            <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10px]', tone.versionPill)}>v{appVersion}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={fetchStatus === 'loading'}
            className={cn(
              'ecs-interactive rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50',
              tone.refreshBtn
            )}
          >
            {fetchStatus === 'loading' ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>
      <p className={cn('mt-2 shrink-0 text-[11px] leading-relaxed', tone.muted)}>{statusLabel}</p>
      {lastFetchAt ? (
        <p className={cn('mt-1 shrink-0 text-[10px]', tone.footer)}>
          Last checked {lastFetchAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      ) : null}
      <ul className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-left">
        {payload.entries.map((entry) => (
          <li key={entry.id} className={cn('rounded-lg px-3 py-2', tone.entryBg)}>
            <div className={cn('text-[10px] font-medium uppercase tracking-wide', tone.entryDate)}>{entry.date}</div>
            <div className={cn('mt-0.5 text-sm font-semibold leading-snug', tone.entryTitle)}>{entry.title}</div>
            {entry.details ? (
              <p className={cn('mt-1 text-xs leading-relaxed', tone.entryDetails)}>{entry.details}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={cn('mt-3 shrink-0 text-[10px]', tone.footer)}>
        Log data updated {new Date(payload.updatedAt).toLocaleDateString()}
      </p>
    </div>
  )
}
