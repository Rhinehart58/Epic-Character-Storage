const STORAGE_KEY = 'ecs_ui_copy_overrides'

/**
 * Storage key fired on the `storage` event when overrides change in another window.
 * Exported so the App can scope its cross-window sync listener tightly.
 */
export const UI_COPY_STORAGE_KEY = STORAGE_KEY

export const UI_COPY_DEFAULTS = {
  'app.productTitle': 'Tactile',
  'app.productTagline':
    'Tactile is your offline-first command space for roster management, shared parties, and a live board that never rewrites sheets behind your back.',
  'sidebar.charactersHeading': 'Roster',
  'sidebar.sharingHeading': 'Parties & links',
  'sidebar.guidedBlurb': 'Private by default; join a party to sync the table.',
  'sidebar.searchPlaceholder': 'Search by name…',
  'sidebar.newCharacter': 'New profile',
  'sidebar.emptyRoster': 'No profiles yet. Click "New profile" to start.',
  'sidebar.emptyFilter': 'No matches. Try a different search or faction.',
  'sidebar.battleDragHint': 'Drag into the battle board to add.',
  'activity.heading': 'Session feed',
  'activity.emptyBlurb':
    'Saves, encounter edits, and campaign joins from this app session show here (all windows on this device).',
  'workspace.home': 'Hub',
  'workspace.sheet': 'Sheets',
  'workspace.battle': 'Board',
  'workspace.campaignLabel': 'Party',
  'workspace.personalWorkspace': 'Personal vault',
  'workspace.battleLockedHint': 'Select a party to unlock the board.'
} as const

export type UiCopyKey = keyof typeof UI_COPY_DEFAULTS

export type UiCopyOverrides = Partial<Record<UiCopyKey, string>>

export type UiCopyGroupId = 'header' | 'sidebar' | 'activity' | 'workspace'

export type UiCopyMeta = {
  group: UiCopyGroupId
  /** Short human label shown above the input. */
  label: string
  /** Plain-language hint describing where this string appears. */
  description: string
  /** Render a multiline textarea instead of a single-line input. Auto-detected when omitted. */
  multiline?: boolean
}

export const UI_COPY_GROUPS: { id: UiCopyGroupId; title: string; blurb: string }[] = [
  {
    id: 'header',
    title: 'App header',
    blurb: 'Title and tagline shown at the top of the workspace.'
  },
  {
    id: 'sidebar',
    title: 'Character sidebar',
    blurb: 'Roster column on the left: headings, search, empty states.'
  },
  {
    id: 'activity',
    title: 'Activity strip',
    blurb: 'Live feed under the status pills.'
  },
  {
    id: 'workspace',
    title: 'Workspace tabs',
    blurb: 'Home / Sheet / Battle tabs and the campaign switcher.'
  }
]

