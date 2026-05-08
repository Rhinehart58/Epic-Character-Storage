import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

type PrefMap = Record<string, string>

function prefsPath(): string {
  return join(app.getPath('userData'), 'tactile-prefs.json')
}

function readPrefs(): PrefMap {
  try {
    const path = prefsPath()
    if (!existsSync(path)) return {}
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: PrefMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function writePrefs(data: PrefMap): void {
  writeFileSync(prefsPath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function getPrefs(keys: string[]): Record<string, string | null> {
  const all = readPrefs()
  const out: Record<string, string | null> = {}
  for (const key of keys) {
    out[key] = typeof all[key] === 'string' ? all[key] : null
  }
  return out
}

export function setPrefs(entries: Record<string, string | null>): { ok: true } {
  const next = readPrefs()
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === 'string') next[key] = value
    else delete next[key]
  }
  writePrefs(next)
  return { ok: true as const }
}
