const STORAGE_KEY = 'ecs_ui_copy_overrides'

export const UI_COPY_DEFAULTS = {
  'app.productTitle': 'Epic Character Storage',
  'app.productTagline':
    'Offline-first roster: personal vault, shared campaigns, and a battle board that never edits sheets behind your back.',
  'sidebar.charactersHeading': 'Characters',
  'sidebar.sharingHeading': 'Sharing & invites',
  'sidebar.guidedBlurb': 'Personal stays private; a shared campaign syncs the table.',
  'sidebar.searchPlaceholder': 'Search by name…',
  'sidebar.newCharacter': 'New character',
  'sidebar.emptyRoster': 'No characters yet. Click "New character" to start.',
  'sidebar.emptyFilter': 'No matches. Try a different search or faction.',
  'sidebar.battleDragHint': 'Drag into the battle board to add.',
  'activity.heading': 'Live activity',
  'activity.emptyBlurb':
    'Saves, encounter edits, and campaign joins from this app session show here (all windows on this device).',
  'workspace.home': 'Home',
  'workspace.sheet': 'Sheet',
  'workspace.battle': 'Battle',
  'workspace.campaignLabel': 'Campaign',
  'workspace.personalWorkspace': 'Personal workspace',
  'workspace.battleLockedHint': 'Select a campaign to unlock battle tracking.'
} as const

export type UiCopyKey = keyof typeof UI_COPY_DEFAULTS

export type UiCopyOverrides = Partial<Record<UiCopyKey, string>>

export function loadUiCopyOverrides(): UiCopyOverrides {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: UiCopyOverrides = {}
    for (const key of Object.keys(UI_COPY_DEFAULTS) as UiCopyKey[]) {
      const v = parsed[key]
      if (typeof v === 'string' && v.trim().length > 0) out[key] = v
    }
    return out
  } catch {
    return {}
  }
}

export function persistUiCopyOverrides(overrides: UiCopyOverrides): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // ignore quota / private mode
  }
}

export function clearUiCopyOverrides(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function resolveUiCopy(overrides: UiCopyOverrides, key: UiCopyKey): string {
  const o = overrides[key]
  if (typeof o === 'string' && o.trim().length > 0) return o
  return UI_COPY_DEFAULTS[key]
}