export const UI_COPY_META: Record<UiCopyKey, UiCopyMeta> = {
  'app.productTitle': {
    group: 'header',
    label: 'Product title',
    description: 'Big wordmark in the header.'
  },
  'app.productTagline': {
    group: 'header',
    label: 'Product tagline',
    description: 'One-line pitch directly under the title.',
    multiline: true
  },
  'sidebar.charactersHeading': {
    group: 'sidebar',
    label: 'Characters heading',
    description: 'Top of the roster column.'
  },
  'sidebar.sharingHeading': {
    group: 'sidebar',
    label: 'Sharing heading',
    description: 'Section heading for invites / campaign codes.'
  },
  'sidebar.guidedBlurb': {
    group: 'sidebar',
    label: 'Sharing helper blurb',
    description: 'Hint shown under "Sharing" when guided helpers are on.',
    multiline: true
  },
  'sidebar.searchPlaceholder': {
    group: 'sidebar',
    label: 'Search placeholder',
    description: 'Greyed-out text inside the roster search field.'
  },
  'sidebar.newCharacter': {
    group: 'sidebar',
    label: 'New character button',
    description: 'Label on the create-character button.'
  },
  'sidebar.emptyRoster': {
    group: 'sidebar',
    label: 'Empty roster message',
    description: 'Shown when this account has no characters yet.',
    multiline: true
  },
  'sidebar.emptyFilter': {
    group: 'sidebar',
    label: 'Empty filter message',
    description: 'Shown when search/filter hides every character.',
    multiline: true
  },
  'sidebar.battleDragHint': {
    group: 'sidebar',
    label: 'Battle drag hint',
    description: 'Banner shown above the roster while on the Battle tab.',
    multiline: true
  },
  'activity.heading': {
    group: 'activity',
    label: 'Activity heading',
    description: 'Heading on the live activity strip.'
  },
  'activity.emptyBlurb': {
    group: 'activity',
    label: 'Activity empty blurb',
    description: 'Placeholder shown when the activity feed is empty.',
    multiline: true
  },
  'workspace.home': {
    group: 'workspace',
    label: 'Home tab label',
    description: 'Label for the Home tab.'
  },
  'workspace.sheet': {
    group: 'workspace',
    label: 'Sheet tab label',
    description: 'Label for the Sheet tab.'
  },
  'workspace.battle': {
    group: 'workspace',
    label: 'Battle tab label',
    description: 'Label for the Battle tab.'
  },
  'workspace.campaignLabel': {
    group: 'workspace',
    label: 'Campaign status word',
    description: 'Word used in the status pill, e.g. "Campaign: Personal".'
  },
  'workspace.personalWorkspace': {
    group: 'workspace',
    label: 'Personal workspace option',
    description: 'Default option in the campaign dropdown.'
  },
  'workspace.battleLockedHint': {
    group: 'workspace',
    label: 'Battle locked hint',
    description: 'Shown when no campaign is selected and Battle is unavailable.',
    multiline: true
  }
}

export const UI_COPY_KEYS: UiCopyKey[] = Object.keys(UI_COPY_DEFAULTS) as UiCopyKey[]

/**
 * Whether a key should render as a multiline textarea. Honors the explicit `multiline`
 * flag in metadata; otherwise auto-detects based on default-string length.
 */
export function isMultilineKey(key: UiCopyKey): boolean {
  const meta = UI_COPY_META[key]
  if (typeof meta.multiline === 'boolean') return meta.multiline
  return UI_COPY_DEFAULTS[key].length > 60
}

export function loadUiCopyOverrides(): UiCopyOverrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: UiCopyOverrides = {}
    for (const key of UI_COPY_KEYS) {
      const v = parsed[key]
      if (typeof v === 'string' && v.trim().length > 0) out[key] = v
    }
    return out
  } catch {
    return {}
  }
}

export function persistUiCopyOverrides(overrides: UiCopyOverrides): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // ignore quota / private mode
  }
}

export function clearUiCopyOverrides(): void {
  if (typeof window === 'undefined') return
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

/**
 * Best-effort merge of an arbitrary object (e.g. pasted JSON) into an overrides record.
 * Silently drops unknown keys and non-string values; trims whitespace and removes blanks.
 */
export function mergeUiCopyOverrides(
  current: UiCopyOverrides,
  incoming: unknown
): { next: UiCopyOverrides; applied: number; skipped: number } {
  if (!incoming || typeof incoming !== 'object') {
    return { next: current, applied: 0, skipped: 0 }
  }
  const next: UiCopyOverrides = { ...current }
  let applied = 0
  let skipped = 0
  const knownKeys = new Set<string>(UI_COPY_KEYS)
  for (const [rawKey, rawValue] of Object.entries(incoming as Record<string, unknown>)) {
    if (!knownKeys.has(rawKey)) {
      skipped += 1
      continue
    }
    const key = rawKey as UiCopyKey
    if (typeof rawValue !== 'string') {
      skipped += 1
      continue
    }
    const trimmed = rawValue.trim()
    if (trimmed.length === 0) {
      delete next[key]
      applied += 1
      continue
    }
    next[key] = rawValue
    applied += 1
  }
  return { next, applied, skipped }
}
