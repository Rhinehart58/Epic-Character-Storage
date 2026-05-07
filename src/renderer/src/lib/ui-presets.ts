/** Saved UI layout presets (localStorage). Separate from per-account appearance JSON. */

export type CornerStyle = 'soft' | 'era' | 'sharp' | 'organic'
export type ChromeWeight = 'light' | 'standard' | 'heavy'
export type SidebarPlacement = 'auto' | 'left' | 'right'
export type SidebarWidthPreset = 'compact' | 'medium' | 'wide'
export type WorkspaceDensity = 'cozy' | 'comfortable' | 'spacious'
export type WorkspaceFlowRegion = 'header' | 'status' | 'grid'

export type UiLayoutSettings = {
  cornerStyle: CornerStyle
  chromeWeight: ChromeWeight
  sidebarPlacement: SidebarPlacement
  sidebarWidth: SidebarWidthPreset
  workspaceDensity: WorkspaceDensity
  workspaceFlow: WorkspaceFlowRegion[]
  useThemeLayout: boolean
  /** Optional: snapshot palette when the preset was saved */
  colorScheme?: string
}

export type UiLayoutPreset = {
  id: string
  name: string
  updatedAt: string
  layout: UiLayoutSettings
}

const STORAGE_KEY = 'ecs-ui-presets-v1'
const MAX_PRESETS = 16

export const DEFAULT_WORKSPACE_FLOW: WorkspaceFlowRegion[] = ['header', 'status', 'grid']

/**
 * Themed vertical stack order per palette — each era gets a noticeably different chrome vs content rhythm.
 * Must stay consistent with palette-specific CSS (e.g. sticky sidebars) where those rules exist.
 */
export function themedWorkspaceFlowDefault(colorScheme: string, useThemedLayout: boolean): WorkspaceFlowRegion[] {
  if (!useThemedLayout) return [...DEFAULT_WORKSPACE_FLOW]
  switch (colorScheme) {
    case 'sunset':
    case 'ps3':
    case 'teal':
      return ['status', 'header', 'grid']
    case 'violet':
    case 'wiiu':
    case 'bee':
      return ['header', 'grid', 'status']
    case 'xbox360':
    case 'default':
      return ['header', 'status', 'grid']
    case 'wii':
      return ['grid', 'header', 'status']
    case 'cube':
      return ['grid', 'status', 'header']
    case '3ds':
      return ['status', 'grid', 'header']
    default:
      return [...DEFAULT_WORKSPACE_FLOW]
  }
}

export function normalizeWorkspaceFlow(flow: unknown): WorkspaceFlowRegion[] {
  const keys: WorkspaceFlowRegion[] = ['header', 'status', 'grid']
  if (!Array.isArray(flow)) return [...DEFAULT_WORKSPACE_FLOW]
  const next = flow.filter((x): x is WorkspaceFlowRegion => keys.includes(x))
  if (next.length !== 3 || new Set(next).size !== 3) return [...DEFAULT_WORKSPACE_FLOW]
  return next
}

export function parseCornerStyle(value: unknown, legacyUseSoftCorners: unknown): CornerStyle {
  if (value === 'soft' || value === 'era' || value === 'sharp' || value === 'organic') return value
  if (legacyUseSoftCorners === false) return 'era'
  return 'soft'
}

export function parseChromeWeight(value: unknown): ChromeWeight {
  if (value === 'light' || value === 'heavy') return value
  return 'standard'
}

export function parseSidebarPlacement(value: unknown): SidebarPlacement {
  if (value === 'left' || value === 'right' || value === 'auto') return value
  return 'auto'
}

export function parseSidebarWidth(value: unknown): SidebarWidthPreset {
  if (value === 'compact' || value === 'wide') return value
  return 'medium'
}

export function parseWorkspaceDensity(value: unknown): WorkspaceDensity {
  if (value === 'cozy' || value === 'spacious') return value
  return 'comfortable'
}

export function newPresetId(): string {
  try {
    return `p_${crypto.randomUUID()}`
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
  }
}

export function loadUiPresets(): UiLayoutPreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: UiLayoutPreset[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const id = typeof o.id === 'string' ? o.id : ''
      const name = typeof o.name === 'string' ? o.name : 'Preset'
      const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : new Date(0).toISOString()
      const layout = o.layout
      if (!layout || typeof layout !== 'object') continue
      const l = layout as Record<string, unknown>
      out.push({
        id: id || newPresetId(),
        name: name.slice(0, 80),
        updatedAt,
        layout: {
          cornerStyle: parseCornerStyle(l.cornerStyle, l.useSoftCorners),
          chromeWeight: parseChromeWeight(l.chromeWeight),
          sidebarPlacement: parseSidebarPlacement(l.sidebarPlacement),
          sidebarWidth: parseSidebarWidth(l.sidebarWidth),
          workspaceDensity: parseWorkspaceDensity(l.workspaceDensity),
          workspaceFlow: normalizeWorkspaceFlow(l.workspaceFlow),
          useThemeLayout: typeof l.useThemeLayout === 'boolean' ? l.useThemeLayout : true,
          colorScheme: typeof l.colorScheme === 'string' ? l.colorScheme : undefined
        }
      })
    }
    return out.slice(0, MAX_PRESETS)
  } catch {
    return []
  }
}

export function saveUiPresets(presets: UiLayoutPreset[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)))
  } catch {
    /* quota */
  }
}

export function upsertUiPreset(presets: UiLayoutPreset[], preset: UiLayoutPreset): UiLayoutPreset[] {
  const idx = presets.findIndex((p) => p.id === preset.id)
  const next = [...presets]
  if (idx === -1) {
    next.unshift(preset)
  } else {
    next[idx] = preset
  }
  saveUiPresets(next)
  return next
}

export function deleteUiPreset(presets: UiLayoutPreset[], id: string): UiLayoutPreset[] {
  const next = presets.filter((p) => p.id !== id)
  saveUiPresets(next)
  return next
}
