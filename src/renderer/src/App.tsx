import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, JSX, ReactNode, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type {
  CampaignRecord,
  CharacterRecord,
  CharacterSaveInput,
  SyncActivityPayload
} from '@shared/character-types'
import { createDefaultStats } from '@shared/character-types'
import { normalizeKeywordInput, previewKeywordAttackBatch, starterKeywordsForDndArchetype } from '@shared/attack-generator'
import { cn } from './lib/utils'
import { playUiButtonChime, type ChimeColorScheme } from './lib/theme-chime'
import {
  BEE_THEME_SECRET_NORMALIZED,
  normalizeSecretInput,
  persistBeeThemeUnlocked,
  readBeeThemeUnlocked
} from './lib/secret-unlocks'
import {
  deleteUiPreset,
  loadUiPresets,
  newPresetId,
  normalizeWorkspaceFlow,
  themedWorkspaceFlowDefault,
  parseChromeWeight,
  parseCornerStyle,
  parseSidebarPlacement,
  parseSidebarWidth,
  parseWorkspaceDensity,
  upsertUiPreset,
  type ChromeWeight,
  type CornerStyle,
  type SidebarPlacement,
  type SidebarWidthPreset,
  type UiLayoutPreset,
  type WorkspaceDensity,
  type WorkspaceFlowRegion
} from './lib/ui-presets'
import { DndSheetSection, ecsPortraitSrc, emptyManualAttackDraft, type ManualAttackDraft } from './components/DndSheetSection'
import { LoginUpdateLog } from './components/LoginUpdateLog'
import { backend } from './lib/backend'
import {
  clearUiCopyOverrides,
  isMultilineKey,
  loadUiCopyOverrides,
  mergeUiCopyOverrides,
  persistUiCopyOverrides,
  resolveUiCopy,
  UI_COPY_DEFAULTS,
  UI_COPY_GROUPS,
  UI_COPY_KEYS,
  UI_COPY_META,
  UI_COPY_STORAGE_KEY,
  type UiCopyKey,
  type UiCopyOverrides
} from './lib/ui-copy'

type ActivityFeedEntry = SyncActivityPayload & { entryId: string }

function formatLocalActivityTime(atMs: number): string {
  return new Date(atMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })
}

type ThemeMode = 'system' | 'light' | 'dark'
type AuthMode = 'login' | 'register' | 'dev' | 'reset'
type WorkspaceTab = 'home' | 'sheet' | 'battle'
type ColorScheme = 'default' | 'violet' | 'teal' | 'sunset' | 'wii' | 'ps3' | 'xbox360' | 'cube' | 'wiiu' | '3ds' | 'bee'
type QuickPreset = 'frontliner' | 'caster' | 'rogue'
type RulesMode = 'ttrpg' | 'dnd'
type EditableCharacter = Omit<CharacterSaveInput, 'ownerAccountId' | 'campaignId'>
type BattleDraft = {
  hpCurrent: number
  armorCurrent: number
  initiative: number
  notes: string
  conditions: string[]
  selectedAction: string
}

const GUEST_APPEARANCE_KEY = 'ecs-appearance-guest-v1'
const REMEMBER_LOGIN_KEY = 'ecs_remember_login_v1'
const PREF_REMEMBER_LOGIN = 'rememberLogin'
const PREF_GUEST_APPEARANCE = 'guestAppearance'
const UPDATE_PROMPT_DISMISSED_KEY = 'ecs_update_prompt_dismissed_v1'
const LEGACY_INSTALL_PROMPT_DISMISSED_KEY = 'ecs_legacy_install_prompt_dismissed_v1'
const STARTUP_SPLASH_DURATION_KEY = 'ecs_startup_splash_ms_v1'
const UPDATE_CHECK_MS = 15 * 60 * 1000

type UpdateStatusPhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
type UpdateStatus = {
  phase: UpdateStatusPhase
  version?: string
  progress?: number
  message?: string
}

function parseStartupSplashDuration(value: unknown): number {
  if (value === 1200 || value === 2200 || value === 3000 || value === 4500) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (n === 1200 || n === 2200 || n === 3000 || n === 4500) return n
  }
  return 3000
}

/** Human-readable names for vertical stack regions (layout editor + screen readers). */
function ecsWorkspaceRegionLabel(region: WorkspaceFlowRegion): string {
  if (region === 'header') return 'Title bar'
  if (region === 'status') return 'Status strip'
  return 'Campaign and editor'
}

/** Small glyph + accent class for an activity feed entry, keyed by `SyncActivityKind`. */
function activityKindGlyph(kind: ActivityFeedEntry['kind']): { icon: string; tone: string; label: string } {
  switch (kind) {
    case 'character_created':
      return { icon: '＋', tone: 'text-emerald-600 dark:text-emerald-300', label: 'Character created' }
    case 'character_updated':
      return { icon: '✎', tone: 'text-sky-600 dark:text-sky-300', label: 'Character updated' }
    case 'character_deleted':
      return { icon: '×', tone: 'text-rose-600 dark:text-rose-300', label: 'Character deleted' }
    case 'battle_updated':
      return { icon: '⚔', tone: 'text-amber-600 dark:text-amber-300', label: 'Battle updated' }
    case 'campaign_created':
      return { icon: '★', tone: 'text-violet-600 dark:text-violet-300', label: 'Campaign created' }
    case 'campaign_joined':
      return { icon: '↗', tone: 'text-indigo-600 dark:text-indigo-300', label: 'Campaign joined' }
    case 'campaign_left':
      return { icon: '↘', tone: 'text-zinc-500 dark:text-zinc-400', label: 'Campaign left' }
    default:
      return { icon: '•', tone: 'text-slate-500 dark:text-slate-400', label: 'Activity' }
  }
}

/** Full-bleed palette ambience — shared by the signed-in shell and the login route so themes read consistently. */
function EcsPaletteBackdrop(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 ecs-palette-backdrop" aria-hidden>
      <div className="ecs-palette-layer ecs-palette-layer--default">
        <div className="ecs-default-backdrop" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--violet ecs-aero-scene">
        <div className="ecs-aero-sky" />
        <div className="ecs-aero-ribbon motion-safe:animate-ecs-aero-ribbon" />
        <div className="ecs-aero-specular motion-safe:animate-ecs-aero-ribbon" style={{ animationDelay: '-4s' }} />
        <div className="ecs-aero-orb ecs-aero-orb--a motion-safe:animate-ecs-aero-float" style={{ animationDelay: '-5s' }} />
        <div className="ecs-aero-orb ecs-aero-orb--b motion-safe:animate-ecs-aero-float" style={{ animationDelay: '-11s' }} />
        <div className="ecs-aero-orb ecs-aero-orb--c motion-safe:animate-ecs-aero-float" style={{ animationDelay: '-17s' }} />
        <div className="absolute inset-0 ecs-grid-wash opacity-80" />
        <div className="ecs-aero-vignette" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--teal">
        <div className="ecs-win98-wallpaper" />
        <div className="ecs-win98-pixel-grid" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--sunset">
        <div className="ecs-y2k-space" />
        <div className="ecs-y2k-glow-ribbon motion-safe:animate-ecs-aero-ribbon" />
        <div className="ecs-y2k-grid-floor" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--wii ecs-wii-scene">
        <div className="ecs-wii-backdrop" />
        <div className="ecs-wii-channel-grid" />
        <div className="ecs-wii-pane-matrix" />
        <div className="ecs-wii-focus-dot motion-safe:animate-ecs-pulse-soft" />
        <div
          className="ecs-wii-shine-bubble left-[8%] top-[22%] h-[min(52vmin,380px)] w-[min(52vmin,380px)] motion-safe:animate-ecs-wii-drift"
          aria-hidden
        />
        <div
          className="ecs-wii-shine-bubble bottom-[12%] right-[6%] h-[min(40vmin,300px)] w-[min(56vmin,400px)] opacity-35 motion-safe:animate-ecs-wii-drift"
          style={{ animationDelay: '-9s' }}
          aria-hidden
        />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--ps3 ecs-xmb-scene">
        <div className="ecs-xmb-backdrop" />
        <div className="ecs-xmb-wave-layer motion-safe:animate-ecs-xmb-wave" />
        <div className="ecs-xmb-wave-layer ecs-xmb-wave-layer--secondary motion-safe:animate-ecs-xmb-wave" />
        <div className="ecs-xmb-column-guides" />
        <div className="ecs-xmb-spark-grid" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--xbox360 ecs-nxe-scene">
        <div className="ecs-nxe-backdrop" />
        <div className="ecs-nxe-blade-sweep motion-safe:animate-ecs-nxe-drift" />
        <div className="ecs-nxe-ring-glow" />
        <div className="ecs-nxe-horizontal-lines" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--cube ecs-cube-scene">
        <div className="ecs-cube-backdrop" />
        <div className="ecs-cube-facet-grid" />
        <div className="ecs-cube-ghost-cube ecs-cube-ghost-cube--a motion-safe:animate-ecs-cube-drift" />
        <div
          className="ecs-cube-ghost-cube ecs-cube-ghost-cube--b motion-safe:animate-ecs-cube-drift"
          style={{ animationDelay: '-8s' }}
        />
        <div className="ecs-cube-sphere-glow motion-safe:animate-ecs-aero-float" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--bee ecs-bee-scene">
        <div className="ecs-bee-backdrop" />
        <div className="ecs-bee-comb" />
        <div className="ecs-bee-nectar-glow motion-safe:animate-ecs-aero-float" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--wiiu ecs-wiiu-scene">
        <div className="ecs-wiiu-backdrop" />
        <div className="ecs-wiiu-tile-grid" />
      </div>
      <div className="ecs-palette-layer ecs-palette-layer--3ds ecs-3ds-scene">
        <div className="ecs-3ds-backdrop" />
        <div className="ecs-3ds-dot-grid" />
      </div>
    </div>
  )
}

type LogoMarkVariant = 'ledger' | 'crest' | 'spark'
const ACTIVE_LOGO_MARK: LogoMarkVariant = 'spark'
const LOGO_MARK_VARIANTS: LogoMarkVariant[] = ['ledger', 'crest', 'spark']

function EcsLogoMark({ className, variant = ACTIVE_LOGO_MARK }: { className?: string; variant?: LogoMarkVariant }): JSX.Element {
  return (
    <span
      className={cn(
        'ecs-logo-mark inline-flex h-10 w-10 items-center justify-center rounded-md border border-current/30 bg-current/10',
        className
      )}
      aria-hidden
    >
      {variant === 'ledger' ? (
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 7H25V25H7V7Z" stroke="currentColor" strokeWidth="2" />
          <path d="M10.5 12H21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10.5 16H18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10.5 20H20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="22.5" cy="20.5" r="2.2" fill="currentColor" />
        </svg>
      ) : null}
      {variant === 'crest' ? (
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 5.5L25 9V16.5C25 21.2 21.6 25.1 16 26.3C10.4 25.1 7 21.2 7 16.5V9L16 5.5Z" stroke="currentColor" strokeWidth="2" />
          <path d="M12 13.5L16 10L20 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11.5 18H20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="21.5" r="1.6" fill="currentColor" />
        </svg>
      ) : null}
      {variant === 'spark' ? (
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 4.5L19.6 12.4L27.5 16L19.6 19.6L16 27.5L12.4 19.6L4.5 16L12.4 12.4L16 4.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M16 10V14.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 17.9V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 16H14.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M17.9 16H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="14.6" y="14.6" width="2.8" height="2.8" transform="rotate(45 16 16)" fill="currentColor" />
        </svg>
      ) : null}
    </span>
  )
}

function accountAppearanceKey(accountId: string): string {
  return `ecs-appearance-account-${accountId}-v1`
}

/** Every palette except `bee`, which is gated by a local secret unlock. */
const PUBLIC_COLOR_SCHEMES: ColorScheme[] = [
  'default',
  'violet',
  'teal',
  'sunset',
  'wii',
  'ps3',
  'xbox360',
  'cube',
  'wiiu',
  '3ds'
]

function parseColorScheme(value: unknown): ColorScheme {
  if (typeof value !== 'string') return 'default'
  if (value === 'bionicle') return 'default'
  if (value === 'xmb') return 'ps3'
  if (value === 'bee') return readBeeThemeUnlocked() ? 'bee' : 'default'
  return (PUBLIC_COLOR_SCHEMES as readonly string[]).includes(value) ? (value as ColorScheme) : 'default'
}

function isPs3OrXbox360(cs: ColorScheme): boolean {
  return cs === 'ps3' || cs === 'xbox360'
}

type StoredAppearanceV1 = {
  colorScheme?: string
  themeMode?: string
  useThemeLayout?: boolean
  /** @deprecated migrated to `cornerStyle` */
  useSoftCorners?: boolean
  cornerStyle?: string
  chromeWeight?: string
  sidebarPlacement?: string
  sidebarWidth?: string
  workspaceDensity?: string
  workspaceFlow?: string[]
  /** When false, `workspaceFlow` follows palette-themed defaults when switching schemes. */
  regionFlowCustom?: boolean
  activeUiPresetId?: string | null
  mergeGeneratedAttacks?: boolean
  persistThemePerAccount?: boolean
  uiSoundsEnabled?: boolean
}

function readStoredAppearance(key: string): StoredAppearanceV1 | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredAppearanceV1) : null
  } catch {
    return null
  }
}

function parseThemeMode(value: unknown): ThemeMode | null {
  if (value === 'system' || value === 'light' || value === 'dark') return value
  return null
}

type ThemeSchemeChoice = { id: ColorScheme; title: string; blurb: string }

/** Header Theme menu rows (excludes secret `bee`; appended at runtime when unlocked). */
const THEME_SCHEME_CHOICES_BASE: ThemeSchemeChoice[] = [
  { id: 'default', title: 'Default', blurb: 'Neutral slate chrome for general desktop readability.' },
  { id: 'violet', title: 'Aero meadow', blurb: 'Windows Vista Aero cues: glass highlights, soft sky gradients.' },
  { id: 'teal', title: 'Classic chrome', blurb: 'Win98-inspired bevels, flat gray chrome, teal desktop field.' },
  { id: 'sunset', title: 'Y2K neon', blurb: 'Late-90s/early-2000s web shimmer: neon, chrome, stars.' },
  { id: 'wii', title: 'Wii', blurb: 'Wii Channel Menu style: clean white cards, soft cyan accents.' },
  { id: 'ps3', title: 'PS3 (XMB)', blurb: 'XrossMediaBar-inspired dark field with flowing wave guides.' },
  {
    id: 'xbox360',
    title: 'Xbox 360 (NXE)',
    blurb: 'NXE-inspired charcoal cards with Xbox-green edge glow.'
  },
  {
    id: 'cube',
    title: 'GameCube',
    blurb: 'Indigo BIOS-era cube glass with metallic highlights.'
  },
  { id: 'wiiu', title: 'Wii U', blurb: 'Flat cyan tile language over dark UI scaffolding.' },
  { id: '3ds', title: '3DS', blurb: 'Glossy red handheld chrome with tighter panel seams.' }
]

const AUTO_THEME_MODE_BY_SCHEME: Partial<Record<ColorScheme, ThemeMode>> = {
  teal: 'light',
  wii: 'light',
  wiiu: 'light',
  bee: 'light',
  ps3: 'dark',
  xbox360: 'dark',
  cube: 'dark'
}

const BEE_THEME_CHOICE: ThemeSchemeChoice = {
  id: 'bee',
  title: 'Honey bee',
  blurb: 'Amber hive chrome and honeycomb field — unlock from Settings → Secret codes.'
}

type ThemeSourceRef = { cue: string; sourceLabel: string; sourceUrl: string }

/** External references used to keep each palette distinct from its source era/device language. */
const THEME_SOURCE_REFS: Record<ColorScheme, ThemeSourceRef> = {
  default: {
    cue: 'Neutral modern desktop baseline for readability-first workflows.',
    sourceLabel: 'Project baseline',
    sourceUrl: 'https://cursor.com/docs'
  },
  violet: {
    cue: 'Glass translucency, gentle gradients, and reflective highlights (Aero).',
    sourceLabel: 'Windows Aero overview',
    sourceUrl: 'https://en.wikipedia.org/wiki/Windows_Aero'
  },
  teal: {
    cue: 'Win9x-style hard bevels, low-radius chrome, and high contrast separators.',
    sourceLabel: 'Windows 98 visual style reference',
    sourceUrl: 'https://en.wikipedia.org/wiki/Windows_98'
  },
  sunset: {
    cue: 'Y2K web motifs: chrome gradients, neon accents, star/glitter microdecor.',
    sourceLabel: 'Y2K aesthetic guide',
    sourceUrl: 'https://aesthetic.fyi/y2k'
  },
  wii: {
    cue: 'Channel-grid metaphor with evenly weighted rounded tiles.',
    sourceLabel: 'Iwata Asks - Wii Channels',
    sourceUrl: 'https://iwataasks.nintendo.com/interviews/wii/wii_channels/0/1/'
  },
  ps3: {
    cue: 'XMB horizontal categories and layered wave backdrop motion.',
    sourceLabel: 'XrossMediaBar',
    sourceUrl: 'https://en.wikipedia.org/wiki/XrossMediaBar'
  },
  xbox360: {
    cue: 'NXE card-like panes, horizontal sweep, and green status highlights.',
    sourceLabel: 'New Xbox Experience (hands-on)',
    sourceUrl: 'https://www.pcworld.com/article/531800/nxe_part_one.html'
  },
  cube: {
    cue: 'Cube-centric indigo BIOS visuals with reflective volumetric depth.',
    sourceLabel: 'IGN GameCube front-end coverage',
    sourceUrl: 'https://www.ign.com/articles/2001/08/17/interface-with-gamecube-gcn'
  },
  wiiu: {
    cue: 'Clean tile-based launcher patterns with restrained cyan accents.',
    sourceLabel: 'Wii U UI overview',
    sourceUrl: 'https://www.nintendolife.com/news/2014/09/wii_u_system_update_520_brings_folders_new_ui_design_and_more'
  },
  '3ds': {
    cue: 'Handheld-like compact framing, glossy red shell accents, tighter spacing.',
    sourceLabel: 'Nintendo 3DS operations manual',
    sourceUrl: 'https://fs-prod-cdn.nintendo-europe.com/media/downloads/support_1/nintendo_3ds_14/Nintendo3DS_OperationsManual_UK.pdf'
  },
  bee: {
    cue: 'Original house palette: warm amber hive gloss and honeycomb texture.',
    sourceLabel: 'Project custom theme',
    sourceUrl: 'https://cursor.com/docs'
  }
}

type ProfessionalUiPreset = {
  id: 'notion' | 'linear' | 'github' | 'atlassian'
  title: string
  blurb: string
  sourceLabel: string
  sourceUrl: string
  settings: {
    colorScheme: ColorScheme
    themeMode: ThemeMode
    useThemeLayout: boolean
    cornerStyle: CornerStyle
    chromeWeight: ChromeWeight
    workspaceDensity: WorkspaceDensity
    sidebarPlacement: SidebarPlacement
    sidebarWidth: SidebarWidthPreset
  }
}

const PROFESSIONAL_UI_PRESETS: ProfessionalUiPreset[] = [
  {
    id: 'notion',
    title: 'Notion-like',
    blurb: 'Calm warm-neutral layout, generous spacing, and quiet chrome.',
    sourceLabel: 'Notion page design notes',
    sourceUrl: 'https://www.notion.com/blog/updating-the-design-of-notion-pages',
    settings: {
      colorScheme: 'default',
      themeMode: 'light',
      useThemeLayout: false,
      cornerStyle: 'soft',
      chromeWeight: 'light',
      workspaceDensity: 'comfortable',
      sidebarPlacement: 'left',
      sidebarWidth: 'medium'
    }
  },
  {
    id: 'linear',
    title: 'Linear-like',
    blurb: 'Compact dark workspace, crisp borders, keyboard-first density.',
    sourceLabel: 'Linear redesign notes',
    sourceUrl: 'https://linear.app/now/how-we-redesigned-the-linear-ui',
    settings: {
      colorScheme: 'default',
      themeMode: 'dark',
      useThemeLayout: false,
      cornerStyle: 'sharp',
      chromeWeight: 'standard',
      workspaceDensity: 'cozy',
      sidebarPlacement: 'left',
      sidebarWidth: 'compact'
    }
  },
  {
    id: 'github',
    title: 'GitHub Primer-like',
    blurb: 'Balanced contrast, conservative radius, efficiency-focused defaults.',
    sourceLabel: 'GitHub Primer principles',
    sourceUrl: 'https://primer.github.io/design/guides/introduction/',
    settings: {
      colorScheme: 'default',
      themeMode: 'system',
      useThemeLayout: false,
      cornerStyle: 'soft',
      chromeWeight: 'light',
      workspaceDensity: 'comfortable',
      sidebarPlacement: 'left',
      sidebarWidth: 'medium'
    }
  },
  {
    id: 'atlassian',
    title: 'Atlassian-like',
    blurb: 'Cohesive productivity UI with tighter layout and stronger structure.',
    sourceLabel: 'Atlassian design system',
    sourceUrl: 'https://atlassian.design/get-started/about-atlassian-design-system',
    settings: {
      colorScheme: 'default',
      themeMode: 'light',
      useThemeLayout: false,
      cornerStyle: 'sharp',
      chromeWeight: 'standard',
      workspaceDensity: 'cozy',
      sidebarPlacement: 'left',
      sidebarWidth: 'medium'
    }
  }
]

const SESSION_TIMEOUT_MS = 20 * 60 * 1000
const DRAG_HINT_DISMISSED_KEY = 'ecs.dragHint.dismissed.v1'
const DEV_ACCOUNT_EMAIL = 'rhinedev@local.epic'
const DEV_LAB_FLAGS_KEY = 'ecs.dev.lab.flags.v1'

type DevLabFlags = {
  showUiBounds: boolean
  forceReducedMotion: boolean
  verboseActivityFeed: boolean
  enableCommandPalette: boolean
}

const DEFAULT_DEV_LAB_FLAGS: DevLabFlags = {
  showUiBounds: false,
  forceReducedMotion: false,
  verboseActivityFeed: false,
  enableCommandPalette: true
}

function loadDevLabFlags(): DevLabFlags {
  if (typeof window === 'undefined') return DEFAULT_DEV_LAB_FLAGS
  try {
    const raw = window.localStorage.getItem(DEV_LAB_FLAGS_KEY)
    if (!raw) return DEFAULT_DEV_LAB_FLAGS
    const parsed = JSON.parse(raw) as Partial<DevLabFlags>
    return {
      showUiBounds: Boolean(parsed.showUiBounds),
      forceReducedMotion: Boolean(parsed.forceReducedMotion),
      verboseActivityFeed: Boolean(parsed.verboseActivityFeed),
      enableCommandPalette: typeof parsed.enableCommandPalette === 'boolean' ? parsed.enableCommandPalette : true
    }
  } catch {
    return DEFAULT_DEV_LAB_FLAGS
  }
}
const DND_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
  'Exhaustion'
] as const
const DND_ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Ready', 'Search', 'Use Object'] as const
const DND_CLASSES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard'
] as const

const DND_CLASS_ABILITY: Record<string, keyof CharacterSaveInput['stats']> = {
  Barbarian: 'str',
  Bard: 'cha',
  Cleric: 'wis',
  Druid: 'wis',
  Fighter: 'str',
  Monk: 'dex',
  Paladin: 'cha',
  Ranger: 'dex',
  Rogue: 'dex',
  Sorcerer: 'cha',
  Warlock: 'cha',
  Wizard: 'int'
}
const DND_CLASS_BASELINE: Record<string, { hp: number; ac: number }> = {
  Barbarian: { hp: 14, ac: 14 },
  Bard: { hp: 10, ac: 13 },
  Cleric: { hp: 11, ac: 15 },
  Druid: { hp: 10, ac: 14 },
  Fighter: { hp: 12, ac: 16 },
  Monk: { hp: 10, ac: 15 },
  Paladin: { hp: 12, ac: 16 },
  Ranger: { hp: 11, ac: 15 },
  Rogue: { hp: 10, ac: 14 },
  Sorcerer: { hp: 8, ac: 13 },
  Warlock: { hp: 9, ac: 14 },
  Wizard: { hp: 8, ac: 12 }
}

const DND_CLASS_BLURB: Record<(typeof DND_CLASSES)[number], string> = {
  Barbarian: 'Rage-fueled tank with brutal melee and massive HP',
  Bard: 'Magical performer who buffs allies and casts versatile spells',
  Cleric: 'Divine healer and front-line support',
  Druid: 'Nature shapeshifter and elemental caster',
  Fighter: 'Versatile martial — strong, durable, easy to play',
  Monk: 'Unarmed striker with superhuman speed and reflexes',
  Paladin: 'Holy warrior with smites, healing, and heavy armor',
  Ranger: 'Wilderness hunter with bows, beasts, and tracking',
  Rogue: 'Stealthy precision damage and skill mastery',
  Sorcerer: 'Innate magic — spontaneous and metamagic flair',
  Warlock: 'Patron-bound caster with potent invocations',
  Wizard: 'Studied scholar with the broadest spell list'
}

type TTRPGPresetEntry = {
  label: string
  blurb: string
  archetype: string
  factionGroup: string
  dedicatedEssence: string
  hp: number
  ac: number
}

const TTRPG_PRESETS: Record<QuickPreset, TTRPGPresetEntry> = {
  frontliner: {
    label: 'Frontliner',
    blurb: 'Heavy armor, melee, takes the hits',
    archetype: 'Frontliner',
    factionGroup: 'Vanguard',
    dedicatedEssence: 'Steel Discipline',
    hp: 32,
    ac: 14
  },
  caster: {
    label: 'Caster',
    blurb: 'Spells from a distance, fragile but powerful',
    archetype: 'Caster',
    factionGroup: 'Arc Circle',
    dedicatedEssence: 'Aether',
    hp: 18,
    ac: 8
  },
  rogue: {
    label: 'Skirmisher',
    blurb: 'Stealth, mobility, precision strikes',
    archetype: 'Rogue',
    factionGroup: 'Night Guild',
    dedicatedEssence: 'Shadowstep',
    hp: 22,
    ac: 10
  }
}

function proficiencyBonus(level: number): number {
  if (level >= 17) return 6
  if (level >= 13) return 5
  if (level >= 9) return 4
  if (level >= 5) return 3
  return 2
}

function emptyCharacter(): EditableCharacter {
  return {
    id: undefined,
    portraitRelativePath: '',
    factionGroup: '',
    name: '',
    hpCurrent: 30,
    hpMax: 30,
    armorCurrent: 10,
    armorMax: 10,
    armorNote: '',
    dedicatedEssence: '',
    dedicatedEssenceDescription: '',
    traitName: '',
    traitDescription: '',
    epicMoveName: '',
    epicMoveDescription: '',
    monolithName: '',
    monolithDescription: '',
    archetype: '',
    level: 1,
    notes: '',
    keywords: [],
    stats: createDefaultStats(),
    attacks: []
  }
}

function parseKeywords(value: string): string[] {
  return normalizeKeywordInput(value)
}

function formatSheet(ch: EditableCharacter): string {
  return `[${ch.name || 'Unnamed Character'}] - [H${ch.hpCurrent}/${ch.hpMax}]

[Normal Armor : ${ch.armorCurrent}/${ch.armorMax}]
[${ch.armorNote || ''}]

[Dedicated Essence : ${ch.dedicatedEssence || ''}]
${ch.dedicatedEssenceDescription || ''}

[Trait : ${ch.traitName || ''}]
${ch.traitDescription || ''}

[Epic/Ultimate Move: ${ch.epicMoveName || ''}]
${ch.epicMoveDescription || ''}

[Monolith : ${ch.monolithName || ''}] (One time, absurd feat / burst of power, like a super-super move)
${ch.monolithDescription || ''}`.trim()
}

function passwordChecks(password: string): { label: string; pass: boolean }[] {
  return [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Contains a number', pass: /\d/.test(password) }
  ]
}

function ecsAuthControlRound(cs: ColorScheme): string {
  if (cs === 'teal') return 'rounded-md'
  if (cs === 'wii') return 'rounded-2xl'
  if (cs === 'wiiu') return 'rounded-xl'
  if (cs === '3ds') return 'rounded-md'
  if (cs === 'bee') return 'rounded-2xl'
  if (cs === 'default') return 'rounded-lg'
  return 'rounded-lg'
}

function ecsWideControlRound(cs: ColorScheme): string {
  if (cs === 'teal') return 'rounded-md'
  if (cs === 'wii') return 'rounded-2xl'
  if (cs === 'wiiu') return 'rounded-xl'
  if (cs === '3ds') return 'rounded-md'
  if (cs === 'bee') return 'rounded-2xl'
  if (cs === 'default') return 'rounded-lg'
  return 'rounded-xl'
}

function ecsCharacterRowRound(cs: ColorScheme): string {
  if (cs === 'teal') return 'rounded-md'
  if (cs === 'wii') return 'rounded-2xl'
  if (cs === 'wiiu') return 'rounded-xl'
  if (cs === '3ds') return 'rounded-md'
  if (cs === 'bee') return 'rounded-2xl'
  if (cs === 'default') return 'rounded-lg'
  return 'rounded-lg'
}

function SettingsField(props: {
  label: string
  hint: string
  htmlFor?: string
  children: ReactNode
}): JSX.Element {
  const { label, hint, htmlFor, children } = props
  return (
    <div className="ecs-settings-field mt-3 first:mt-0">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200"
      >
        {label}
      </label>
      {children}
      <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

function SettingsSection(props: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="ecs-settings-section mt-4 first:mt-0 border-t border-slate-200/60 pt-3 first:border-t-0 first:pt-0 dark:border-slate-700/60">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        {props.title}
      </h3>
      <div className="mt-2 space-y-3">{props.children}</div>
    </section>
  )
}

/**
 * Six Toa-flavored sample characters for the dev "Seed sample data" button.
 * Tahu, Gali, Lewa, Onua, Kopaka, Pohatu — same elemental colors used to test
 * faction grouping, attack generation, and the battle board at once.
 */
const DEV_SEED_CHARACTERS: { name: string; faction: string; archetype: string; keywords: string[]; hp: number; ac: number }[] = [
  { name: 'Tahu', faction: 'Toa Mata', archetype: 'fire warrior', keywords: ['fire', 'blade'], hp: 32, ac: 16 },
  { name: 'Gali', faction: 'Toa Mata', archetype: 'water sage', keywords: ['ice', 'arcane'], hp: 26, ac: 14 },
  { name: 'Lewa', faction: 'Toa Mata', archetype: 'air scout', keywords: ['lightning', 'pierce'], hp: 24, ac: 15 },
  { name: 'Onua', faction: 'Toa Mata', archetype: 'earth guardian', keywords: ['crush', 'shadow'], hp: 38, ac: 17 },
  { name: 'Kopaka', faction: 'Toa Mata', archetype: 'ice tactician', keywords: ['ice', 'pierce'], hp: 28, ac: 16 },
  { name: 'Pohatu', faction: 'Toa Mata', archetype: 'stone bruiser', keywords: ['crush', 'thunder'], hp: 34, ac: 16 }
]

/** Repo-relative paths for the Workshop — copy and paste into your editor / IDE quick-open. */
const DEV_FILE_SHORTCUTS: { label: string; path: string; note: string }[] = [
  { label: 'Global CSS & motion', path: 'src/renderer/src/index.css', note: 'Palette hooks, density, clip-paths' },
  { label: 'Main shell + Workshop', path: 'src/renderer/src/App.tsx', note: 'Auth, workspace grid, battle, dev UI' },
  { label: 'DnD sheet block', path: 'src/renderer/src/components/DndSheetSection.tsx', note: 'Keywords, attacks, stats grid' },
  { label: 'Shared character types', path: 'src/shared/character-types.ts', note: 'Saved fields & battle payloads' },
  { label: 'Attack generator', path: 'src/shared/attack-generator.ts', note: 'Keyword → attack math' },
  { label: 'Electron main IPC', path: 'src/main/index.ts', note: 'Persistence + sync broadcast' },
  { label: 'Preload bridge', path: 'src/preload/index.ts', note: 'Exposes APIs to the renderer' },
  { label: 'Backend switch', path: 'src/renderer/src/lib/backend.ts', note: 'IPC vs future HTTP' }
]

type DevPanelTab = 'workbench' | 'overview' | 'state' | 'storage' | 'theme' | 'data' | 'strings'

function DevToolsPanel(props: {
  onClose: () => void
  activeTab: DevPanelTab
  setActiveTab: (tab: DevPanelTab) => void
  colorScheme: ColorScheme
  setColorScheme: (next: ColorScheme) => void
  themeMode: ThemeMode
  setThemeMode: (next: ThemeMode) => void
  useThemeLayout: boolean
  setUseThemeLayout: (next: boolean) => void
  mergeGeneratedAttacks: boolean
  persistThemePerAccount: boolean
  uiSoundsEnabled: boolean
  beeThemeUnlocked: boolean
  rulesMode: RulesMode
  setRulesMode: (next: RulesMode) => void
  cornerStyle: CornerStyle
  chromeWeight: ChromeWeight
  sidebarPlacement: SidebarPlacement
  sidebarWidth: SidebarWidthPreset
  workspaceDensity: WorkspaceDensity
  workspaceFlow: WorkspaceFlowRegion[]
  regionFlowCustom: boolean
  activeUiPresetId: string | null
  layoutEditMode: boolean
  activeAccountId: string | null
  characters: CharacterRecord[]
  campaigns: CampaignRecord[]
  campaignMembers: { id: string; displayName: string; email: string }[]
  workspaceTab: WorkspaceTab
  selectedCampaignId: string | null
  editor: EditableCharacter
  battleParticipants: string[]
  battleDrafts: Record<string, BattleDraft>
  encounterRound: number
  setAppMessage: (msg: string | null) => void
  reloadCharacters: () => Promise<void>
  guidedSetup: boolean
  setGuidedSetup: (next: boolean) => void
  setLayoutEditMode: Dispatch<SetStateAction<boolean>>
  setShowThemeMenu: Dispatch<SetStateAction<boolean>>
  setShowSettingsMenu: Dispatch<SetStateAction<boolean>>
  setWorkspaceTab: (next: WorkspaceTab) => void
  compactCreator: boolean
  setCompactCreator: Dispatch<SetStateAction<boolean>>
  compactBattle: boolean
  setCompactBattle: Dispatch<SetStateAction<boolean>>
  setMergeGeneratedAttacks: Dispatch<SetStateAction<boolean>>
  setCornerStyle: (next: CornerStyle) => void
  setChromeWeight: (next: ChromeWeight) => void
  setWorkspaceDensity: (next: WorkspaceDensity) => void
  setSidebarPlacement: (next: SidebarPlacement) => void
  setSidebarWidth: (next: SidebarWidthPreset) => void
  setUiSoundsEnabled: Dispatch<SetStateAction<boolean>>
  setPersistThemePerAccount: Dispatch<SetStateAction<boolean>>
  setActiveUiPresetId: Dispatch<SetStateAction<string | null>>
  open: boolean
  children: ReactNode
  uiCopyOverrides: UiCopyOverrides
  setUiCopyOverrides: Dispatch<SetStateAction<UiCopyOverrides>>
  devLabFlags: DevLabFlags
  setDevLabFlags: Dispatch<SetStateAction<DevLabFlags>>
}): JSX.Element {
  const {
    onClose,
    activeTab,
    setActiveTab,
    colorScheme,
    setColorScheme,
    themeMode,
    setThemeMode,
    useThemeLayout,
    setUseThemeLayout,
    mergeGeneratedAttacks,
    persistThemePerAccount,
    uiSoundsEnabled,
    beeThemeUnlocked,
    rulesMode,
    setRulesMode,
    cornerStyle,
    chromeWeight,
    sidebarPlacement,
    sidebarWidth,
    workspaceDensity,
    workspaceFlow,
    regionFlowCustom,
    activeUiPresetId,
    layoutEditMode,
    activeAccountId,
    characters,
    campaigns,
    campaignMembers,
    workspaceTab,
    selectedCampaignId,
    editor,
    battleParticipants,
    battleDrafts,
    encounterRound,
    setAppMessage,
    reloadCharacters,
    guidedSetup,
    setGuidedSetup,
    setLayoutEditMode,
    setShowThemeMenu,
    setShowSettingsMenu,
    setWorkspaceTab,
    compactCreator,
    setCompactCreator,
    compactBattle,
    setCompactBattle,
    setMergeGeneratedAttacks,
    setCornerStyle,
    setChromeWeight,
    setWorkspaceDensity,
    setSidebarPlacement,
    setSidebarWidth,
    setUiSoundsEnabled,
    setPersistThemePerAccount,
    setActiveUiPresetId,
    open,
    children,
    uiCopyOverrides,
    setUiCopyOverrides,
    devLabFlags,
    setDevLabFlags
  } = props

  const [storageKeys, setStorageKeys] = useState<{ key: string; value: string }[]>([])
  const [seedBusy, setSeedBusy] = useState(false)
  const [copyFilter, setCopyFilter] = useState('')
  const [copyShowOverriddenOnly, setCopyShowOverriddenOnly] = useState(false)
  const [copyImportText, setCopyImportText] = useState('')
  const [copyImportError, setCopyImportError] = useState<string | null>(null)
  const [showCopyImport, setShowCopyImport] = useState(false)

  const overriddenCopyCount = useMemo(
    () => Object.values(uiCopyOverrides).filter((v) => typeof v === 'string' && v.trim().length > 0).length,
    [uiCopyOverrides]
  )
  const availableThemeChoices = useMemo(
    () => [...THEME_SCHEME_CHOICES_BASE, ...(beeThemeUnlocked ? [BEE_THEME_CHOICE] : [])],
    [beeThemeUnlocked]
  )
  const activeThemeRef = THEME_SOURCE_REFS[colorScheme]

  /* eslint-disable react-hooks/set-state-in-effect -- storage inspector snapshot is intentionally refreshed when tab opens */
  useEffect(() => {
    if (activeTab !== 'storage') return
    const collected: { key: string; value: string }[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key) continue
      const value = window.localStorage.getItem(key) ?? ''
      collected.push({ key, value: value.length > 200 ? `${value.slice(0, 200)}…` : value })
    }
    setStorageKeys(collected.sort((a, b) => a.key.localeCompare(b.key)))
  }, [activeTab])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function seedSampleCharacters(): Promise<void> {
    if (!activeAccountId) {
      setAppMessage('Sign in first to seed characters.')
      return
    }
    setSeedBusy(true)
    try {
      for (const tpl of DEV_SEED_CHARACTERS) {
        const payload: CharacterSaveInput = {
          ownerAccountId: activeAccountId,
          campaignId: selectedCampaignId,
          portraitRelativePath: '',
          factionGroup: tpl.faction,
          name: tpl.name,
          hpCurrent: tpl.hp,
          hpMax: tpl.hp,
          armorCurrent: tpl.ac,
          armorMax: tpl.ac,
          armorNote: '',
          dedicatedEssence: 'elemental',
          dedicatedEssenceDescription: '',
          traitName: '',
          traitDescription: '',
          epicMoveName: '',
          epicMoveDescription: '',
          monolithName: '',
          monolithDescription: '',
          archetype: tpl.archetype,
          level: 5,
          notes: `Seed sample (dev mode) — ${tpl.archetype}.`,
          keywords: tpl.keywords,
          stats: createDefaultStats(),
          attacks: []
        }
        await backend.characterApi.save(payload)
      }
      await reloadCharacters()
      setAppMessage(`Seeded ${DEV_SEED_CHARACTERS.length} sample characters.`)
    } catch (err) {
      setAppMessage(`Seed failed: ${(err as Error).message}`)
    } finally {
      setSeedBusy(false)
    }
  }

  async function deleteAllCharacters(): Promise<void> {
    if (!window.confirm(`Delete all ${characters.length} of your characters? This cannot be undone.`)) return
    try {
      for (const character of characters) {
        await backend.characterApi.remove(character.id)
      }
      await reloadCharacters()
      setAppMessage('Deleted all characters.')
    } catch (err) {
      setAppMessage(`Delete failed: ${(err as Error).message}`)
    }
  }

  const stateSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          ui: {
            workspaceTab,
            colorScheme,
            useThemeLayout,
            themeMode,
            rulesMode,
            cornerStyle,
            chromeWeight,
            sidebarPlacement,
            sidebarWidth,
            workspaceDensity,
            workspaceFlow,
            regionFlowCustom,
            activeUiPresetId,
            layoutEditMode,
            mergeGeneratedAttacks,
            persistThemePerAccount,
            uiSoundsEnabled,
            beeThemeUnlocked
          },
          account: { activeAccountId },
          counts: {
            characters: characters.length,
            campaigns: campaigns.length,
            campaignMembers: campaignMembers.length
          },
          editor: {
            id: editor.id ?? null,
            name: editor.name,
            level: editor.level,
            hp: `${editor.hpCurrent}/${editor.hpMax}`,
            ac: `${editor.armorCurrent}/${editor.armorMax}`,
            keywords: editor.keywords
          },
          battle: {
            campaignId: selectedCampaignId,
            round: encounterRound,
            participants: battleParticipants.length,
            drafts: Object.keys(battleDrafts).length
          }
        },
        null,
        2
      ),
    [
      workspaceTab,
      colorScheme,
      useThemeLayout,
      themeMode,
      rulesMode,
      cornerStyle,
      chromeWeight,
      sidebarPlacement,
      sidebarWidth,
      workspaceDensity,
      workspaceFlow,
      regionFlowCustom,
      activeUiPresetId,
      layoutEditMode,
      mergeGeneratedAttacks,
      persistThemePerAccount,
      uiSoundsEnabled,
      beeThemeUnlocked,
      activeAccountId,
      characters.length,
      campaigns.length,
      campaignMembers.length,
      editor,
      selectedCampaignId,
      encounterRound,
      battleParticipants.length,
      battleDrafts
    ]
  )

  if (!open) return <>{children}</>

  const tabBtn = (id: DevPanelTab, label: ReactNode): JSX.Element => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => setActiveTab(id)}
      className={cn(
        'shrink-0 rounded-lg border-2 border-transparent px-3 py-2.5 text-left text-xs font-bold tracking-wide transition-colors',
        'max-lg:whitespace-nowrap max-lg:py-2 max-lg:pl-2.5 max-lg:pr-3',
        'lg:w-full lg:py-2.5',
        activeTab === id
          ? 'border-zinc-600 bg-zinc-900 text-white shadow-sm dark:border-zinc-400 dark:bg-zinc-100 dark:text-zinc-900'
          : 'text-zinc-600 hover:border-zinc-300 hover:bg-white dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80'
      )}
    >
      {label}
    </button>
  )

  const bigAction = (label: string, onClick: () => void, variant: 'neutral' | 'accent' = 'neutral'): JSX.Element => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'ecs-interactive w-full rounded-xl border-2 px-4 py-4 text-left text-base font-bold leading-snug transition-colors',
        variant === 'accent'
          ? 'border-amber-600 bg-amber-500 text-white hover:bg-amber-400 dark:border-amber-400 dark:bg-amber-600 dark:hover:bg-amber-500'
          : 'border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800'
      )}
    >
      {label}
    </button>
  )

  const openThemeMenu = (): void => {
    setShowSettingsMenu(false)
    setShowThemeMenu(true)
  }

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-3 overflow-hidden',
        'max-lg:h-[calc(100dvh-5rem)] max-lg:max-h-[calc(100dvh-5rem)]',
        'lg:grid lg:h-[calc(100dvh-3.5rem)] lg:max-h-[calc(100dvh-3.5rem)] lg:grid-cols-[10.5rem_minmax(0,1fr)_minmax(22rem,28rem)] lg:grid-rows-1 lg:gap-4'
      )}
    >
      <aside
        className={cn(
          'order-1 flex shrink-0 flex-col gap-2 rounded-xl border-2 border-zinc-400 bg-zinc-100 p-2 shadow-sm dark:border-zinc-600 dark:bg-zinc-900',
          'max-lg:max-h-[min(9.75rem,26svh)] max-lg:overflow-hidden',
          'lg:col-start-1 lg:row-start-1 lg:h-full lg:max-h-none lg:min-h-0 lg:overflow-y-auto'
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-300 pb-2 dark:border-zinc-600">
          <div className="min-w-0">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300">
              Workshop
            </span>
            <div className="truncate text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Developer account only
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border-2 border-zinc-500 bg-white px-2 py-1 text-[10px] font-black uppercase text-zinc-900 hover:bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
          >
            Exit
          </button>
        </div>
        <nav
          role="tablist"
          aria-label="Workshop sections"
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto lg:overflow-y-visible',
            'max-lg:flex-row max-lg:flex-nowrap max-lg:gap-1.5 max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:py-0.5'
          )}
        >
          {tabBtn('workbench', 'Workbench')}
          {tabBtn('overview', 'Overview')}
          {tabBtn('state', 'State')}
          {tabBtn('theme', 'Theme')}
          {tabBtn('storage', 'Storage')}
          {tabBtn('data', 'Data')}
          {tabBtn(
            'strings',
            overriddenCopyCount > 0 ? (
              <span className="flex items-center justify-between gap-2">
                <span>UI copy</span>
                <span
                  className={cn(
                    'inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[9px] font-black tabular-nums',
                    activeTab === 'strings'
                      ? 'bg-white/20 text-white dark:bg-zinc-900/30 dark:text-zinc-900'
                      : 'bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-900'
                  )}
                >
                  {overriddenCopyCount}
                </span>
              </span>
            ) : (
              'UI copy'
            )
          )}
        </nav>
      </aside>

      <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain lg:col-start-2 lg:row-start-1 lg:h-full lg:overflow-y-auto">
        {children}
      </div>

      <section
        role="region"
        aria-label="Workshop panel"
        className={cn(
          'order-3 flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border-2 border-zinc-400 bg-stone-50 shadow-md dark:border-zinc-600 dark:bg-zinc-950',
          'max-lg:max-h-[min(36vh,18rem)]',
          'lg:col-start-3 lg:row-start-1 lg:h-full lg:max-h-none'
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 md:p-5">
          {activeTab === 'workbench' ? (
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
              <div className="grid gap-4">
                <div className="space-y-3">
                  <h3 className="ecs-ui-section-title text-zinc-500 dark:text-zinc-400">
                    Masks & menus
                  </h3>
                  <div className="grid gap-3">
                    {bigAction('Open Theme menu', () => {
                      openThemeMenu()
                    })}
                    {bigAction('Open Settings', () => {
                      setShowThemeMenu(false)
                      setShowSettingsMenu(true)
                    })}
                    {bigAction(
                      layoutEditMode ? 'Exit layout editor' : 'Reorder workspace chrome',
                      () => setLayoutEditMode((v) => !v)
                    )}
                    {bigAction(guidedSetup ? 'Hide helper blurbs' : 'Show helper blurbs', () => setGuidedSetup(!guidedSetup))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="ecs-ui-section-title text-zinc-500 dark:text-zinc-400">
                    Jump in the UI
                  </h3>
                  <div className="grid gap-3">
                    {bigAction('Home tab', () => setWorkspaceTab('home'), 'accent')}
                    {bigAction('Sheet tab', () => setWorkspaceTab('sheet'), 'accent')}
                    {bigAction('Battle tab', () => setWorkspaceTab('battle'), 'accent')}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-zinc-300 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900">
                <h3 className="ecs-ui-section-title text-zinc-500 dark:text-zinc-400">
                  Chrome (no rebuild for these)
                </h3>
                <div className="mt-4 grid gap-4">
                  <SettingsField label="Corners" hint="Clip-path era vs soft rectangles." htmlFor="wb-corners">
                    <select
                      id="wb-corners"
                      value={cornerStyle}
                      onChange={(e) => setCornerStyle(e.target.value as CornerStyle)}
                      className="mt-2 w-full rounded-lg border-2 border-zinc-300 bg-transparent px-3 py-2 text-sm font-semibold dark:border-zinc-600"
                    >
                      <option value="soft">soft</option>
                      <option value="era">era</option>
                      <option value="sharp">sharp</option>
                      <option value="organic">organic</option>
                    </select>
                  </SettingsField>
                  <SettingsField label="Density" hint="Tight vs airy workspace grid." htmlFor="wb-density">
                    <select
                      id="wb-density"
                      value={workspaceDensity}
                      onChange={(e) => setWorkspaceDensity(e.target.value as WorkspaceDensity)}
                      className="mt-2 w-full rounded-lg border-2 border-zinc-300 bg-transparent px-3 py-2 text-sm font-semibold dark:border-zinc-600"
                    >
                      <option value="cozy">cozy</option>
                      <option value="comfortable">comfortable</option>
                      <option value="spacious">spacious</option>
                    </select>
                  </SettingsField>
                  <SettingsField label="Shadow weight" hint="Card lift on the main grid." htmlFor="wb-chrome">
                    <select
                      id="wb-chrome"
                      value={chromeWeight}
                      onChange={(e) => setChromeWeight(e.target.value as ChromeWeight)}
                      className="mt-2 w-full rounded-lg border-2 border-zinc-300 bg-transparent px-3 py-2 text-sm font-semibold dark:border-zinc-600"
                    >
                      <option value="light">light</option>
                      <option value="standard">standard</option>
                      <option value="heavy">heavy</option>
                    </select>
                  </SettingsField>
                  <SettingsField
                    label="Sidebar placement"
                    hint="Campaign column side on large screens."
                    htmlFor="wb-side-p"
                  >
                    <select
                      id="wb-side-p"
                      value={sidebarPlacement}
                      onChange={(e) => setSidebarPlacement(e.target.value as SidebarPlacement)}
                      className="mt-2 w-full rounded-lg border-2 border-zinc-300 bg-transparent px-3 py-2 text-sm font-semibold dark:border-zinc-600"
                    >
                      <option value="auto">Auto — palette default</option>
                      <option value="left">Force left column</option>
                      <option value="right">Force right column</option>
                    </select>
                  </SettingsField>
                  <SettingsField
                    label="Sidebar width"
                    hint="Only when sidebar is not Auto. Clears saved UI preset when changed."
                    htmlFor="wb-side-w"
                  >
                    <select
                      id="wb-side-w"
                      value={sidebarWidth}
                      onChange={(e) => {
                        setSidebarWidth(e.target.value as SidebarWidthPreset)
                        setActiveUiPresetId(null)
                      }}
                      className="mt-2 w-full rounded-lg border-2 border-zinc-300 bg-transparent px-3 py-2 text-sm font-semibold dark:border-zinc-600"
                    >
                      <option value="compact">Compact — 240px</option>
                      <option value="medium">Medium — 300px</option>
                      <option value="wide">Wide — 380px</option>
                    </select>
                  </SettingsField>
                  <SettingsField label="Sheet / battle density" hint="Compact hides fluff on sheet and cards." htmlFor="wb-comp">
                    <div className="mt-2 flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={compactCreator}
                          onChange={(e) => setCompactCreator(e.target.checked)}
                        />
                        Compact sheet editor
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={compactBattle}
                          onChange={(e) => setCompactBattle(e.target.checked)}
                        />
                        Compact battle cards
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={mergeGeneratedAttacks}
                          onChange={(e) => setMergeGeneratedAttacks(e.target.checked)}
                        />
                        Merge generated attacks on re-gen
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={uiSoundsEnabled}
                          onChange={(e) => setUiSoundsEnabled(e.target.checked)}
                        />
                        UI click sounds
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={persistThemePerAccount}
                          onChange={(e) => setPersistThemePerAccount(e.target.checked)}
                        />
                        Remember theme per account
                      </label>
                    </div>
                  </SettingsField>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-zinc-300 bg-zinc-100/50 p-4 dark:border-zinc-600 dark:bg-zinc-900/40">
                <h3 className="ecs-ui-section-title text-zinc-500 dark:text-zinc-400">
                  Experiments (flags)
                </h3>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Inspired by Chrome flags: optional developer-only toggles that may change diagnostics and behavior.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={devLabFlags.showUiBounds}
                      onChange={(event) =>
                        setDevLabFlags((prev) => ({
                          ...prev,
                          showUiBounds: event.target.checked
                        }))
                      }
                    />
                    Show UI bounds overlay
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={devLabFlags.forceReducedMotion}
                      onChange={(event) =>
                        setDevLabFlags((prev) => ({
                          ...prev,
                          forceReducedMotion: event.target.checked
                        }))
                      }
                    />
                    Force reduced motion preview
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={devLabFlags.verboseActivityFeed}
                      onChange={(event) =>
                        setDevLabFlags((prev) => ({
                          ...prev,
                          verboseActivityFeed: event.target.checked
                        }))
                      }
                    />
                    Verbose activity feed labels
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={devLabFlags.enableCommandPalette}
                      onChange={(event) =>
                        setDevLabFlags((prev) => ({
                          ...prev,
                          enableCommandPalette: event.target.checked
                        }))
                      }
                    />
                    Enable dev command palette (Cmd/Ctrl + K)
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-zinc-300 bg-zinc-100/50 p-4 dark:border-zinc-600 dark:bg-zinc-900/40">
                <h3 className="ecs-ui-section-title text-zinc-500 dark:text-zinc-400">
                  Source files — copy path
                </h3>
                <ul className="mt-3 grid gap-2 md:grid-cols-2">
                  {DEV_FILE_SHORTCUTS.map((row) => (
                    <li
                      key={row.path}
                      className="flex flex-col gap-1 rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-950"
                    >
                      <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{row.label}</div>
                      <code className="break-all text-xs font-mono text-amber-800 dark:text-amber-300">{row.path}</code>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">{row.note}</div>
                      <button
                        type="button"
                        className="ecs-interactive mt-1 self-start rounded-lg border-2 border-zinc-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide hover:bg-zinc-100 dark:border-zinc-500 dark:hover:bg-zinc-800"
                        onClick={() => {
                          void navigator.clipboard.writeText(row.path)
                          setAppMessage(`Copied ${row.path}`)
                        }}
                      >
                        Copy path
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {activeTab === 'overview' ? (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  App
                </h3>
                <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="font-semibold text-slate-500">Workspace tab</dt>
                  <dd className="font-mono">{workspaceTab}</dd>
                  <dt className="font-semibold text-slate-500">Active account</dt>
                  <dd className="truncate font-mono">{activeAccountId ?? '—'}</dd>
                  <dt className="font-semibold text-slate-500">Color scheme</dt>
                  <dd className="font-mono">{colorScheme}</dd>
                  <dt className="font-semibold text-slate-500">Theme layout</dt>
                  <dd className="font-mono">{useThemeLayout ? 'themed' : 'default'}</dd>
                  <dt className="font-semibold text-slate-500">Theme mode</dt>
                  <dd className="font-mono">{themeMode}</dd>
                  <dt className="font-semibold text-slate-500">Rules mode</dt>
                  <dd className="font-mono">{rulesMode}</dd>
                  <dt className="font-semibold text-slate-500">Corners</dt>
                  <dd className="font-mono">{cornerStyle}</dd>
                  <dt className="font-semibold text-slate-500">Chrome</dt>
                  <dd className="font-mono">{chromeWeight}</dd>
                  <dt className="font-semibold text-slate-500">Density</dt>
                  <dd className="font-mono">{workspaceDensity}</dd>
                  <dt className="font-semibold text-slate-500">Sidebar</dt>
                  <dd className="font-mono">
                    {sidebarPlacement}
                    {sidebarPlacement !== 'auto' ? ` / ${sidebarWidth}` : ''}
                  </dd>
                  <dt className="font-semibold text-slate-500">Region flow</dt>
                  <dd className="font-mono">{workspaceFlow.join(' → ')}</dd>
                  <dt className="font-semibold text-slate-500">Flow custom</dt>
                  <dd className="font-mono">{regionFlowCustom ? 'yes' : 'no'}</dd>
                  <dt className="font-semibold text-slate-500">Layout edit</dt>
                  <dd className="font-mono">{layoutEditMode ? 'on' : 'off'}</dd>
                  <dt className="font-semibold text-slate-500">UI preset</dt>
                  <dd className="truncate font-mono">{activeUiPresetId ?? '—'}</dd>
                </dl>
              </div>
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Counts
                </h3>
                <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="font-semibold text-slate-500">Characters</dt>
                  <dd className="font-mono">{characters.length}</dd>
                  <dt className="font-semibold text-slate-500">Campaigns</dt>
                  <dd className="font-mono">{campaigns.length}</dd>
                  <dt className="font-semibold text-slate-500">Campaign members</dt>
                  <dd className="font-mono">{campaignMembers.length}</dd>
                  <dt className="font-semibold text-slate-500">Battle participants</dt>
                  <dd className="font-mono">{battleParticipants.length}</dd>
                  <dt className="font-semibold text-slate-500">Encounter round</dt>
                  <dd className="font-mono">{encounterRound}</dd>
                </dl>
              </div>
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Shortcuts
                </h3>
                <ul className="mt-1 space-y-0.5 text-xs">
                  <li>
                    <span className="font-mono">⌘ ⌥ I</span>
                    <span className="ml-2 text-slate-500">— open Chrome DevTools</span>
                  </li>
                  <li>
                    <span className="font-mono">F12</span>
                    <span className="ml-2 text-slate-500">— same on Linux / Windows</span>
                  </li>
                  <li>
                    <span className="font-mono">⌘ R / Ctrl R</span>
                    <span className="ml-2 text-slate-500">— hard reload renderer</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          {activeTab === 'state' ? (
            <div>
              <p className="text-xs text-slate-500">
                Live snapshot of current renderer state. Useful when reproducing a bug.
              </p>
              <pre className="mt-2 max-h-[55vh] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-950">
{stateSnapshot}
              </pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(stateSnapshot)
                  setAppMessage('State snapshot copied to clipboard.')
                }}
                className="mt-2 ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
              >
                Copy as JSON
              </button>
            </div>
          ) : null}

          {activeTab === 'theme' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Force any theme without leaving this dialog. Changes apply immediately.
              </p>
              <SettingsField
                label="Color scheme"
                hint="Override the visual era from one place — no need to scroll the picker."
                htmlFor="dev-scheme"
              >
                <select
                  id="dev-scheme"
                  value={colorScheme}
                  onChange={(event) => setColorScheme(event.target.value as ColorScheme)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                >
                  {availableThemeChoices.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.id} ({row.title})
                    </option>
                  ))}
                </select>
              </SettingsField>
              <SettingsField
                label="Layout"
                hint="Themed reshapes the page; default keeps the standard sidebar-left layout."
                htmlFor="dev-layout"
              >
                <select
                  id="dev-layout"
                  value={useThemeLayout ? 'themed' : 'default'}
                  onChange={(event) => setUseThemeLayout(event.target.value === 'themed')}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                >
                  <option value="themed">themed</option>
                  <option value="default">default (no layout shift)</option>
                </select>
              </SettingsField>
              <SettingsField
                label="Light / dark"
                hint="Force light or dark regardless of OS preference."
                htmlFor="dev-mode"
              >
                <select
                  id="dev-mode"
                  value={themeMode}
                  onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                >
                  <option value="system">system</option>
                  <option value="light">light</option>
                  <option value="dark">dark</option>
                </select>
              </SettingsField>
              <SettingsField
                label="Rules mode"
                hint="Switch the editor between TTRPG (freeform) and DnD (5e SRD-aligned) without restart."
                htmlFor="dev-rules"
              >
                <select
                  id="dev-rules"
                  value={rulesMode}
                  onChange={(event) => setRulesMode(event.target.value as RulesMode)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                >
                  <option value="ttrpg">ttrpg</option>
                  <option value="dnd">dnd</option>
                </select>
              </SettingsField>

              <div className="rounded-md border border-sky-200 bg-sky-50/80 p-3 text-xs text-slate-700 dark:border-sky-500/30 dark:bg-sky-950/20 dark:text-slate-200">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                  Source cue
                </div>
                <p className="mt-1 leading-snug">{activeThemeRef.cue}</p>
                <a
                  href={activeThemeRef.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded border border-sky-300 px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-400/35 dark:text-sky-200 dark:hover:bg-sky-900/40"
                >
                  Source: {activeThemeRef.sourceLabel}
                </a>
              </div>
            </div>
          ) : null}

          {activeTab === 'storage' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Browser-side persisted preferences. Clearing wipes UI prefs only — your characters
                and campaigns live in the app database.
              </p>
              {storageKeys.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
                  localStorage is empty.
                </div>
              ) : (
                <ul className="max-h-[45vh] space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 text-[11px] dark:border-slate-700">
                  {storageKeys.map((entry) => (
                    <li key={entry.key} className="rounded border border-slate-100 px-2 py-1 dark:border-slate-800">
                      <div className="font-mono font-semibold">{entry.key}</div>
                      <div className="truncate font-mono text-slate-500">{entry.value || '(empty)'}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Clear ECS UI preferences in localStorage? Reload to re-apply defaults.')) {
                      const removed: string[] = []
                      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
                        const key = window.localStorage.key(i)
                        if (!key) continue
                        if (!key.startsWith('ecs_') && !key.startsWith('ecs.')) continue
                        window.localStorage.removeItem(key)
                        removed.push(key)
                      }
                      setAppMessage(`Cleared ${removed.length} ECS localStorage keys. Reload to apply defaults.`)
                      const collected: { key: string; value: string }[] = []
                      for (let i = 0; i < window.localStorage.length; i += 1) {
                        const key = window.localStorage.key(i)
                        if (!key) continue
                        const value = window.localStorage.getItem(key) ?? ''
                        collected.push({ key, value: value.length > 200 ? `${value.slice(0, 200)}…` : value })
                      }
                      setStorageKeys(collected.sort((a, b) => a.key.localeCompare(b.key)))
                    }
                  }}
                  className="ecs-interactive rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  Clear ECS localStorage
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  Reload renderer
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'data' ? (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Seed sample data
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Create the six Toa as level-5 sample characters with attack keywords pre-set.
                  Useful for testing campaign sharing, the battle board, or attack generation.
                </p>
                <button
                  type="button"
                  onClick={() => void seedSampleCharacters()}
                  disabled={seedBusy || !activeAccountId}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold uppercase text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {seedBusy ? 'Seeding…' : 'Seed 6 Toa characters'}
                </button>
              </div>
              <div className="rounded-md border border-rose-200 p-3 dark:border-rose-500/40">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
                  Danger zone
                </h3>
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-300/80">
                  Delete every character on this account. This cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={() => void deleteAllCharacters()}
                  disabled={characters.length === 0}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-300 px-3 py-1.5 text-xs font-bold uppercase text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  Delete all {characters.length} characters
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'strings' ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <header className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-700 dark:text-zinc-200">
                      UI copy
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Edit any label in the signed-in shell. Changes save to{' '}
                      <code className="rounded bg-zinc-200 px-1 font-mono text-[11px] dark:bg-zinc-800">localStorage</code>{' '}
                      on this machine and apply everywhere instantly. Empty a field to restore the default.
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      overriddenCopyCount > 0
                        ? 'border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-400 dark:bg-amber-500/20 dark:text-amber-100'
                        : 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    )}
                  >
                    {overriddenCopyCount > 0
                      ? `${overriddenCopyCount} of ${UI_COPY_KEYS.length} overridden`
                      : `${UI_COPY_KEYS.length} default`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative min-w-[12rem] flex-1">
                    <span className="sr-only">Filter UI copy keys</span>
                    <span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400">
                      🔍
                    </span>
                    <input
                      value={copyFilter}
                      onChange={(event) => setCopyFilter(event.target.value)}
                      placeholder="Filter by key, label, or text…"
                      className="w-full rounded-lg border-2 border-zinc-300 bg-white py-1.5 pl-7 pr-2 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                    />
                  </label>
                  <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={copyShowOverriddenOnly}
                      onChange={(event) => setCopyShowOverriddenOnly(event.target.checked)}
                      className="h-3.5 w-3.5 accent-amber-600"
                    />
                    Overridden only
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={overriddenCopyCount === 0}
                    onClick={() => {
                      if (overriddenCopyCount === 0) return
                      if (
                        !window.confirm(
                          `Reset all ${overriddenCopyCount} overridden ${overriddenCopyCount === 1 ? 'string' : 'strings'} to defaults?`
                        )
                      )
                        return
                      clearUiCopyOverrides()
                      setUiCopyOverrides({})
                      setAppMessage('All UI copy reset to built-in defaults.')
                    }}
                    className="ecs-interactive rounded-lg border-2 border-rose-400 px-3 py-1.5 text-[11px] font-bold uppercase text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500 dark:text-rose-200 dark:hover:bg-rose-500/15"
                  >
                    Reset all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(JSON.stringify(uiCopyOverrides, null, 2))
                      setAppMessage('Exported overrides JSON to clipboard.')
                    }}
                    className="ecs-interactive rounded-lg border-2 border-zinc-400 px-3 py-1.5 text-[11px] font-bold uppercase text-zinc-800 hover:bg-zinc-100 dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Copy JSON
                  </button>
                  <button
                    type="button"
                    aria-expanded={showCopyImport}
                    onClick={() => setShowCopyImport((v) => !v)}
                    className="ecs-interactive rounded-lg border-2 border-zinc-400 px-3 py-1.5 text-[11px] font-bold uppercase text-zinc-800 hover:bg-zinc-100 dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {showCopyImport ? 'Hide import' : 'Import JSON'}
                  </button>
                </div>
                {showCopyImport ? (
                  <div className="rounded-lg border-2 border-zinc-300 bg-zinc-50 p-2 dark:border-zinc-600 dark:bg-zinc-900/60">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      Paste JSON object
                    </label>
                    <textarea
                      value={copyImportText}
                      onChange={(event) => {
                        setCopyImportText(event.target.value)
                        if (copyImportError) setCopyImportError(null)
                      }}
                      rows={4}
                      placeholder='{"app.productTitle": "My title"}'
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    />
                    {copyImportError ? (
                      <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-300">{copyImportError}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          let parsed: unknown
                          try {
                            parsed = JSON.parse(copyImportText)
                          } catch (err) {
                            setCopyImportError(`Invalid JSON: ${(err as Error).message}`)
                            return
                          }
                          const result = mergeUiCopyOverrides(uiCopyOverrides, parsed)
                          setUiCopyOverrides(result.next)
                          setCopyImportText('')
                          setCopyImportError(null)
                          setShowCopyImport(false)
                          setAppMessage(
                            `Imported ${result.applied} ${result.applied === 1 ? 'value' : 'values'}` +
                              (result.skipped > 0 ? ` (skipped ${result.skipped} unknown).` : '.')
                          )
                        }}
                        disabled={copyImportText.trim().length === 0}
                        className="rounded-md border-2 border-zinc-500 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-400 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCopyImportText('')
                          setCopyImportError(null)
                          setShowCopyImport(false)
                        }}
                        className="rounded-md border-2 border-zinc-300 bg-transparent px-2.5 py-1 text-[10px] font-bold uppercase text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </header>

              {(() => {
                const filterText = copyFilter.trim().toLowerCase()
                const matches = (key: UiCopyKey): boolean => {
                  const isOverridden = typeof uiCopyOverrides[key] === 'string' && uiCopyOverrides[key]!.trim().length > 0
                  if (copyShowOverriddenOnly && !isOverridden) return false
                  if (!filterText) return true
                  const meta = UI_COPY_META[key]
                  const haystack = `${key} ${meta.label} ${meta.description} ${UI_COPY_DEFAULTS[key]} ${uiCopyOverrides[key] ?? ''}`.toLowerCase()
                  return haystack.includes(filterText)
                }
                const groupsWithItems = UI_COPY_GROUPS.map((group) => ({
                  group,
                  keys: UI_COPY_KEYS.filter((key) => UI_COPY_META[key].group === group.id && matches(key))
                })).filter((g) => g.keys.length > 0)
                if (groupsWithItems.length === 0) {
                  return (
                    <p className="rounded-lg border-2 border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                      No strings match this filter.
                    </p>
                  )
                }
                return (
                  <div className="space-y-5">
                    {groupsWithItems.map(({ group, keys }) => (
                      <section key={group.id} className="space-y-2">
                        <div className="border-b border-zinc-300 pb-1 dark:border-zinc-700">
                          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-300">
                            {group.title}{' '}
                            <span className="ml-1 font-mono text-[10px] font-medium normal-case tracking-normal text-zinc-400">
                              ({keys.length})
                            </span>
                          </h4>
                          <p className="mt-0.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-500">
                            {group.blurb}
                          </p>
                        </div>
                        <ul className="space-y-3">
                          {keys.map((key) => {
                            const meta = UI_COPY_META[key]
                            const overrideValue = uiCopyOverrides[key]
                            const isOverridden = typeof overrideValue === 'string' && overrideValue.trim().length > 0
                            const value = isOverridden ? overrideValue! : ''
                            const useTextarea = isMultilineKey(key)
                            const inputClass =
                              'w-full rounded-md border-2 bg-white px-2.5 py-1.5 text-sm leading-snug text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 ' +
                              (isOverridden
                                ? 'border-amber-500 dark:border-amber-400'
                                : 'border-zinc-300 dark:border-zinc-600')
                            return (
                              <li
                                key={key}
                                className={cn(
                                  'rounded-xl border-2 p-3 transition-colors',
                                  isOverridden
                                    ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10'
                                    : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                                )}
                              >
                                <label className="block">
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100">
                                        {meta.label}
                                      </span>
                                      <span className="ml-2 font-mono text-[10px] text-zinc-400">{key}</span>
                                    </div>
                                    {isOverridden ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setUiCopyOverrides((prev) => {
                                            const next = { ...prev }
                                            delete next[key]
                                            return next
                                          })
                                        }
                                        className="shrink-0 rounded-md border border-amber-500 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 hover:bg-amber-100 dark:border-amber-400 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-500/20"
                                      >
                                        Reset
                                      </button>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                                    {meta.description}
                                  </p>
                                  {useTextarea ? (
                                    <textarea
                                      value={value}
                                      onChange={(event) => {
                                        const v = event.target.value
                                        setUiCopyOverrides((prev) => {
                                          const next = { ...prev }
                                          if (v.trim() === '') delete next[key]
                                          else next[key] = v
                                          return next
                                        })
                                      }}
                                      placeholder={UI_COPY_DEFAULTS[key]}
                                      rows={Math.min(5, 2 + Math.ceil(UI_COPY_DEFAULTS[key].length / 80))}
                                      className={cn('mt-2', inputClass)}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={value}
                                      onChange={(event) => {
                                        const v = event.target.value
                                        setUiCopyOverrides((prev) => {
                                          const next = { ...prev }
                                          if (v.trim() === '') delete next[key]
                                          else next[key] = v
                                          return next
                                        })
                                      }}
                                      placeholder={UI_COPY_DEFAULTS[key]}
                                      className={cn('mt-2', inputClass)}
                                    />
                                  )}
                                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                                    <span className="truncate">
                                      Default:{' '}
                                      <span className="text-zinc-500 dark:text-zinc-500">
                                        {UI_COPY_DEFAULTS[key]}
                                      </span>
                                    </span>
                                    {isOverridden ? (
                                      <span className="shrink-0 font-mono">
                                        {value.length} / default {UI_COPY_DEFAULTS[key].length}
                                      </span>
                                    ) : null}
                                  </div>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )
              })()}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export default function App(): JSX.Element {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseThemeMode(g?.themeMode) ?? 'system'
  })
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseColorScheme(g?.colorScheme)
  })
  const [useThemeLayout, setUseThemeLayout] = useState<boolean>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return typeof g?.useThemeLayout === 'boolean' ? g.useThemeLayout : true
  })
  const [cornerStyle, setCornerStyle] = useState<CornerStyle>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseCornerStyle(g?.cornerStyle, g?.useSoftCorners)
  })
  const [chromeWeight, setChromeWeight] = useState<ChromeWeight>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseChromeWeight(g?.chromeWeight)
  })
  const [sidebarPlacement, setSidebarPlacement] = useState<SidebarPlacement>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseSidebarPlacement(g?.sidebarPlacement)
  })
  const [sidebarWidth, setSidebarWidth] = useState<SidebarWidthPreset>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseSidebarWidth(g?.sidebarWidth)
  })
  const [workspaceDensity, setWorkspaceDensity] = useState<WorkspaceDensity>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return parseWorkspaceDensity(g?.workspaceDensity)
  })
  const [regionFlowCustom, setRegionFlowCustom] = useState<boolean>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return g?.regionFlowCustom === true
  })
  const [workspaceFlow, setWorkspaceFlow] = useState<WorkspaceFlowRegion[]>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    if (g?.regionFlowCustom === true) return normalizeWorkspaceFlow(g.workspaceFlow)
    return themedWorkspaceFlowDefault(
      parseColorScheme(g?.colorScheme),
      typeof g?.useThemeLayout === 'boolean' ? g.useThemeLayout : true
    )
  })
  const [activeUiPresetId, setActiveUiPresetId] = useState<string | null>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return typeof g?.activeUiPresetId === 'string' ? g.activeUiPresetId : null
  })
  const [layoutEditMode, setLayoutEditMode] = useState(false)
  const [layoutPanelDragFrom, setLayoutPanelDragFrom] = useState<WorkspaceFlowRegion | null>(null)
  const [layoutPanelDropOver, setLayoutPanelDropOver] = useState<WorkspaceFlowRegion | null>(null)
  const [layoutA11yMessage, setLayoutA11yMessage] = useState('')
  const layoutFlowAnnouncedRef = useRef<string>('')
  const [uiPresets, setUiPresets] = useState<UiLayoutPreset[]>(() =>
    typeof window !== 'undefined' ? loadUiPresets() : []
  )
  const [newPresetDraftName, setNewPresetDraftName] = useState('My layout')
  const [mergeGeneratedAttacks, setMergeGeneratedAttacks] = useState<boolean>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return typeof g?.mergeGeneratedAttacks === 'boolean' ? g.mergeGeneratedAttacks : false
  })
  const [persistThemePerAccount, setPersistThemePerAccount] = useState<boolean>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return typeof g?.persistThemePerAccount === 'boolean' ? g.persistThemePerAccount : true
  })
  const [uiSoundsEnabled, setUiSoundsEnabled] = useState<boolean>(() => {
    const g = typeof window !== 'undefined' ? readStoredAppearance(GUEST_APPEARANCE_KEY) : null
    return typeof g?.uiSoundsEnabled === 'boolean' ? g.uiSoundsEnabled : false
  })
  const [startupSplashDurationMs, setStartupSplashDurationMs] = useState<number>(() => {
    if (typeof window === 'undefined') return 3000
    try {
      return parseStartupSplashDuration(window.localStorage.getItem(STARTUP_SPLASH_DURATION_KEY))
    } catch {
      return 3000
    }
  })
  const [systemDark, setSystemDark] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(REMEMBER_LOGIN_KEY) === '1'
    } catch {
      return false
    }
  })
  const [prefsHydrated, setPrefsHydrated] = useState(false)
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [devPassword, setDevPassword] = useState('')
  const [activeAccountEmail, setActiveAccountEmail] = useState<string | null>(null)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [devLabFlags, setDevLabFlags] = useState<DevLabFlags>(() => loadDevLabFlags())
  const [showDevCommandPalette, setShowDevCommandPalette] = useState(false)
  const [devCommandQuery, setDevCommandQuery] = useState('')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ phase: 'idle' })
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState<number | null>(null)
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(UPDATE_PROMPT_DISMISSED_KEY)
    } catch {
      return null
    }
  })
  const [legacyInstallPaths, setLegacyInstallPaths] = useState<string[]>([])
  const [dismissLegacyCleanupPrompt, setDismissLegacyCleanupPrompt] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(LEGACY_INSTALL_PROMPT_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const updaterApiAvailable =
    typeof backend.appApi.updateStatus === 'function' &&
    typeof backend.appApi.updateCheck === 'function' &&
    typeof backend.appApi.updateDownload === 'function' &&
    typeof backend.appApi.updateInstall === 'function' &&
    typeof backend.appApi.onUpdateStatus === 'function'
  const legacyInstallApiAvailable =
    typeof backend.appApi.getLegacyInstalls === 'function' && typeof backend.appApi.openPath === 'function'
  const devUnlockTapCountRef = useRef(0)
  const [devPanelTab, setDevPanelTab] = useState<DevPanelTab>(() => {
    if (typeof window === 'undefined') return 'workbench'
    const stored = window.localStorage.getItem('ecs_dev_panel_tab')
    const valid: DevPanelTab[] = ['workbench', 'overview', 'state', 'storage', 'theme', 'data', 'strings']
    return (valid as string[]).includes(stored ?? '') ? (stored as DevPanelTab) : 'workbench'
  })
  const [uiCopyOverrides, setUiCopyOverrides] = useState<UiCopyOverrides>(() =>
    typeof window !== 'undefined' ? loadUiCopyOverrides() : {}
  )
  const [resetToken, setResetToken] = useState('')
  const [newResetPassword, setNewResetPassword] = useState('')
  const [resetTokenHint, setResetTokenHint] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null)
  const [showAdvancedAuthTools, setShowAdvancedAuthTools] = useState(false)
  const [beeThemeUnlocked, setBeeThemeUnlocked] = useState(() => readBeeThemeUnlocked())
  const [secretCodeInput, setSecretCodeInput] = useState('')
  const [secretCodeHint, setSecretCodeHint] = useState<string | null>(null)
  const authBootstrapDoneRef = useRef(false)

  const applyColorSchemeSelection = useCallback(
    (next: ColorScheme): void => {
      setColorScheme(next)
      const autoMode = AUTO_THEME_MODE_BY_SCHEME[next]
      if (autoMode) setThemeMode(autoMode)
    },
    []
  )

  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [campaignMembers, setCampaignMembers] = useState<{ id: string; displayName: string; email: string }[]>(
    []
  )
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [campaignAddMode, setCampaignAddMode] = useState<'create' | 'join'>('create')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('home')

  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditableCharacter>(emptyCharacter())
  const [keywordText, setKeywordText] = useState('')
  const [manualAttackDraft, setManualAttackDraft] = useState<ManualAttackDraft>(() => emptyManualAttackDraft())
  const [search, setSearch] = useState('')
  const [factionFilter, setFactionFilter] = useState<string>('all')
  const [appMessage, setAppMessage] = useState<string | null>(null)
  const [guidedSetup, setGuidedSetup] = useState(true)
  const [compactCreator, setCompactCreator] = useState(true)
  const [compactBattle, setCompactBattle] = useState(true)
  const [rulesMode, setRulesMode] = useState<RulesMode>('ttrpg')
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const [settingsPanelPos, setSettingsPanelPos] = useState<{ top: number; left: number } | null>(null)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const themeMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [themeMenuPos, setThemeMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickStep, setQuickStep] = useState<1 | 2 | 3 | 4>(1)
  const [quickName, setQuickName] = useState('')
  const [quickHp, setQuickHp] = useState(30)
  const [quickArmor, setQuickArmor] = useState(10)
  const [quickLevel, setQuickLevel] = useState(1)
  const [quickFaction, setQuickFaction] = useState('')
  const [quickClass, setQuickClass] = useState<(typeof DND_CLASSES)[number]>('Fighter')
  const [quickSubclass, setQuickSubclass] = useState('')
  const [quickPreset, setQuickPreset] = useState<QuickPreset>('frontliner')
  const [quickDescription, setQuickDescription] = useState('')
  const [showAdvancedCharacterFields, setShowAdvancedCharacterFields] = useState(false)
  const [battleDrafts, setBattleDrafts] = useState<Record<string, BattleDraft>>({})
  const [battleParticipants, setBattleParticipants] = useState<string[]>([])
  const [dragCharacterId, setDragCharacterId] = useState<string | null>(null)
  const [showFirstDragHint, setShowFirstDragHint] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem(DRAG_HINT_DISMISSED_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [encounterRound, setEncounterRound] = useState(1)
  const [activeTurnIndex, setActiveTurnIndex] = useState(0)
  const [syncBanner, setSyncBanner] = useState<string | null>(null)
  const syncBannerClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activityFeed, setActivityFeed] = useState<ActivityFeedEntry[]>([])
  const isApplyingRemoteBattleState = useRef(false)
  const appearanceAccountHydrated = useRef<string | null>(null)
  const isDevAccount = activeAccountEmail?.toLowerCase() === DEV_ACCOUNT_EMAIL
  const openThemeMenu = useCallback(() => {
    setShowSettingsMenu(false)
    setUiPresets(loadUiPresets())
    setShowThemeMenu(true)
  }, [])
  const applyProfessionalUiPreset = useCallback((preset: ProfessionalUiPreset) => {
    const s = preset.settings
    setColorScheme(s.colorScheme)
    setThemeMode(s.themeMode)
    setUseThemeLayout(s.useThemeLayout)
    setCornerStyle(s.cornerStyle)
    setChromeWeight(s.chromeWeight)
    setWorkspaceDensity(s.workspaceDensity)
    setSidebarPlacement(s.sidebarPlacement)
    setSidebarWidth(s.sidebarWidth)
    setActiveUiPresetId(null)
    setRegionFlowCustom(false)
    setWorkspaceFlow(themedWorkspaceFlowDefault(s.colorScheme, s.useThemeLayout))
    setAppMessage(`Applied ${preset.title} UI preset.`)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handle = window.setTimeout(() => persistUiCopyOverrides(uiCopyOverrides), 200)
    return () => window.clearTimeout(handle)
  }, [uiCopyOverrides])

  useEffect(() => {
    if (typeof window === 'undefined') return
    function onStorage(event: StorageEvent): void {
      if (event.key !== UI_COPY_STORAGE_KEY) return
      setUiCopyOverrides(loadUiCopyOverrides())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('ecs_dev_panel_tab', devPanelTab)
    } catch {
      // ignore quota / private mode
    }
  }, [devPanelTab])

  useEffect(() => {
    if (!prefsHydrated) return
    if (typeof window === 'undefined') return
    try {
      if (rememberLogin) window.localStorage.setItem(REMEMBER_LOGIN_KEY, '1')
      else window.localStorage.removeItem(REMEMBER_LOGIN_KEY)
    } catch {
      // ignore localStorage write issues
    }
    void backend.appApi.setPrefs({ [PREF_REMEMBER_LOGIN]: rememberLogin ? '1' : '0' }).catch(() => {
      // ignore IPC persistence failures; localStorage fallback still applies
    })
  }, [rememberLogin, prefsHydrated])

  useEffect(() => {
    if (!updaterApiAvailable) return
    let cancelled = false
    void backend.appApi
      .getPrefs([PREF_REMEMBER_LOGIN, PREF_GUEST_APPEARANCE])
      .then((prefs) => {
        if (cancelled) return
        const rememberPref = prefs[PREF_REMEMBER_LOGIN]
        if (rememberPref === '1' || rememberPref === '0') {
          setRememberLogin(rememberPref === '1')
        }
        const appearanceRaw = prefs[PREF_GUEST_APPEARANCE]
        if (typeof appearanceRaw !== 'string') return
        let guest: StoredAppearanceV1 | null = null
        try {
          const parsed = JSON.parse(appearanceRaw) as unknown
          if (parsed && typeof parsed === 'object') guest = parsed as StoredAppearanceV1
        } catch {
          guest = null
        }
        if (!guest) return
        if (guest.colorScheme) setColorScheme(parseColorScheme(guest.colorScheme))
        const tm = parseThemeMode(guest.themeMode)
        if (tm) setThemeMode(tm)
        if (typeof guest.useThemeLayout === 'boolean') setUseThemeLayout(guest.useThemeLayout)
        setCornerStyle(parseCornerStyle(guest.cornerStyle, guest.useSoftCorners))
        setChromeWeight(parseChromeWeight(guest.chromeWeight))
        setSidebarPlacement(parseSidebarPlacement(guest.sidebarPlacement))
        setSidebarWidth(parseSidebarWidth(guest.sidebarWidth))
        const cs = parseColorScheme(guest.colorScheme)
        const tl = typeof guest.useThemeLayout === 'boolean' ? guest.useThemeLayout : true
        const flowCustom = guest.regionFlowCustom === true
        setRegionFlowCustom(flowCustom)
        setWorkspaceFlow(flowCustom ? normalizeWorkspaceFlow(guest.workspaceFlow) : themedWorkspaceFlowDefault(cs, tl))
        setActiveUiPresetId(typeof guest.activeUiPresetId === 'string' ? guest.activeUiPresetId : null)
        if (typeof guest.mergeGeneratedAttacks === 'boolean') setMergeGeneratedAttacks(guest.mergeGeneratedAttacks)
        if (typeof guest.persistThemePerAccount === 'boolean') setPersistThemePerAccount(guest.persistThemePerAccount)
        if (typeof guest.uiSoundsEnabled === 'boolean') setUiSoundsEnabled(guest.uiSoundsEnabled)
      })
      .catch(() => {
        // keep localStorage/browser fallback only
      })
      .finally(() => {
        if (!cancelled) setPrefsHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [updaterApiAvailable])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STARTUP_SPLASH_DURATION_KEY, String(startupSplashDurationMs))
    } catch {
      // ignore localStorage write issues
    }
  }, [startupSplashDurationMs])

  useEffect(() => {
    if (!prefsHydrated) return
    if (authBootstrapDoneRef.current) return
    authBootstrapDoneRef.current = true
    let cancelled = false
    void (async () => {
      try {
        if (!rememberLogin) {
          await backend.authApi.logout()
          return
        }
        const activeId = await backend.accountApi.getActive()
        if (!activeId || cancelled) return
        const accounts = await backend.accountApi.list()
        if (cancelled) return
        const account = accounts.find((row) => row.id === activeId)
        if (!account) return
        setIsAuthed(true)
        setActiveAccountId(account.id)
        setActiveAccountEmail(account.email)
        setAuthEmail(account.email)
        setWorkspaceTab('home')
        setAuthMessage(null)
      } catch {
        // if bootstrap fails, keep the normal login screen
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rememberLogin, prefsHydrated])

  useEffect(() => {
    if (!showDevPanel) return
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      setShowDevPanel(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDevPanel])

  useEffect(() => {
    if (!appMessage) return
    const handle = window.setTimeout(() => setAppMessage(null), 4000)
    return () => window.clearTimeout(handle)
  }, [appMessage])

  const t = useCallback((key: UiCopyKey) => resolveUiCopy(uiCopyOverrides, key), [uiCopyOverrides])

  const handleBuildStampTap = useCallback(() => {
    if (showAdvancedAuthTools) return
    devUnlockTapCountRef.current += 1
    if (devUnlockTapCountRef.current < 7) return
    devUnlockTapCountRef.current = 0
    setShowAdvancedAuthTools(true)
    setAuthMode('dev')
    setAuthMessage('Access mode enabled.')
  }, [showAdvancedAuthTools])

  useEffect(() => {
    if (typeof window === 'undefined') return
    void backend.appApi
      .getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => setAppVersion(null))
  }, [])

  useEffect(() => {
    let cancelled = false
    void backend.appApi
      .updateStatus()
      .then((payload) => {
        if (!cancelled) setUpdateStatus(payload)
      })
      .catch(() => {
        // ignore updater bootstrap failures
      })
    const off = backend.appApi.onUpdateStatus((payload) => setUpdateStatus(payload))
    return () => {
      cancelled = true
      off()
    }
  }, [])

  useEffect(() => {
    if (updateStatus.phase !== 'error' || !updateStatus.message) return
    setAppMessage(updateStatus.message)
  }, [updateStatus])

  useEffect(() => {
    if (updateStatus.phase === 'checking') setLastUpdateCheckAt(Date.now())
  }, [updateStatus.phase])

  useEffect(() => {
    if (!legacyInstallApiAvailable) return
    void backend.appApi
      .getLegacyInstalls()
      .then((payload) => setLegacyInstallPaths(Array.isArray(payload.paths) ? payload.paths : []))
      .catch(() => setLegacyInstallPaths([]))
  }, [legacyInstallApiAvailable])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (dismissLegacyCleanupPrompt) window.localStorage.setItem(LEGACY_INSTALL_PROMPT_DISMISSED_KEY, '1')
      else window.localStorage.removeItem(LEGACY_INSTALL_PROMPT_DISMISSED_KEY)
    } catch {
      // ignore localStorage write issues
    }
  }, [dismissLegacyCleanupPrompt])

  useEffect(() => {
    if (!updaterApiAvailable) return
    const checkForUpdates = async (): Promise<void> => {
      const result: { ok: boolean; message?: string } = await backend.appApi
        .updateCheck()
        .catch(() => ({ ok: false, message: 'Unable to check for updates.' }))
      if (!result.ok && result.message) setAppMessage(result.message)
    }
    void checkForUpdates()
    const intervalId = window.setInterval(() => void checkForUpdates(), UPDATE_CHECK_MS)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void checkForUpdates()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [updaterApiAvailable])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(DEV_LAB_FLAGS_KEY, JSON.stringify(devLabFlags))
    } catch {
      // ignore quota / private mode
    }
    const root = document.documentElement
    root.dataset.ecsDebugBounds = devLabFlags.showUiBounds ? '1' : '0'
    root.dataset.ecsForceReducedMotion = devLabFlags.forceReducedMotion ? '1' : '0'
  }, [devLabFlags])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => setSystemDark(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!uiSoundsEnabled) return

    function targetIsButtonLike(el: EventTarget | null): boolean {
      if (!el || !(el instanceof Element)) return false
      const host = el.closest('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]')
      if (!host) return false
      if (host.closest('[data-ecs-no-ui-sound]')) return false
      if (host instanceof HTMLButtonElement && host.disabled) return false
      if (host instanceof HTMLInputElement && host.disabled) return false
      if (host.getAttribute('aria-disabled') === 'true') return false
      return true
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!targetIsButtonLike(event.target)) return
      playUiButtonChime(colorScheme as ChimeColorScheme)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [uiSoundsEnabled, colorScheme])

  const darkMode = themeMode === 'system' ? systemDark : themeMode === 'dark'
  const currentMonth = new Date().getMonth() + 1

  const themeSchemeMenuChoices = useMemo(
    () => [...THEME_SCHEME_CHOICES_BASE, ...(beeThemeUnlocked ? [BEE_THEME_CHOICE] : [])],
    [beeThemeUnlocked]
  )

  /* eslint-disable react-hooks/set-state-in-effect -- guard against stale locked secret theme in persisted state */
  useEffect(() => {
    if (colorScheme === 'bee' && !readBeeThemeUnlocked()) setColorScheme('default')
  }, [colorScheme, beeThemeUnlocked])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useLayoutEffect(() => {
    document.documentElement.dataset.ecsPalette = colorScheme
    document.documentElement.dataset.ecsTone = darkMode ? 'dark' : 'light'
    document.documentElement.dataset.ecsMonth = String(currentMonth)
    document.documentElement.dataset.ecsLayout = useThemeLayout ? 'themed' : 'default'
    document.documentElement.dataset.ecsCorners = cornerStyle
    document.documentElement.dataset.ecsChrome = chromeWeight
    document.documentElement.dataset.ecsDensity = workspaceDensity
    if (sidebarPlacement === 'auto') {
      delete document.documentElement.dataset.ecsForceSidebar
      delete document.documentElement.dataset.ecsSidebar
      delete document.documentElement.dataset.ecsSidebarW
    } else {
      document.documentElement.dataset.ecsForceSidebar = '1'
      document.documentElement.dataset.ecsSidebar = sidebarPlacement
      document.documentElement.dataset.ecsSidebarW = sidebarWidth
    }
  }, [
    colorScheme,
    darkMode,
    currentMonth,
    useThemeLayout,
    cornerStyle,
    chromeWeight,
    workspaceDensity,
    sidebarPlacement,
    sidebarWidth
  ])

  /* eslint-disable react-hooks/set-state-in-effect -- hydrated appearance profile intentionally fans out into UI state setters */
  useLayoutEffect(() => {
    appearanceAccountHydrated.current = null
    if (!isAuthed || !activeAccountId || !persistThemePerAccount) return
    const acc = readStoredAppearance(accountAppearanceKey(activeAccountId))
    if (acc) {
      if (acc.colorScheme) setColorScheme(parseColorScheme(acc.colorScheme))
      const tm = parseThemeMode(acc.themeMode)
      if (tm) setThemeMode(tm)
      if (typeof acc.useThemeLayout === 'boolean') setUseThemeLayout(acc.useThemeLayout)
      setCornerStyle(parseCornerStyle(acc.cornerStyle, acc.useSoftCorners))
      setChromeWeight(parseChromeWeight(acc.chromeWeight))
      setSidebarPlacement(parseSidebarPlacement(acc.sidebarPlacement))
      setSidebarWidth(parseSidebarWidth(acc.sidebarWidth))
      const cs = parseColorScheme(acc.colorScheme)
      const tl = typeof acc.useThemeLayout === 'boolean' ? acc.useThemeLayout : true
      const flowCustom = acc.regionFlowCustom === true
      setRegionFlowCustom(flowCustom)
      setWorkspaceFlow(flowCustom ? normalizeWorkspaceFlow(acc.workspaceFlow) : themedWorkspaceFlowDefault(cs, tl))
      setActiveUiPresetId(typeof acc.activeUiPresetId === 'string' ? acc.activeUiPresetId : null)
      if (typeof acc.mergeGeneratedAttacks === 'boolean') setMergeGeneratedAttacks(acc.mergeGeneratedAttacks)
      if (typeof acc.uiSoundsEnabled === 'boolean') setUiSoundsEnabled(acc.uiSoundsEnabled)
    }
    appearanceAccountHydrated.current = activeAccountId
  }, [isAuthed, activeAccountId, persistThemePerAccount])
  /* eslint-enable react-hooks/set-state-in-effect */

  const appearancePayload = useMemo<StoredAppearanceV1>(
    () => ({
      colorScheme,
      themeMode,
      useThemeLayout,
      cornerStyle,
      chromeWeight,
      sidebarPlacement,
      sidebarWidth,
      workspaceDensity,
      workspaceFlow,
      regionFlowCustom,
      activeUiPresetId,
      mergeGeneratedAttacks,
      persistThemePerAccount,
      uiSoundsEnabled
    }),
    [
      colorScheme,
      themeMode,
      useThemeLayout,
      cornerStyle,
      chromeWeight,
      sidebarPlacement,
      sidebarWidth,
      workspaceDensity,
      workspaceFlow,
      regionFlowCustom,
      activeUiPresetId,
      mergeGeneratedAttacks,
      persistThemePerAccount,
      uiSoundsEnabled
    ]
  )

  const persistAppearance = useCallback(
    (payload: StoredAppearanceV1): void => {
      if (typeof window === 'undefined') return
      const serialized = JSON.stringify(payload)
      try {
        window.localStorage.setItem(GUEST_APPEARANCE_KEY, serialized)
        if (isAuthed && activeAccountId && persistThemePerAccount) {
          window.localStorage.setItem(accountAppearanceKey(activeAccountId), serialized)
        }
      } catch {
        // ignore quota / private mode
      }
      void backend.appApi.setPrefs({ [PREF_GUEST_APPEARANCE]: serialized }).catch(() => {
        // ignore IPC persistence failures; localStorage fallback still applies
      })
    },
    [isAuthed, activeAccountId, persistThemePerAccount]
  )

  useEffect(() => {
    if (!prefsHydrated) return
    persistAppearance(appearancePayload)
  }, [appearancePayload, persistAppearance, prefsHydrated])

  useEffect(() => {
    if (!prefsHydrated) return
    const persistNow = (): void => persistAppearance(appearancePayload)
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') persistNow()
    }
    window.addEventListener('beforeunload', persistNow)
    window.addEventListener('pagehide', persistNow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', persistNow)
      window.removeEventListener('pagehide', persistNow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [appearancePayload, persistAppearance, prefsHydrated])

  /* eslint-disable react-hooks/set-state-in-effect -- themed flow is derived from palette/layout unless user locked custom order */
  useEffect(() => {
    if (regionFlowCustom) return
    setWorkspaceFlow(themedWorkspaceFlowDefault(colorScheme, useThemeLayout))
  }, [colorScheme, useThemeLayout, regionFlowCustom])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    // Keep initialization hook for future auth provider bootstrap.
  }, [])

  useEffect(() => {
    if (!isAuthed || !activeAccountId) return
    const refresh = (): void => {
      void loadCampaigns(activeAccountId)
      void loadCharacters(activeAccountId, selectedCampaignId)
      if (selectedCampaignId) {
        void loadCampaignMembers(selectedCampaignId)
        void loadBattleState(selectedCampaignId)
      } else {
        setCampaignMembers([])
        setBattleParticipants([])
        setEncounterRound(1)
        setActiveTurnIndex(0)
      }
    }
    refresh()
  }, [isAuthed, activeAccountId, selectedCampaignId])

  useEffect(() => {
    if (!isAuthed || !activeAccountId) return
    let cancelled = false
    void backend.accountApi.list().then((rows) => {
      if (cancelled) return
      const account = rows.find((row) => row.id === activeAccountId) ?? null
      setActiveAccountEmail(account?.email ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [isAuthed, activeAccountId])

  /* eslint-disable react-hooks/set-state-in-effect -- keep battle drafts aligned to currently loaded character roster */
  useEffect(() => {
    setBattleDrafts((prev) => {
      const next: Record<string, BattleDraft> = {}
      for (const row of characters) {
        next[row.id] = prev[row.id] ?? {
          hpCurrent: row.hpCurrent,
          armorCurrent: row.armorCurrent,
          initiative: row.stats?.initiative ?? 0,
          notes: row.notes ?? '',
          conditions: [],
          selectedAction: ''
        }
      }
      return next
    })
  }, [characters])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- remove participants that no longer exist in roster */
  useEffect(() => {
    setBattleParticipants((prev) => prev.filter((id) => characters.some((row) => row.id === id)))
  }, [characters])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- clamp active turn index when participant list shrinks */
  useEffect(() => {
    if (battleParticipants.length === 0) {
      setActiveTurnIndex(0)
      return
    }
    if (activeTurnIndex >= battleParticipants.length) {
      setActiveTurnIndex(0)
    }
  }, [battleParticipants, activeTurnIndex])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isAuthed || !selectedCampaignId) return
    const timeout = setTimeout(() => {
      void persistBattleState(battleParticipants, battleDrafts, encounterRound, activeTurnIndex)
    }, 250)
    return () => clearTimeout(timeout)
  }, [isAuthed, selectedCampaignId, battleParticipants, battleDrafts, encounterRound, activeTurnIndex])

  useEffect(() => {
    if (!isAuthed || !activeAccountId) return
    const unsubscribe = backend.syncApi.onChanged((payload) => {
      if (payload.activity) {
        setActivityFeed((prev) => {
          const a = payload.activity!
          const entry: ActivityFeedEntry = {
            ...a,
            entryId: `${a.at}-${a.kind}-${Math.random().toString(36).slice(2, 9)}`
          }
          return [entry, ...prev].slice(0, 80)
        })
      }
      const scheduleBanner = (msg: string): void => {
        setSyncBanner(msg)
        if (syncBannerClearRef.current) clearTimeout(syncBannerClearRef.current)
        syncBannerClearRef.current = setTimeout(() => setSyncBanner(null), 5200)
      }
      if (payload.scope === 'campaigns') {
        scheduleBanner('Campaigns updated — refreshing list.')
        void loadCampaigns(activeAccountId)
        if (selectedCampaignId) void loadCampaignMembers(selectedCampaignId)
      }
      if (payload.scope === 'characters') {
        scheduleBanner('Characters changed — syncing roster.')
        void loadCharacters(activeAccountId, selectedCampaignId)
      }
      if (payload.scope === 'battle' && selectedCampaignId && payload.campaignId === selectedCampaignId) {
        scheduleBanner('Encounter state updated from another session.')
        void loadBattleState(selectedCampaignId)
      }
    })
    return () => {
      unsubscribe()
      if (syncBannerClearRef.current) clearTimeout(syncBannerClearRef.current)
    }
  }, [isAuthed, activeAccountId, selectedCampaignId])

  useEffect(() => {
    if (isAuthed) return
    const onDevShortcut = (event: KeyboardEvent): void => {
      const usesCmd = event.metaKey && event.shiftKey && event.key.toLowerCase() === 'd'
      const usesCtrl = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd'
      if (!usesCmd && !usesCtrl) return
      event.preventDefault()
      setShowAdvancedAuthTools((prev) => {
        const next = !prev
        if (!next) setAuthMode('login')
        return next
      })
      setAuthMessage(null)
    }
    window.addEventListener('keydown', onDevShortcut)
    return () => window.removeEventListener('keydown', onDevShortcut)
  }, [isAuthed])

  useEffect(() => {
    if (!isAuthed || !isDevAccount || !devLabFlags.enableCommandPalette) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const inTextField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (event.key === 'Escape' && showDevCommandPalette) {
        event.preventDefault()
        setShowDevCommandPalette(false)
        return
      }
      const isOpenShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (!isOpenShortcut || inTextField) return
      event.preventDefault()
      setDevCommandQuery('')
      setShowDevCommandPalette(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAuthed, isDevAccount, devLabFlags.enableCommandPalette, showDevCommandPalette])

  useEffect(() => {
    if (!isAuthed) return
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const resetTimer = (): void => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        void handleLogout('Session timed out due to inactivity.')
      }, SESSION_TIMEOUT_MS)
    }
    resetTimer()
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll']
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [isAuthed])

  useEffect(() => {
    if (!showSettingsMenu && !showThemeMenu) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setShowSettingsMenu(false)
        setShowThemeMenu(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSettingsMenu, showThemeMenu])

  useEffect(() => {
    if (!layoutEditMode) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLayoutEditMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layoutEditMode])

  useEffect(() => {
    if (!showQuickCreate) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      setShowQuickCreate(false)
      resetQuickWizard()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showQuickCreate, resetQuickWizard])

  useEffect(() => {
    if (!layoutA11yMessage) return
    const id = window.setTimeout(() => setLayoutA11yMessage(''), 4500)
    return () => window.clearTimeout(id)
  }, [layoutA11yMessage])

  /* eslint-disable react-hooks/set-state-in-effect -- reset transient layout editor drag state when mode exits */
  useEffect(() => {
    if (!layoutEditMode) {
      layoutFlowAnnouncedRef.current = ''
      setLayoutPanelDragFrom(null)
      setLayoutPanelDropOver(null)
      setLayoutA11yMessage('')
      return
    }
    const sig = workspaceFlow.join('|')
    if (layoutFlowAnnouncedRef.current === '') {
      layoutFlowAnnouncedRef.current = sig
      return
    }
    if (layoutFlowAnnouncedRef.current !== sig) {
      layoutFlowAnnouncedRef.current = sig
      const human = workspaceFlow.map(ecsWorkspaceRegionLabel).join(', ')
      setLayoutA11yMessage(`Vertical stack order is now: ${human}.`)
    }
  }, [workspaceFlow, layoutEditMode])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!layoutEditMode) return
    const clearDragUi = (): void => {
      setLayoutPanelDragFrom(null)
      setLayoutPanelDropOver(null)
    }
    window.addEventListener('dragend', clearDragUi)
    window.addEventListener('drop', clearDragUi)
    return () => {
      window.removeEventListener('dragend', clearDragUi)
      window.removeEventListener('drop', clearDragUi)
    }
  }, [layoutEditMode])

  useLayoutEffect(() => {
    if (!showThemeMenu) return
    const panelWidth = 352
    const gap = 8
    const measure = (): void => {
      const vv = window.visualViewport
      const vh = vv?.height ?? window.innerHeight
      const offsetTop = vv?.offsetTop ?? 0
      const approxPanelHeight = Math.min(720, Math.max(320, vh - 24))
      const margin = 8 + offsetTop
      const el = themeMenuButtonRef.current
      let left: number
      let top: number
      if (!el) {
        left = Math.max(8, window.innerWidth - panelWidth - 16)
        top = margin + 48
      } else {
        const rect = el.getBoundingClientRect()
        left = rect.right - panelWidth
        left = Math.min(Math.max(8, left), window.innerWidth - panelWidth - 8)
        top = rect.bottom + gap
        if (top + approxPanelHeight > offsetTop + vh - 8) {
          top = rect.top - approxPanelHeight - gap
        }
        const maxTop = Math.max(margin, offsetTop + vh - approxPanelHeight - 8)
        top = Math.min(Math.max(margin, top), maxTop)
      }
      setThemeMenuPos({ top, left })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const vv = window.visualViewport
    vv?.addEventListener('resize', measure)
    vv?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      vv?.removeEventListener('resize', measure)
      vv?.removeEventListener('scroll', measure)
    }
  }, [showThemeMenu])

  useLayoutEffect(() => {
    if (!showSettingsMenu) return
    const panelWidth = 288
    const gap = 8
    const approxPanelHeight = 340
    const measure = (): void => {
      const el = settingsButtonRef.current
      let left: number
      let top: number
      if (!el) {
        left = Math.max(8, window.innerWidth - panelWidth - 16)
        top = 72
      } else {
        const rect = el.getBoundingClientRect()
        left = rect.right - panelWidth
        left = Math.min(Math.max(8, left), window.innerWidth - panelWidth - 8)
        top = rect.bottom + gap
        if (top + approxPanelHeight > window.innerHeight - 8) {
          top = rect.top - approxPanelHeight - gap
        }
        top = Math.min(Math.max(8, top), window.innerHeight - approxPanelHeight - 8)
      }
      setSettingsPanelPos({ top, left })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [showSettingsMenu])

  async function loadCampaigns(accountId: string): Promise<void> {
    const rows = await backend.campaignApi.listForAccount(accountId)
    setCampaigns(rows)
  }

  async function loadCharacters(accountId: string, campaignId: string | null): Promise<void> {
    const rows = await backend.characterApi.list({ accountId, campaignId })
    setCharacters(rows)
  }

  async function loadCampaignMembers(campaignId: string): Promise<void> {
    const members = await backend.campaignApi.members(campaignId)
    setCampaignMembers(members)
  }

  async function loadBattleState(campaignId: string): Promise<void> {
    const state = await backend.battleApi.getState(campaignId)
    isApplyingRemoteBattleState.current = true
    if (state) {
      setBattleParticipants(state.participants)
      setBattleDrafts(state.drafts)
      setEncounterRound(state.round)
      setActiveTurnIndex(state.activeTurnIndex)
    } else {
      setBattleParticipants([])
      setEncounterRound(1)
      setActiveTurnIndex(0)
    }
    setTimeout(() => {
      isApplyingRemoteBattleState.current = false
    }, 0)
  }

  async function persistBattleState(
    participants: string[],
    drafts: Record<string, BattleDraft>,
    round: number,
    turnIndex: number
  ): Promise<void> {
    if (!selectedCampaignId || !activeAccountId || isApplyingRemoteBattleState.current) return
    await backend.battleApi.saveState({
      campaignId: selectedCampaignId,
      participants,
      drafts,
      round,
      activeTurnIndex: turnIndex,
      updatedByAccountId: activeAccountId
    })
  }

  async function handleLogout(message?: string): Promise<void> {
    await backend.authApi.logout()
    setIsAuthed(false)
    setAuthPassword('')
    setNewResetPassword('')
    setResetToken('')
    setDevPassword('')
    setActiveAccountId(null)
    setActiveAccountEmail(null)
    setSelectedCampaignId(null)
    setSelectedId(null)
    setEditor(emptyCharacter())
    setKeywordText('')
    setAppMessage(null)
    setActivityFeed([])
    setShowDevPanel(false)
    setShowDevCommandPalette(false)
    if (message) setAuthMessage(message)
  }

  async function handleAuthSubmit(): Promise<void> {
    setAuthMessage(null)
    if (authMode === 'dev') {
      const result = await backend.authApi.devLogin(devPassword)
      setAuthMessage(result.message)
      if (!result.ok || !result.account) return
      setDevPassword('')
      setAuthPassword('')
      setNewResetPassword('')
      setResetToken('')
      setIsAuthed(true)
      setActiveAccountId(result.account.id)
      setActiveAccountEmail(result.account.email)
      setWorkspaceTab('home')
      return
    }

    if (authMode === 'login') {
      const result = await backend.authApi.login({ email: authEmail, password: authPassword })
      setAuthMessage(result.message)
      if (!result.ok || !result.account) return
      setAuthPassword('')
      setNewResetPassword('')
      setResetToken('')
      setDevPassword('')
      setIsAuthed(true)
      setActiveAccountId(result.account.id)
      setActiveAccountEmail(result.account.email)
      setWorkspaceTab('home')
      return
    }

    if (authMode === 'register') {
      const result = await backend.authApi.register({
        displayName: authDisplayName,
        email: authEmail,
        password: authPassword
      })
      setAuthMessage(result.message)
      if (!result.ok || !result.account) return
      setAuthPassword('')
      setNewResetPassword('')
      setResetToken('')
      setDevPassword('')
      setIsAuthed(true)
      setActiveAccountId(result.account.id)
      setActiveAccountEmail(result.account.email)
      setWorkspaceTab('home')
      return
    }

    const result = await backend.authApi.resetWithToken({
      email: authEmail,
      token: resetToken,
      newPassword: newResetPassword
    })
    setAuthMessage(result.message)
    if (result.ok) {
      setNewResetPassword('')
      setResetToken('')
    }
    if (result.ok) {
      setAuthMode('login')
      setResetToken('')
      setNewResetPassword('')
    }
  }

  async function handleRequestResetToken(): Promise<void> {
    const result = await backend.authApi.requestReset(authEmail)
    setAuthMessage(result.message)
    setResetTokenHint(result.token ? `Local reset token: ${result.token}` : null)
  }

  async function handleSendTestEmail(): Promise<void> {
    if (!authEmail.trim()) {
      setAuthMessage('Enter an email first to send a test message.')
      return
    }
    const result = await backend.authApi.sendTestEmail(authEmail.trim())
    setAuthMessage(result.message)
  }

  async function handleCheckSmtpStatus(): Promise<void> {
    const status = await backend.authApi.smtpStatus()
    setSmtpMessage(status.message)
  }

  function openCharacter(record: CharacterRecord): void {
    setWorkspaceTab('sheet')
    setSelectedId(record.id)
    setEditor({
      id: record.id,
      portraitRelativePath: record.portraitRelativePath ?? '',
      factionGroup: record.factionGroup ?? '',
      name: record.name,
      hpCurrent: record.hpCurrent,
      hpMax: record.hpMax,
      armorCurrent: record.armorCurrent,
      armorMax: record.armorMax,
      armorNote: record.armorNote,
      dedicatedEssence: record.dedicatedEssence,
      dedicatedEssenceDescription: record.dedicatedEssenceDescription,
      traitName: record.traitName,
      traitDescription: record.traitDescription,
      epicMoveName: record.epicMoveName,
      epicMoveDescription: record.epicMoveDescription,
      monolithName: record.monolithName,
      monolithDescription: record.monolithDescription,
      archetype: record.archetype,
      level: record.level,
      notes: record.notes,
      keywords: record.keywords,
      stats: record.stats,
      attacks: record.attacks
    })
    setKeywordText(record.keywords.join(', '))
  }

  function newCharacter(): void {
    setSelectedId(null)
    setEditor(emptyCharacter())
    setKeywordText('')
  }

  function applyCharacterPreset(preset: 'frontliner' | 'caster' | 'rogue'): void {
    if (preset === 'frontliner') {
      setEditor((prev) => ({
        ...prev,
        archetype: 'Frontliner',
        factionGroup: prev.factionGroup || 'Vanguard',
        dedicatedEssence: prev.dedicatedEssence || 'Steel Discipline',
        hpMax: Math.max(prev.hpMax, 40),
        hpCurrent: Math.max(prev.hpCurrent, 40),
        armorMax: Math.max(prev.armorMax, 14),
        armorCurrent: Math.max(prev.armorCurrent, 14)
      }))
    } else if (preset === 'caster') {
      setEditor((prev) => ({
        ...prev,
        archetype: 'Caster',
        factionGroup: prev.factionGroup || 'Arc Circle',
        dedicatedEssence: prev.dedicatedEssence || 'Aether',
        hpMax: Math.max(prev.hpMax, 24),
        hpCurrent: Math.max(prev.hpCurrent, 24),
        armorMax: Math.max(prev.armorMax, 8),
        armorCurrent: Math.max(prev.armorCurrent, 8)
      }))
    } else {
      setEditor((prev) => ({
        ...prev,
        archetype: 'Rogue',
        factionGroup: prev.factionGroup || 'Night Guild',
        dedicatedEssence: prev.dedicatedEssence || 'Shadowstep',
        hpMax: Math.max(prev.hpMax, 28),
        hpCurrent: Math.max(prev.hpCurrent, 28),
        armorMax: Math.max(prev.armorMax, 10),
        armorCurrent: Math.max(prev.armorCurrent, 10)
      }))
    }
    setAppMessage(`Applied ${preset} preset.`)
  }

  function resetQuickWizard(): void {
    setQuickStep(1)
    setQuickName('')
    setQuickHp(30)
    setQuickArmor(10)
    setQuickLevel(1)
    setQuickFaction('')
    setQuickClass('Fighter')
    setQuickSubclass('')
    setQuickPreset('frontliner')
    setQuickDescription('')
  }

  function openQuickCreate(): void {
    setWorkspaceTab('sheet')
    resetQuickWizard()
    setShowQuickCreate(true)
  }

  function quickBaselineForCurrentMode(): { hp: number; ac: number; archetype: string; faction: string; essence: string } {
    if (rulesMode === 'dnd') {
      const baseline = DND_CLASS_BASELINE[quickClass] ?? { hp: 10, ac: 14 }
      return { hp: baseline.hp, ac: baseline.ac, archetype: quickClass, faction: '', essence: '' }
    }
    const preset = TTRPG_PRESETS[quickPreset]
    return {
      hp: preset.hp,
      ac: preset.ac,
      archetype: preset.archetype,
      faction: preset.factionGroup,
      essence: preset.dedicatedEssence
    }
  }

  function applyQuickBaselineStats(): void {
    const baseline = quickBaselineForCurrentMode()
    setQuickHp(baseline.hp)
    setQuickArmor(baseline.ac)
  }

  async function createQuickCharacter(): Promise<void> {
    if (!activeAccountId) return
    const name = quickName.trim()
    if (!name) {
      setAppMessage('Add a character name on step 2 before creating.')
      setQuickStep(2)
      return
    }
    const baseline = quickBaselineForCurrentMode()
    const dndMode = rulesMode === 'dnd'
    const hp = Math.max(1, Number(quickHp) || baseline.hp)
    const ac = Math.max(0, Number(quickArmor) || baseline.ac)
    const level = Math.max(1, Math.min(30, Number(quickLevel) || 1))
    const factionFromInput = quickFaction.trim()
    const factionFallback = dndMode ? '' : baseline.faction
    const starterKw = dndMode ? starterKeywordsForDndArchetype(quickClass) : []
    const payload: CharacterSaveInput = {
      ...emptyCharacter(),
      name,
      hpCurrent: hp,
      hpMax: hp,
      armorCurrent: ac,
      armorMax: ac,
      level,
      factionGroup: factionFromInput || factionFallback,
      archetype: dndMode ? quickClass : baseline.archetype,
      dedicatedEssence: dndMode ? quickSubclass.trim() : baseline.essence,
      notes: quickDescription.trim(),
      ownerAccountId: activeAccountId,
      campaignId: selectedCampaignId,
      keywords: starterKw
    }
    const saved = await backend.characterApi.save(payload)
    await loadCharacters(activeAccountId, selectedCampaignId)
    openCharacter(saved)
    setShowQuickCreate(false)
    resetQuickWizard()
    setAppMessage(`Created ${name}. Open the sheet to fine-tune.`)
  }

  async function pickCharacterPortrait(): Promise<void> {
    const prev = editor.portraitRelativePath?.trim() ?? ''
    const result = await backend.portraitApi.choose({ characterId: editor.id ?? null })
    if (!result.ok || !result.portraitRelativePath) {
      if (result.message) setAppMessage(result.message)
      return
    }
    if (prev && prev !== result.portraitRelativePath) await backend.portraitApi.remove(prev)
    setEditor((p) => ({ ...p, portraitRelativePath: result.portraitRelativePath ?? '' }))
    setAppMessage('Portrait updated — remember to save the character.')
  }

  async function clearCharacterPortrait(): Promise<void> {
    const prev = editor.portraitRelativePath?.trim() ?? ''
    if (!prev) return
    await backend.portraitApi.remove(prev)
    setEditor((p) => ({ ...p, portraitRelativePath: '' }))
    setAppMessage('Portrait removed.')
  }

  async function saveCharacter(): Promise<void> {
    if (!activeAccountId) return
    const payload: CharacterSaveInput = {
      ...editor,
      ownerAccountId: activeAccountId,
      campaignId: selectedCampaignId,
      keywords: parseKeywords(keywordText)
    }
    const saved = await backend.characterApi.save(payload)
    await loadCharacters(activeAccountId, selectedCampaignId)
    openCharacter(saved)
    setAppMessage('Character saved.')
  }

  async function deleteCharacter(): Promise<void> {
    if (!selectedId || !activeAccountId) return
    await backend.characterApi.remove(selectedId)
    await loadCharacters(activeAccountId, selectedCampaignId)
    newCharacter()
    setAppMessage('Character deleted.')
  }

  async function generateAttacks(): Promise<void> {
    const preview = previewKeywordAttackBatch({
      archetype: editor.archetype || editor.dedicatedEssence || 'adventurer',
      level: Math.max(1, editor.level),
      keywords: normalizeKeywordInput(keywordText),
      stats: editor.stats
    })
    if (preview.attackCount >= 40) {
      const ok = window.confirm(
        `This will add ${preview.attackCount} generated attacks to the list (one per archetype × element pair). Continue?`
      )
      if (!ok) return
    }
    const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const result = await backend.characterApi.generateAttacks({
      characterId: editor.id ?? 'draft',
      characterName: editor.name || 'Character',
      archetype: editor.archetype || editor.dedicatedEssence || 'adventurer',
      level: Math.max(1, editor.level),
      keywords: parseKeywords(keywordText),
      stats: editor.stats,
      batchId
    })
    setEditor((prev) => {
      const withoutGen = mergeGeneratedAttacks ? prev.attacks : prev.attacks.filter((attack) => attack.source !== 'generated')
      return {
        ...prev,
        attacks: [...withoutGen, ...result.attacks]
      }
    })
    const noteTail = result.generationNotes.slice(0, 2).join(' ')
    setAppMessage(
      `Generated ${result.attacks.length} attack${result.attacks.length === 1 ? '' : 's'}. ${noteTail}`.slice(0, 420)
    )
  }

  function addManualAttack(): void {
    const name = manualAttackDraft.name.trim()
    if (!name) {
      setAppMessage('Give the attack a name before adding.')
      return
    }
    const hitParsed = Number.parseInt(manualAttackDraft.hitBonus.trim(), 10)
    const hitBonus = Number.isFinite(hitParsed) ? hitParsed : 0
    const id = `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    setEditor((prev) => ({
      ...prev,
      attacks: [
        ...prev.attacks,
        {
          id,
          name,
          hitBonus,
          damageDice: manualAttackDraft.damageDice.trim() || '—',
          damageType: manualAttackDraft.damageType.trim() || '—',
          range: manualAttackDraft.range.trim() || '—',
          tags: ['manual'],
          description: manualAttackDraft.description.trim(),
          source: 'manual'
        }
      ]
    }))
    setManualAttackDraft(emptyManualAttackDraft())
    setAppMessage(`Added manual attack "${name}".`)
  }

  function removeAttack(attackId: string): void {
    setEditor((prev) => ({
      ...prev,
      attacks: prev.attacks.filter((attack) => attack.id !== attackId)
    }))
    setAppMessage('Removed attack.')
  }

  async function createCampaign(): Promise<void> {
    if (!activeAccountId || !newCampaignName.trim()) return
    const campaign = await backend.campaignApi.create({ accountId: activeAccountId, name: newCampaignName.trim() })
    setSelectedCampaignId(campaign.id)
    setNewCampaignName('')
    await loadCampaigns(activeAccountId)
  }

  async function joinCampaign(): Promise<void> {
    if (!activeAccountId || !joinCode.trim()) return
    const campaign = await backend.campaignApi.joinByCode({ accountId: activeAccountId, code: joinCode.trim() })
    if (!campaign) {
      setAppMessage('Campaign code not found.')
      return
    }
    setSelectedCampaignId(campaign.id)
    setJoinCode('')
    await loadCampaigns(activeAccountId)
    await loadCampaignMembers(campaign.id)
    setWorkspaceTab('battle')
  }

  async function handleLeaveCampaign(): Promise<void> {
    if (!activeAccountId || !selectedCampaignId) return
    const result = await backend.campaignApi.leave({
      accountId: activeAccountId,
      campaignId: selectedCampaignId
    })
    setAppMessage(result.message)
    setSelectedCampaignId(null)
    setWorkspaceTab('home')
    setBattleParticipants([])
    setBattleDrafts({})
    await loadCampaigns(activeAccountId)
    await loadCharacters(activeAccountId, null)
  }

  const filteredCharacters = useMemo(() => {
    const query = search.trim().toLowerCase()
    return characters.filter((row) => {
      const matchText = !query || row.name.toLowerCase().includes(query)
      const matchFaction =
        factionFilter === 'all' ? true : (row.factionGroup ?? '').trim().toLowerCase() === factionFilter
      return matchText && matchFaction
    })
  }, [characters, search, factionFilter])

  const factionOptions = useMemo(() => {
    const values = characters
      .map((row) => (row.factionGroup ?? '').trim().toLowerCase())
      .filter(Boolean)
      .filter((value, idx, arr) => arr.indexOf(value) === idx)
      .sort()
    return values
  }, [characters])

  const activeCampaign = campaigns.find((row) => row.id === selectedCampaignId) ?? null
  const preview = useMemo(() => formatSheet(editor), [editor])
  const pwdRules = passwordChecks(authPassword)
  const dndClass = DND_CLASSES.includes(editor.archetype as (typeof DND_CLASSES)[number])
    ? editor.archetype
    : 'Fighter'
  const dndCastingAbility = DND_CLASS_ABILITY[dndClass] ?? 'str'
  const dndAbilityScore = editor.stats[dndCastingAbility] ?? 10
  const dndAbilityMod = Math.floor((dndAbilityScore - 10) / 2)
  const dndProf = proficiencyBonus(editor.level)
  const dndSpellSaveDc = 8 + dndProf + dndAbilityMod
  const dndSpellAttack = dndProf + dndAbilityMod

  const sheetAttackIntel = useMemo(() => {
    if (rulesMode !== 'dnd' || workspaceTab !== 'sheet') return null
    return previewKeywordAttackBatch({
      archetype: editor.archetype || editor.dedicatedEssence || 'adventurer',
      level: Math.max(1, editor.level),
      keywords: normalizeKeywordInput(keywordText),
      stats: editor.stats
    })
  }, [rulesMode, workspaceTab, editor.archetype, editor.dedicatedEssence, editor.level, editor.stats, keywordText])

  const loginMutedBtn = useMemo(() => {
    if (colorScheme === 'default') {
      return darkMode
        ? 'border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700/90'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }
    if (colorScheme === 'teal') {
      return cn(
        'border border-gray-700 bg-[#d4d0c8] text-gray-900 hover:bg-[#c8c4bc]',
        'dark:border-gray-900 dark:bg-[#4a4a4a] dark:text-gray-100 dark:hover:bg-[#555]'
      )
    }
    if (colorScheme === 'sunset') {
      return darkMode
        ? 'border border-cyan-500/35 bg-slate-950/55 text-slate-200 hover:bg-slate-900/75'
        : 'border-2 border-pink-300 bg-white/80 text-indigo-950 hover:bg-white'
    }
    if (colorScheme === 'wii') {
      return darkMode
        ? 'border border-gray-600 bg-gray-700/85 text-gray-100 hover:bg-gray-600/95'
        : 'border border-gray-400/85 bg-white/82 text-gray-800 hover:bg-white'
    }
    if (colorScheme === 'ps3') {
      return 'border border-slate-600/70 bg-slate-800/65 text-slate-200 hover:bg-slate-700/85'
    }
    if (colorScheme === 'xbox360') {
      return 'border border-zinc-700/75 bg-zinc-900/72 text-zinc-100 hover:bg-zinc-800/88'
    }
    if (colorScheme === 'cube') {
      return darkMode
        ? 'border border-indigo-400/45 bg-indigo-950/60 text-indigo-100 hover:bg-indigo-900/70'
        : 'border border-indigo-400/55 bg-white/90 text-indigo-950 hover:bg-white'
    }
    if (colorScheme === 'bee') {
      return darkMode
        ? 'border border-amber-500/40 bg-stone-900/75 text-amber-100 hover:bg-stone-900'
        : 'border border-amber-400/70 bg-amber-50/90 text-amber-950 hover:bg-amber-50'
    }
    if (colorScheme === 'wiiu') {
      return darkMode
        ? 'border border-cyan-500/35 bg-slate-900/72 text-cyan-100 hover:bg-slate-800/80'
        : 'border border-cyan-300/70 bg-white/86 text-cyan-900 hover:bg-white'
    }
    if (colorScheme === '3ds') {
      return darkMode
        ? 'border border-rose-500/35 bg-zinc-900/82 text-rose-100 hover:bg-zinc-800/90'
        : 'border border-rose-300/80 bg-white/90 text-rose-900 hover:bg-white'
    }
    return 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60'
  }, [colorScheme, darkMode])

  const scheme = useMemo(
    () =>
      (
        {
          default: {
            grad: darkMode
              ? 'from-slate-950 via-indigo-950/50 to-slate-950'
              : 'from-slate-100 via-sky-50 to-indigo-50',
            primary: darkMode
              ? 'rounded-lg bg-sky-500 text-white font-semibold border border-sky-400/50 shadow-[0_0_22px_rgba(56,189,248,0.3)] hover:bg-sky-400'
              : 'rounded-lg bg-indigo-600 text-white font-semibold border border-indigo-500 shadow-md hover:bg-indigo-500',
            secondary: darkMode
              ? 'rounded-lg bg-slate-800 text-slate-100 font-semibold border border-slate-600/45 shadow-sm hover:bg-slate-700'
              : 'rounded-lg bg-white text-indigo-900 font-semibold border border-indigo-200 shadow-sm hover:bg-indigo-50',
            ring: darkMode ? 'ring-sky-400/60' : 'ring-indigo-400/60'
          },
          violet: {
            grad: 'from-sky-200 via-blue-600 to-teal-400',
            primary:
              'bg-gradient-to-b from-sky-200 to-blue-800 text-white font-semibold border-2 border-white/55 shadow-[inset_0_2px_0_rgba(255,255,255,0.55),0_8px_28px_rgba(37,99,235,0.38)]',
            secondary:
              'bg-gradient-to-b from-emerald-400 to-teal-900 text-white font-semibold border border-emerald-200/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]',
            ring: 'ring-sky-300/90'
          },
          teal: {
            grad: darkMode
              ? 'from-[#000010] via-[#001a38] to-[#005050]'
              : 'from-[#000040] via-[#0066cc] to-[#00a8a8]',
            primary: darkMode
              ? 'rounded-md bg-[#6f6f6f] text-white font-semibold shadow-[inset_-1px_-1px_0_#2f2f2f,inset_1px_1px_0_#a0a0a0] border border-black/35'
              : 'rounded-md bg-[#ece9d8] text-[#000060] font-semibold shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] border border-black/25',
            secondary: darkMode
              ? 'rounded-md bg-[#5c5c5c] text-[#ecfeff] font-semibold shadow-[inset_-1px_-1px_0_#252525,inset_1px_1px_0_#888888] border border-black/35'
              : 'rounded-md bg-[#d8d4c8] text-[#003049] font-semibold shadow-[inset_-1px_-1px_0_#505050,inset_1px_1px_0_#ffffff] border border-black/22',
            ring: 'ring-[#00ffff]/70'
          },
          sunset: {
            grad: darkMode
              ? 'from-[#240046] via-[#c026d3] to-[#0369a1]'
              : 'from-[#fff1f2] via-[#fae8ff] to-[#cffafe]',
            primary: darkMode
              ? 'rounded-xl bg-gradient-to-r from-fuchsia-500 via-fuchsia-700 to-cyan-400 text-white font-semibold border-2 border-fuchsia-200/55 shadow-[0_0_36px_rgba(217,70,239,0.6)]'
              : 'rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-600 to-amber-400 text-white font-semibold border-2 border-yellow-200 shadow-[0_12px_40px_rgba(236,72,153,0.45)]',
            secondary: darkMode
              ? 'rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-600 text-white font-semibold border border-cyan-200/45 shadow-[0_0_26px_rgba(34,211,238,0.45)]'
              : 'rounded-xl bg-gradient-to-r from-violet-500 to-sky-500 text-white font-semibold border-2 border-white/80 shadow-lg',
            ring: 'ring-fuchsia-400/90'
          },
          wii: {
            grad: darkMode ? 'from-[#1e2430] via-[#334155] to-[#0f1419]' : 'from-[#f8fafc] via-[#cbd5e1] to-[#94a3b8]',
            primary:
              'rounded-2xl bg-gradient-to-b from-sky-200 to-blue-600 text-white font-semibold border-2 border-white/70 shadow-[inset_0_2px_0_rgba(255,255,255,0.65),0_12px_32px_rgba(2,132,199,0.45)]',
            secondary:
              'rounded-2xl bg-gradient-to-b from-slate-300 to-slate-600 text-white font-semibold border border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]',
            ring: 'ring-sky-300/90'
          },
          ps3: {
            grad: 'from-[#010208] via-[#0a1628] to-[#020617]',
            primary:
              'rounded-lg bg-gradient-to-r from-sky-300 to-indigo-800 text-white font-semibold border border-sky-200/40 shadow-[0_0_26px_rgba(56,189,248,0.45)]',
            secondary:
              'rounded-lg bg-gradient-to-b from-slate-500 to-black text-slate-50 font-semibold border border-slate-400/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]',
            ring: 'ring-sky-300/80'
          },
          xbox360: {
            grad: 'from-[#0a0a0a] via-[#171717] to-[#030303]',
            primary:
              'rounded-lg bg-gradient-to-r from-lime-300 via-lime-500 to-green-800 text-black font-bold border border-lime-200/50 shadow-[0_0_24px_rgba(132,204,22,0.42)]',
            secondary:
              'rounded-lg bg-gradient-to-b from-zinc-600 to-black text-zinc-50 font-semibold border border-zinc-500/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
            ring: 'ring-lime-400/75'
          },
          cube: {
            grad: darkMode
              ? 'from-[#050816] via-[#1e1b4b] to-[#020617]'
              : 'from-[#312e81] via-[#6366f1] to-[#0f172a]',
            primary:
              'rounded-xl bg-gradient-to-r from-orange-200 via-white to-indigo-200 text-indigo-950 font-bold border-2 border-orange-200/85 shadow-[0_0_36px_rgba(251,146,60,0.28)]',
            secondary:
              'rounded-xl bg-gradient-to-r from-indigo-950 to-violet-950 text-violet-100 font-semibold border border-indigo-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
            ring: 'ring-orange-300/80'
          },
          bee: {
            grad: darkMode
              ? 'from-[#0c0a09] via-[#422006] to-[#1c1917]'
              : 'from-[#fffbeb] via-[#fde68a] to-[#f59e0b]',
            primary: darkMode
              ? 'rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-800 text-stone-950 font-bold border-2 border-amber-200/55 shadow-[0_0_30px_rgba(251,191,36,0.35)]'
              : 'rounded-2xl bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-600 text-stone-950 font-bold border-2 border-amber-900/20 shadow-[0_14px_40px_rgba(245,158,11,0.35)]',
            secondary: darkMode
              ? 'rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 text-amber-50 font-semibold border border-amber-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'rounded-2xl bg-gradient-to-br from-white to-amber-100 text-amber-950 font-semibold border border-amber-300/70 shadow-md',
            ring: 'ring-amber-400/85'
          },
          wiiu: {
            grad: darkMode ? 'from-[#020a12] via-[#082f49] to-[#020617]' : 'from-[#f0fdfa] via-[#a5f3fc] to-[#e0f2fe]',
            primary:
              'rounded-xl bg-gradient-to-r from-teal-300 via-cyan-400 to-blue-600 text-white font-semibold border-2 border-white/60 shadow-[0_10px_32px_rgba(6,182,212,0.4)]',
            secondary:
              'rounded-xl bg-gradient-to-r from-slate-600 to-slate-900 text-white font-semibold border border-cyan-300/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
            ring: 'ring-teal-300/85'
          },
          '3ds': {
            grad: darkMode ? 'from-[#450a0a] via-[#18181b] to-[#881337]' : 'from-[#ffe4e6] via-[#fda4af] to-[#fecdd3]',
            primary:
              'rounded-md bg-gradient-to-b from-rose-400 to-rose-900 text-white font-semibold border-2 border-rose-200/70 shadow-[inset_0_2px_0_rgba(255,255,255,0.45)]',
            secondary:
              'rounded-md bg-gradient-to-b from-zinc-600 to-zinc-900 text-white font-semibold border border-rose-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
            ring: 'ring-rose-400/85'
          }
        } as const
      )[colorScheme],
    [colorScheme, darkMode]
  )

  const useShapeSoft = cornerStyle === 'soft' || cornerStyle === 'organic'
  const useEraClips = cornerStyle === 'era'

  const headerChrome = useMemo(() => {
    if (colorScheme === 'default') {
      return cn(
        'relative mb-6 rounded-2xl border-2 p-5 motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-sky-900/40 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-slate-100 shadow-[0_0_28px_rgba(56,189,248,0.12)]'
          : 'border-indigo-200 bg-gradient-to-br from-white via-sky-50/80 to-indigo-50 text-slate-900 shadow-md'
      )
    }
    if (colorScheme === 'teal') {
      return cn(
        'ecs-win98-window relative mb-6 rounded-none border border-black/55 p-5 pt-6 motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-black/60 bg-[#545454] text-zinc-100 shadow-[4px_4px_0_rgba(0,0,0,0.35)]' : 'bg-[#ece9d8] text-gray-900 shadow-[4px_4px_0_rgba(0,0,0,0.12)]'
      )
    }
    if (colorScheme === 'sunset') {
      return cn(
        useEraClips
          ? 'ecs-shape-banner relative mb-6 border-2 p-5 backdrop-blur-md motion-safe:animate-ecs-fade-up ecs-header-y2k'
          : 'relative mb-6 rounded-[1.35rem] border-2 p-5 backdrop-blur-md motion-safe:animate-ecs-fade-up ecs-header-y2k',
        darkMode
          ? 'border-cyan-400/50 bg-slate-950/88 text-slate-100 shadow-[0_0_38px_rgba(34,211,238,0.14)]'
          : 'border-pink-400/80 bg-gradient-to-br from-amber-50 via-white to-fuchsia-100 text-indigo-950 shadow-xl'
      )
    }
    if (colorScheme === 'wii') {
      return cn(
        'relative mb-6 rounded-[2rem] border-2 p-5 motion-safe:animate-ecs-fade-up backdrop-blur-md',
        darkMode
          ? 'border-sky-800/50 bg-gradient-to-b from-slate-800 to-slate-950 text-gray-100 shadow-[0_16px_48px_rgba(0,0,0,0.5)]'
          : 'border-sky-200 bg-gradient-to-b from-white via-sky-50/90 to-slate-200/90 text-gray-900 shadow-[0_18px_50px_rgba(14,165,233,0.2)]'
      )
    }
    if (colorScheme === 'ps3') {
      return cn(
        'relative mb-6 rounded-xl border-2 border-sky-500/40 bg-gradient-to-b from-slate-800/98 via-slate-950 to-black p-5 text-slate-100 shadow-[0_0_32px_rgba(56,189,248,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] motion-safe:animate-ecs-fade-up',
        !darkMode && 'from-slate-700/98 to-slate-900 text-slate-50'
      )
    }
    if (colorScheme === 'xbox360') {
      return cn(
        'relative mb-6 rounded-lg border-2 border-lime-600/35 bg-gradient-to-b from-zinc-900/98 via-black to-zinc-950 p-5 text-zinc-100 shadow-[0_0_28px_rgba(74,222,128,0.22),inset_0_1px_0_rgba(255,255,255,0.06)] motion-safe:animate-ecs-fade-up',
        !darkMode && 'from-zinc-800/98 to-black text-zinc-50'
      )
    }
    if (colorScheme === 'cube') {
      return cn(
        'relative mb-6 rounded-[1.1rem] border-2 border-orange-400/35 bg-gradient-to-r from-[#1e1033]/98 via-indigo-900/95 to-[#020617]/98 p-5 text-slate-100 shadow-[0_0_34px_rgba(129,140,248,0.22)] motion-safe:animate-ecs-fade-up'
      )
    }
    if (colorScheme === 'bee') {
      return cn(
        'relative mb-6 rounded-[1.6rem] border-2 p-5 backdrop-blur-md motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-amber-500/40 bg-gradient-to-br from-stone-950 via-amber-950/35 to-stone-950 text-amber-50 shadow-[0_0_30px_rgba(245,158,11,0.18)]'
          : 'border-amber-300/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 text-amber-950 shadow-xl'
      )
    }
    if (colorScheme === 'wiiu') {
      return cn(
        'relative mb-6 rounded-2xl border-2 p-5 backdrop-blur-md motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-teal-400/50 bg-gradient-to-br from-slate-950 via-cyan-950/40 to-slate-900 text-cyan-50 shadow-[0_12px_40px_rgba(6,182,212,0.35)]'
          : 'border-cyan-300 bg-gradient-to-br from-white via-cyan-50 to-sky-100 text-cyan-950 shadow-[0_12px_36px_rgba(14,116,144,0.22)]'
      )
    }
    if (colorScheme === '3ds') {
      return cn(
        'relative mb-6 rounded-lg border p-5 motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-rose-500/45 bg-zinc-900/92 text-rose-50 shadow-[0_8px_26px_rgba(127,29,29,0.32)]'
          : 'border-rose-300/80 bg-white/94 text-rose-900 shadow-[0_8px_22px_rgba(244,63,94,0.15)]'
      )
    }
    return useShapeSoft
      ? 'ecs-diagonal-strip relative mb-6 rounded-[1.75rem] border-2 border-cyan-400/70 bg-gradient-to-br from-white/95 via-sky-100/90 to-cyan-50/85 p-5 shadow-[0_12px_40px_rgba(14,165,233,0.25)] backdrop-blur-md motion-safe:animate-ecs-fade-up dark:border-teal-500/50 dark:from-slate-950 dark:via-slate-900 dark:to-teal-950/80'
      : 'ecs-shape-banner ecs-diagonal-strip relative mb-6 rounded-[1.75rem] border-2 border-cyan-400/70 bg-gradient-to-br from-white/95 via-sky-100/90 to-cyan-50/85 p-5 shadow-[0_12px_40px_rgba(14,165,233,0.25)] backdrop-blur-md motion-safe:animate-ecs-fade-up dark:border-teal-500/50 dark:from-slate-950 dark:via-slate-900 dark:to-teal-950/80'
  }, [colorScheme, darkMode, useShapeSoft, useEraClips])

  const cardClass =
    colorScheme === 'default'
      ? cn(
          'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl',
          darkMode
            ? 'border border-sky-900/30 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 shadow-[0_0_20px_rgba(56,189,248,0.08)]'
            : 'border border-indigo-200/80 bg-gradient-to-br from-white to-sky-50/90 text-slate-900 shadow-md'
        )
      : colorScheme === 'violet'
        ? cn(
            'ecs-shape-card motion-safe:transition-shadow motion-safe:duration-300 motion-safe:hover:shadow-lg motion-safe:hover:ring-2 motion-safe:hover:ring-cyan-300/70 dark:motion-safe:hover:ring-teal-500/50 border-2 border-sky-300/80 bg-gradient-to-br from-white/95 via-cyan-50/90 to-sky-100/85 text-slate-900 shadow-[0_12px_36px_rgba(14,165,233,0.2)] backdrop-blur-md dark:border-teal-600/50 dark:from-slate-950 dark:via-slate-900 dark:to-teal-950/90 dark:text-slate-100 dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
            useShapeSoft && 'ecs-shape-soft'
          )
        : colorScheme === 'teal'
          ? 'ecs-shape-card ecs-panel-teal motion-safe:transition-[filter] motion-safe:duration-200 hover:brightness-[1.02]'
          : colorScheme === 'sunset'
            ? cn(
                'ecs-shape-card motion-safe:transition-shadow motion-safe:duration-300 backdrop-blur-md',
                useShapeSoft && 'ecs-shape-soft',
                darkMode
                  ? 'border-2 border-fuchsia-400/70 bg-gradient-to-br from-slate-950 via-fuchsia-950/30 to-slate-950 text-slate-100 shadow-[0_0_36px_rgba(217,70,239,0.35)]'
                  : 'border-2 border-fuchsia-400 bg-gradient-to-br from-amber-50 via-fuchsia-50 to-cyan-50 text-indigo-950 shadow-[0_14px_44px_rgba(236,72,153,0.28)]'
              )
              : colorScheme === 'wii'
              ? cn(
                  'motion-safe:transition-shadow motion-safe:duration-300 rounded-[1.75rem] backdrop-blur-md',
                  darkMode
                    ? 'border-2 border-sky-700/50 bg-gradient-to-b from-slate-800 to-slate-950 shadow-[0_16px_48px_rgba(0,0,0,0.5)]'
                    : 'border-2 border-sky-200 bg-gradient-to-b from-white via-sky-50 to-slate-200 shadow-[0_18px_52px_rgba(14,165,233,0.18)]'
                )
              : colorScheme === 'ps3'
                ? cn(
                    'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl backdrop-blur-md',
                    darkMode
                      ? 'border-2 border-sky-500/40 bg-gradient-to-b from-slate-900 to-black text-slate-100 shadow-[0_0_32px_rgba(56,189,248,0.2)]'
                      : 'border-2 border-slate-500 bg-gradient-to-b from-slate-700 to-slate-900 text-slate-100 shadow-xl'
                  )
                : colorScheme === 'xbox360'
                  ? cn(
                      'motion-safe:transition-shadow motion-safe:duration-300 rounded-lg backdrop-blur-md',
                      darkMode
                        ? 'border-2 border-lime-600/35 bg-gradient-to-b from-zinc-900 to-black text-zinc-100 shadow-[0_0_30px_rgba(74,222,128,0.18)]'
                        : 'border-2 border-zinc-600 bg-gradient-to-b from-zinc-800 to-black text-zinc-100 shadow-xl'
                    )
                : colorScheme === 'cube'
                  ? cn(
                      'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl backdrop-blur-md',
                      darkMode
                        ? 'border-2 border-indigo-400/35 bg-gradient-to-br from-[#0f0720] via-indigo-950 to-black text-slate-100 shadow-[0_0_32px_rgba(99,102,241,0.18)]'
                        : 'border-2 border-indigo-400 bg-gradient-to-br from-indigo-50 via-white to-orange-50 text-indigo-950 shadow-[0_16px_44px_rgba(79,70,229,0.2)]'
                    )
                  : colorScheme === 'bee'
                    ? cn(
                        'motion-safe:transition-shadow motion-safe:duration-300 rounded-2xl backdrop-blur-md',
                        darkMode
                          ? 'border-2 border-amber-500/45 bg-gradient-to-br from-stone-950 via-amber-950/25 to-stone-950 text-amber-50 shadow-[0_0_28px_rgba(245,158,11,0.2)]'
                          : 'border-2 border-amber-300/90 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 text-amber-950 shadow-[0_14px_40px_rgba(245,158,11,0.22)]'
                      )
                  : colorScheme === 'wiiu'
                    ? cn(
                        'motion-safe:transition-shadow motion-safe:duration-300 rounded-2xl backdrop-blur-md',
                        darkMode
                          ? 'border-2 border-teal-400/50 bg-gradient-to-br from-slate-950 via-cyan-950/50 to-slate-900 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.22)]'
                          : 'border-2 border-cyan-300 bg-gradient-to-br from-white via-cyan-50 to-sky-100 text-cyan-950 shadow-[0_14px_40px_rgba(14,116,144,0.18)]'
                      )
                    : cn(
                          'motion-safe:transition-shadow motion-safe:duration-300 rounded-xl backdrop-blur-md',
                          darkMode
                            ? 'border-2 border-rose-500/50 bg-gradient-to-b from-zinc-950 via-rose-950/40 to-black text-rose-50 shadow-[0_0_28px_rgba(244,63,94,0.25)]'
                            : 'border-2 border-rose-300 bg-gradient-to-b from-rose-50 via-pink-100 to-rose-100 text-rose-950 shadow-[0_12px_36px_rgba(244,63,94,0.2)]'
                        )

  const workspaceShellRound = colorScheme === 'teal' ? 'rounded-sm' : 'rounded-3xl'

  const shellText = useMemo(() => {
    if (colorScheme === 'default') return darkMode ? 'text-slate-100' : 'text-slate-900'
    if (colorScheme === 'teal') return darkMode ? 'text-zinc-100' : 'text-gray-900'
    if (colorScheme === 'sunset') return darkMode ? 'text-slate-100' : 'text-indigo-950'
    if (colorScheme === 'wii') return darkMode ? 'text-gray-100' : 'text-gray-900'
    if (colorScheme === 'ps3' || colorScheme === 'xbox360') return colorScheme === 'xbox360' ? 'text-zinc-100' : 'text-slate-100'
    if (colorScheme === 'cube') return darkMode ? 'text-slate-100' : 'text-indigo-950'
    if (colorScheme === 'bee') return darkMode ? 'text-amber-50' : 'text-amber-950'
    if (colorScheme === 'wiiu') return darkMode ? 'text-cyan-50' : 'text-cyan-900'
    if (colorScheme === '3ds') return darkMode ? 'text-rose-50' : 'text-rose-900'
    if (colorScheme === 'violet') return 'text-slate-900 dark:text-slate-100'
    return 'text-slate-900 dark:text-slate-100'
  }, [colorScheme, darkMode])

  const loginIntroMuted = useMemo(
    () =>
      colorScheme === 'default'
        ? 'text-slate-600 dark:text-slate-400'
        : colorScheme === 'teal'
        ? 'text-gray-700 dark:text-gray-300'
        : colorScheme === 'sunset'
          ? darkMode
            ? 'text-slate-300'
            : 'text-indigo-900/75'
          : colorScheme === 'wii'
            ? darkMode
              ? 'text-gray-400'
              : 'text-gray-600'
            : colorScheme === 'ps3'
              ? 'text-slate-400'
              : colorScheme === 'xbox360'
                ? 'text-zinc-400'
              : colorScheme === 'cube'
                ? darkMode
                  ? 'text-slate-300'
                  : 'text-indigo-900/75'
                : colorScheme === 'bee'
                  ? darkMode
                    ? 'text-amber-200/85'
                    : 'text-amber-900/80'
                : colorScheme === 'wiiu'
                  ? darkMode
                    ? 'text-cyan-200/80'
                    : 'text-cyan-900/75'
                  : colorScheme === '3ds'
                    ? darkMode
                      ? 'text-rose-200/80'
                      : 'text-rose-900/75'
                    : 'text-slate-500 dark:text-slate-400',
    [colorScheme, darkMode]
  )

  const loginHeroTypography = useMemo(() => {
    if (colorScheme === 'default') {
      return {
        badge: darkMode ? 'text-slate-400' : 'text-slate-600',
        title: darkMode ? 'text-slate-100 drop-shadow-none' : 'text-slate-900 drop-shadow-none',
        body: darkMode ? 'text-slate-300 drop-shadow-none' : 'text-slate-600 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === 'sunset') {
      return {
        badge: 'text-indigo-950/90',
        title: 'text-indigo-950 drop-shadow-none',
        body: 'text-indigo-950/85 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === 'wii') {
      return {
        badge: 'text-gray-700/90 drop-shadow-sm',
        title: 'text-gray-900 drop-shadow-sm',
        body: 'text-gray-800/90 drop-shadow-sm'
      }
    }
    if (!darkMode && colorScheme === 'wiiu') {
      return {
        badge: 'text-cyan-800/90 drop-shadow-sm',
        title: 'text-cyan-900 drop-shadow-none',
        body: 'text-cyan-900/85 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === '3ds') {
      return {
        badge: 'text-rose-800/90 drop-shadow-sm',
        title: 'text-rose-900 drop-shadow-none',
        body: 'text-rose-900/85 drop-shadow-none'
      }
    }
    if (!darkMode && colorScheme === 'bee') {
      return {
        badge: 'text-amber-900/90',
        title: 'text-amber-950 drop-shadow-none',
        body: 'text-amber-900/85 drop-shadow-none'
      }
    }
    return {
      badge: 'text-white/85',
      title: 'drop-shadow-md',
      body: 'text-white/92 drop-shadow'
    }
  }, [colorScheme, darkMode])

  const headerSubtitleClass = useMemo(() => {
    if (colorScheme === 'default') return 'text-slate-500 dark:text-slate-400'
    if (colorScheme === 'teal') return 'text-gray-600 dark:text-gray-400'
    if (colorScheme === 'sunset') return 'text-slate-600 dark:text-slate-400'
    if (colorScheme === 'wii') return 'text-gray-600 dark:text-gray-400'
    if (colorScheme === 'ps3') return 'text-slate-400'
    if (colorScheme === 'xbox360') return 'text-lime-200/65 dark:text-zinc-400'
    if (colorScheme === 'cube') return 'text-slate-300/90 dark:text-slate-300/90'
    if (colorScheme === 'bee') return 'text-amber-800 dark:text-amber-200/90'
    if (colorScheme === 'wiiu') return 'text-cyan-700 dark:text-cyan-200'
    if (colorScheme === '3ds') return 'text-rose-700 dark:text-rose-200'
    return 'text-slate-500 dark:text-slate-400'
  }, [colorScheme, darkMode])

  const workspaceShellClass = useMemo(() => {
    if (!useThemeLayout) return 'max-w-7xl px-5 py-7'
    if (colorScheme === 'default') return 'max-w-7xl px-5 py-7'
    if (colorScheme === 'wiiu') return 'max-w-[88rem] px-6 py-8'
    if (colorScheme === '3ds') return 'max-w-3xl px-4 py-6'
    if (isPs3OrXbox360(colorScheme)) return 'max-w-[84rem] px-6 py-7'
    if (colorScheme === 'sunset') return 'max-w-5xl px-5 py-7'
    if (colorScheme === 'cube') return 'max-w-6xl px-5 py-7'
    if (colorScheme === 'bee') return 'max-w-[82rem] px-6 py-8'
    return 'max-w-7xl px-5 py-7'
  }, [colorScheme, useThemeLayout])

  const workspaceGridClass = cn(
    'ecs-workspace-grid motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:110ms]',
    chromeWeight === 'light' && 'ecs-chrome-grid--light',
    chromeWeight === 'heavy' && 'ecs-chrome-grid--heavy'
  )

  const characterRowSelected = useMemo(
    () =>
      colorScheme === 'default'
        ? 'border-slate-500 bg-slate-100 text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-50'
        : colorScheme === 'violet'
        ? 'border-sky-500 bg-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-sky-400 dark:bg-sky-950/35'
        : colorScheme === 'teal'
          ? 'border-[#000080] bg-[#000080] text-white shadow-[inset_2px_2px_6px_rgba(0,0,0,0.35)] dark:border-[#7cb9ff] dark:bg-[#003366] dark:text-white'
          : colorScheme === 'wii'
            ? 'border-sky-500 bg-white shadow-[0_8px_22px_rgba(14,165,233,0.22)] dark:border-sky-400 dark:bg-gray-700/90 dark:text-gray-50 dark:shadow-[0_8px_24px_rgba(56,189,248,0.18)]'
            : colorScheme === 'ps3'
              ? 'border-sky-400 bg-slate-800/95 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(56,189,248,0.2)]'
              : colorScheme === 'xbox360'
                ? 'border-lime-500/50 bg-zinc-900/95 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_18px_rgba(74,222,128,0.18)]'
                : colorScheme === 'cube'
                ? 'border-indigo-300 bg-slate-100/90 text-indigo-950 shadow-[0_0_20px_rgba(129,140,248,0.2)] dark:border-indigo-300 dark:bg-slate-800/85 dark:text-slate-100'
                : colorScheme === 'bee'
                  ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_18px_rgba(245,158,11,0.2)] dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-50'
                : colorScheme === 'wiiu'
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-cyan-300 dark:bg-cyan-950/35 dark:text-cyan-50'
                  : colorScheme === '3ds'
                    ? 'border-rose-400 bg-rose-50 text-rose-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-rose-400 dark:bg-rose-950/30 dark:text-rose-50'
                    : darkMode
                      ? 'border-cyan-400 bg-fuchsia-950/40 text-slate-50 shadow-[0_0_16px_rgba(34,211,238,0.18)]'
                      : 'border-fuchsia-500 bg-pink-50 text-indigo-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
    [colorScheme, darkMode]
  )

  const statusPill = useMemo(
    () =>
      colorScheme === 'default'
        ? 'rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
        : colorScheme === 'violet'
        ? 'rounded-full border border-cyan-200/75 bg-white/85 px-3 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-teal-800/70 dark:bg-slate-900/65 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        : colorScheme === 'teal'
          ? 'rounded-md border border-black/35 bg-[#ece9d8] px-3 py-1 text-xs font-medium text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02] dark:bg-[#5a5a5a] dark:text-gray-100 dark:shadow-[inset_-1px_-1px_0_#222,inset_1px_1px_0_#888]'
          : colorScheme === 'wii'
            ? 'rounded-full border border-gray-400/60 bg-white/92 px-3 py-1 text-xs text-gray-800 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-gray-600 dark:bg-gray-700/90 dark:text-gray-100'
            : colorScheme === 'ps3'
              ? 'rounded-md border border-slate-600 bg-slate-800/90 px-3 py-1 text-xs text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02]'
              : colorScheme === 'xbox360'
                ? 'rounded-md border border-zinc-600 bg-zinc-900/90 px-3 py-1 text-xs text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(74,222,128,0.12)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02]'
                : colorScheme === 'cube'
                ? 'rounded-full border border-indigo-300/60 bg-white/90 px-3 py-1 text-xs text-indigo-950 shadow-[0_0_14px_rgba(129,140,248,0.16)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-indigo-300/65 dark:bg-slate-800/80 dark:text-slate-100'
                : colorScheme === 'bee'
                  ? 'rounded-full border border-amber-400/70 bg-amber-50/95 px-3 py-1 text-xs text-amber-950 shadow-[0_0_14px_rgba(245,158,11,0.2)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-amber-400/55 dark:bg-stone-900/85 dark:text-amber-50'
                : colorScheme === 'wiiu'
                  ? 'rounded-full border border-cyan-300/65 bg-white/90 px-3 py-1 text-xs text-cyan-900 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-cyan-300/60 dark:bg-cyan-950/45 dark:text-cyan-50'
                  : colorScheme === '3ds'
                    ? 'rounded-md border border-rose-300/75 bg-white/92 px-3 py-1 text-xs text-rose-900 shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03] dark:border-rose-300/60 dark:bg-rose-950/45 dark:text-rose-50'
                    : cn(
                        'rounded-full border-2 px-3 py-1 text-xs font-medium motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.03]',
                        darkMode
                          ? 'border-cyan-400/45 bg-slate-950/70 text-slate-100 shadow-[0_0_18px_rgba(34,211,238,0.15)]'
                          : 'border-pink-400/85 bg-white/90 text-indigo-950 shadow-md'
                      ),
    [colorScheme, darkMode]
  )

  const loginOuterChrome = useMemo(() => {
    if (colorScheme === 'default') {
      return darkMode
        ? 'rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-md motion-safe:animate-ecs-fade-up'
        : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-md motion-safe:animate-ecs-fade-up'
    }
    if (colorScheme === 'teal') {
      return cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-black/55 bg-[#c0c0c0]/92 shadow-[8px_8px_0_rgba(0,0,0,0.14)] motion-safe:animate-ecs-fade-up dark:border-black/65 dark:bg-[#404040]/92 dark:shadow-[6px_6px_0_rgba(0,0,0,0.45)]'
      )
    }
    if (colorScheme === 'sunset') {
      return cn(
        'rounded-[2rem] border-2 p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode
          ? 'border-fuchsia-500/50 bg-slate-950/55 shadow-[0_0_40px_rgba(217,70,239,0.12)]'
          : 'border-pink-400/85 bg-white/55 shadow-xl'
      )
    }
    if (colorScheme === 'wii') {
      return cn(
        'rounded-[2.25rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-gray-600/50 bg-gray-900/45 shadow-[0_20px_55px_rgba(0,0,0,0.45)]' : 'border-white/70 bg-white/48 shadow-[0_22px_58px_rgba(15,23,42,0.09)]'
      )
    }
    if (colorScheme === 'ps3') {
      return 'rounded-2xl border border-slate-700/55 bg-slate-950/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl motion-safe:animate-ecs-fade-up'
    }
    if (colorScheme === 'xbox360') {
      return 'rounded-2xl border border-zinc-700/60 bg-zinc-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_24px_rgba(74,222,128,0.08)] backdrop-blur-xl motion-safe:animate-ecs-fade-up'
    }
    if (colorScheme === 'cube') {
      return cn(
        'rounded-[2rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-indigo-400/35 bg-slate-900/40 shadow-[0_0_32px_rgba(99,102,241,0.16)]' : 'border-indigo-300/50 bg-white/60 shadow-xl'
      )
    }
    if (colorScheme === 'bee') {
      return cn(
        'rounded-[2rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-amber-500/35 bg-stone-950/50 shadow-[0_0_28px_rgba(245,158,11,0.14)]' : 'border-amber-300/75 bg-amber-50/55 shadow-xl'
      )
    }
    if (colorScheme === 'wiiu') {
      return cn(
        'rounded-[1.6rem] border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-cyan-500/35 bg-slate-900/45 shadow-[0_0_30px_rgba(34,211,238,0.14)]' : 'border-cyan-200/75 bg-white/58 shadow-xl'
      )
    }
    if (colorScheme === '3ds') {
      return cn(
        'rounded-lg border p-4 backdrop-blur-xl motion-safe:animate-ecs-fade-up',
        darkMode ? 'border-rose-500/35 bg-zinc-900/52 shadow-[0_0_28px_rgba(244,63,94,0.15)]' : 'border-rose-200/80 bg-white/65 shadow-xl'
      )
    }
    return 'rounded-[2rem] border border-cyan-300/45 bg-white/40 p-4 shadow-aero-float backdrop-blur-xl motion-safe:animate-ecs-fade-up dark:border-teal-800/45 dark:bg-slate-950/45'
  }, [colorScheme, darkMode])

  const loginSignPanel = useMemo(() => {
    if (colorScheme === 'default') {
      return cn(
        'rounded-xl border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-slate-700 bg-slate-900 text-slate-100 shadow-sm'
          : 'border-slate-200 bg-white text-slate-900 shadow-sm'
      )
    }
    if (colorScheme === 'teal') {
      return 'ecs-panel-teal rounded-md p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]'
    }
    if (colorScheme === 'sunset') {
      return cn(
        'rounded-[1.75rem] border-2 p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-cyan-400/50 bg-slate-950/82 text-slate-100 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
          : 'border-pink-400/90 bg-white/88 text-indigo-950 shadow-lg'
      )
    }
    if (colorScheme === 'wii') {
      return cn(
        'rounded-[1.85rem] border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode ? 'border-gray-600/55 bg-gray-800/92 text-gray-100' : 'border-white/80 bg-white/90 text-gray-900'
      )
    }
    if (colorScheme === 'ps3') {
      return cn(
        'rounded-xl border border-slate-600/60 bg-slate-900/88 p-6 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]'
      )
    }
    if (colorScheme === 'xbox360') {
      return cn(
        'rounded-lg border border-zinc-600/65 bg-zinc-950/90 p-6 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(74,222,128,0.06)] motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]'
      )
    }
    if (colorScheme === 'cube') {
      return cn(
        'rounded-[1.1rem] border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-indigo-400/45 bg-slate-900/90 text-slate-100 shadow-[0_0_22px_rgba(99,102,241,0.14)]'
          : 'border-indigo-300/60 bg-white/92 text-indigo-950 shadow-lg'
      )
    }
    if (colorScheme === 'bee') {
      return cn(
        'rounded-[1.5rem] border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode
          ? 'border-amber-500/45 bg-stone-900/88 text-amber-50 shadow-[0_0_24px_rgba(245,158,11,0.12)]'
          : 'border-amber-300/85 bg-amber-50/92 text-amber-950 shadow-lg'
      )
    }
    if (colorScheme === 'wiiu') {
      return cn(
        'rounded-[1.25rem] border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode ? 'border-cyan-500/45 bg-slate-900/86 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.12)]' : 'border-cyan-200/85 bg-white/92 text-cyan-900 shadow-lg'
      )
    }
    if (colorScheme === '3ds') {
      return cn(
        'rounded-md border p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms]',
        darkMode ? 'border-rose-500/45 bg-zinc-900/90 text-rose-50 shadow-[0_0_22px_rgba(244,63,94,0.12)]' : 'border-rose-200/85 bg-white/94 text-rose-900 shadow-lg'
      )
    }
    return 'ecs-aero-glass-panel rounded-[1.75rem] border border-white/70 bg-white/82 p-6 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:90ms] dark:border-white/10 dark:bg-slate-900/82'
  }, [colorScheme, darkMode])

  /** Login page main grid: column ratios and density tuned per palette (F-pattern vs. form-forward, etc.). */
  const loginShellGridClass = useMemo(() => {
    const base =
      'grid min-h-[calc(100vh-3rem)] w-full grid-rows-1 items-stretch motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:45ms]'
    if (colorScheme === 'default') return cn(base, 'gap-5 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6')
    if (colorScheme === 'violet') return cn(base, 'gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-8')
    if (colorScheme === 'teal') return cn(base, 'gap-3 lg:grid-cols-[minmax(0,1fr)_min(26rem,100%)]')
    if (colorScheme === 'sunset') return cn(base, 'gap-6 lg:grid-cols-[1.24fr_0.76fr]')
    if (colorScheme === 'wii') return cn(base, 'gap-5 lg:grid-cols-[1.04fr_0.96fr]')
    if (isPs3OrXbox360(colorScheme)) return cn(base, 'gap-5 lg:grid-cols-[minmax(0,1.38fr)_minmax(14rem,0.62fr)]')
    if (colorScheme === 'cube') return cn(base, 'gap-6 lg:grid-cols-2')
    if (colorScheme === 'bee') return cn(base, 'gap-6 lg:grid-cols-[1.08fr_0.92fr]')
    if (colorScheme === 'wiiu') return cn(base, 'gap-5 lg:grid-cols-[1.02fr_0.98fr]')
    if (colorScheme === '3ds') return cn(base, 'gap-4 lg:grid-cols-[0.92fr_1.08fr]')
    return cn(base, 'gap-5 lg:grid-cols-[1.1fr_0.9fr]')
  }, [colorScheme])

  const loginHeroCopy = useMemo(
    () => ({
      badge: t('app.productTitle'),
      title: 'Sign in',
      body: ''
    }),
    [t]
  )

  const workspaceHomeHero = useMemo(() => {
    const email = authEmail.trim()
    const who = email || 'this account'
    const camp = selectedCampaignId ? activeCampaign?.name ?? 'Shared campaign' : 'Personal workspace'
    const n = characters.length
    return {
      badge: 'Home',
      title: `Signed in as ${who}`,
      body: `${n} character${n === 1 ? '' : 's'}. ${camp}. Use Sheet for edits; Battle needs a shared campaign.`
    }
  }, [authEmail, characters.length, selectedCampaignId, activeCampaign?.name])

  const loginSignHeadingClass = useMemo(() => {
    if (colorScheme === 'default') return darkMode ? 'text-slate-50' : 'text-slate-900'
    if (colorScheme === 'teal') return 'text-gray-900 dark:text-gray-50'
    if (colorScheme === 'sunset') return darkMode ? 'text-slate-50' : 'text-indigo-950'
    if (colorScheme === 'wii') return darkMode ? 'text-gray-50' : 'text-gray-900'
    if (colorScheme === 'ps3') return 'text-slate-50'
    if (colorScheme === 'xbox360') return 'text-zinc-50'
    if (colorScheme === 'cube') return darkMode ? 'text-slate-50' : 'text-indigo-950'
    if (colorScheme === 'bee') return darkMode ? 'text-amber-50' : 'text-amber-950'
    if (colorScheme === 'wiiu') return darkMode ? 'text-cyan-50' : 'text-cyan-950'
    if (colorScheme === '3ds') return darkMode ? 'text-rose-50' : 'text-rose-950'
    return 'text-cyan-950 dark:text-cyan-50'
  }, [colorScheme, darkMode])

  const loginAuthFieldClass = useMemo(() => {
    if (colorScheme === 'default') {
      return darkMode
        ? 'border border-slate-600 bg-slate-950/65 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25'
        : 'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/25'
    }
    if (colorScheme === 'violet') {
      return darkMode
        ? 'border border-teal-700/55 bg-slate-900/70 text-cyan-50 placeholder:text-cyan-200/45 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25'
        : 'border border-cyan-300/75 bg-white/92 text-cyan-950 placeholder:text-cyan-800/45 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/25'
    }
    if (colorScheme === 'teal') {
      return cn(
        'border border-black/45 bg-white text-gray-900 placeholder:text-gray-500 focus:border-[#000080] focus:outline-none focus:ring-1 focus:ring-[#000080]/35',
        'shadow-[inset_1px_1px_0_#ffffff,inset_-1px_-1px_0_#b8b8b8]',
        'dark:border-black/65 dark:bg-[#2a2a2a] dark:text-gray-100 dark:placeholder:text-gray-400 dark:shadow-[inset_1px_1px_0_#555,inset_-1px_-1px_0_#1a1a1a]'
      )
    }
    if (colorScheme === 'sunset') {
      return darkMode
        ? 'border-2 border-fuchsia-500/40 bg-slate-950/70 text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20'
        : 'border-2 border-pink-300/85 bg-white/92 text-indigo-950 placeholder:text-fuchsia-900/40 focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/25'
    }
    if (colorScheme === 'wii') {
      return darkMode
        ? 'border border-slate-600 bg-slate-800/80 text-gray-100 placeholder:text-gray-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20'
        : 'border border-slate-300/90 bg-white/96 text-gray-900 placeholder:text-gray-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/30'
    }
    if (colorScheme === 'ps3') {
      return 'border border-slate-600 bg-slate-900/88 text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25'
    }
    if (colorScheme === 'xbox360') {
      return 'border border-zinc-600 bg-zinc-950/90 text-zinc-100 placeholder:text-zinc-500 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400/22'
    }
    if (colorScheme === 'cube') {
      return darkMode
        ? 'border border-indigo-400/45 bg-slate-950/75 text-slate-100 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300/22'
        : 'border border-indigo-400/70 bg-white/95 text-indigo-950 placeholder:text-indigo-900/45 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/25'
    }
    if (colorScheme === 'bee') {
      return darkMode
        ? 'border border-amber-500/45 bg-stone-950/80 text-amber-50 placeholder:text-amber-200/45 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/22'
        : 'border border-amber-400/80 bg-white/95 text-amber-950 placeholder:text-amber-900/45 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400/25'
    }
    if (colorScheme === 'wiiu') {
      return darkMode
        ? 'border border-cyan-500/40 bg-slate-950/70 text-cyan-50 placeholder:text-cyan-200/50 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/20'
        : 'border border-cyan-300/80 bg-white/95 text-cyan-950 placeholder:text-cyan-800/50 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25'
    }
    if (colorScheme === '3ds') {
      return darkMode
        ? 'border border-rose-500/45 bg-zinc-950/75 text-rose-50 placeholder:text-rose-200/45 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-300/20'
        : 'border border-rose-300/90 bg-white text-rose-950 placeholder:text-rose-800/45 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/20'
    }
    return darkMode
      ? 'border border-teal-700/50 bg-slate-900/70 text-cyan-50 placeholder:text-cyan-200/50 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25'
      : 'border border-cyan-200/80 bg-white/92 text-cyan-950 placeholder:text-cyan-800/50 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/25'
  }, [colorScheme, darkMode])

  const loginPwdRulesPanelClass = useMemo(() => {
    if (colorScheme === 'default')
      return 'rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-xs dark:border-slate-600 dark:bg-slate-800/60'
    if (colorScheme === 'teal')
      return 'rounded-sm border border-black/35 bg-[#f0eee6] p-3 text-xs text-gray-900 shadow-[inset_1px_1px_0_#fff,inset_-1px_-1px_0_#b0b0b0] dark:border-black/55 dark:bg-[#3a3a3a] dark:text-gray-100 dark:shadow-[inset_1px_1px_0_#555,inset_-1px_-1px_0_#222]'
    if (colorScheme === 'sunset')
      return darkMode
        ? 'rounded-xl border border-fuchsia-500/35 bg-slate-900/60 p-3 text-xs'
        : 'rounded-xl border-2 border-pink-200/90 bg-pink-50/80 p-3 text-xs'
    if (colorScheme === 'ps3') return 'rounded-md border border-slate-600 bg-slate-800/80 p-3 text-xs'
    if (colorScheme === 'xbox360')
      return 'rounded-md border border-zinc-600/90 bg-zinc-900/82 p-3 text-xs shadow-[0_0_0_1px_rgba(74,222,128,0.08)]'
    if (colorScheme === 'cube')
      return darkMode ? 'rounded-lg border border-indigo-400/35 bg-slate-900/70 p-3 text-xs' : 'rounded-lg border border-indigo-200/90 bg-indigo-50/80 p-3 text-xs'
    if (colorScheme === 'bee')
      return darkMode ? 'rounded-xl border border-amber-500/35 bg-stone-900/70 p-3 text-xs' : 'rounded-xl border border-amber-200/90 bg-amber-50/90 p-3 text-xs'
    if (colorScheme === 'wiiu')
      return darkMode ? 'rounded-xl border border-cyan-500/35 bg-slate-900/65 p-3 text-xs' : 'rounded-xl border border-cyan-200/80 bg-cyan-50/85 p-3 text-xs'
    if (colorScheme === '3ds')
      return darkMode ? 'rounded-md border border-rose-500/35 bg-zinc-900/70 p-3 text-xs' : 'rounded-md border border-rose-200/90 bg-rose-50/90 p-3 text-xs'
    return 'rounded-xl border border-cyan-200/70 bg-white/80 p-3 text-xs dark:border-teal-700/50 dark:bg-slate-900/65'
  }, [colorScheme, darkMode])

  const loginGhostActionClass = useMemo(() => {
    if (colorScheme === 'default')
      return 'w-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800'
    if (colorScheme === 'teal')
      return 'w-full border border-black/40 bg-[#d4d0c8] px-3 py-2 text-sm font-semibold text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] hover:bg-[#c8c4bc] dark:border-black/55 dark:bg-[#4a4a4a] dark:text-gray-100 dark:shadow-[inset_-1px_-1px_0_#222,inset_1px_1px_0_#777] dark:hover:bg-[#555]'
    if (colorScheme === 'sunset')
      return darkMode
        ? 'w-full rounded-xl border border-cyan-400/40 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-slate-900'
        : 'w-full rounded-xl border-2 border-pink-300/80 bg-white/90 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-white'
    if (colorScheme === 'ps3')
      return 'w-full rounded-md border border-slate-500 bg-slate-800/90 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800'
    if (colorScheme === 'xbox360')
      return 'w-full rounded-md border border-zinc-600 bg-zinc-900/90 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 shadow-[0_0_0_1px_rgba(74,222,128,0.1)]'
    if (colorScheme === 'cube')
      return darkMode
        ? 'w-full rounded-lg border border-indigo-400/40 bg-slate-900/75 px-3 py-2 text-sm font-semibold text-indigo-100 hover:bg-slate-900'
        : 'w-full rounded-lg border border-indigo-300/80 bg-white/95 px-3 py-2 text-sm font-semibold text-indigo-950 hover:bg-white'
    if (colorScheme === 'bee')
      return darkMode
        ? 'w-full rounded-xl border border-amber-500/40 bg-stone-900/75 px-3 py-2 text-sm font-semibold text-amber-50 hover:bg-stone-900'
        : 'w-full rounded-xl border border-amber-300/85 bg-white/95 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-50/80'
    if (colorScheme === 'wiiu')
      return darkMode
        ? 'w-full rounded-xl border border-cyan-500/40 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-cyan-50 hover:bg-slate-900'
        : 'w-full rounded-xl border border-cyan-300/80 bg-white/95 px-3 py-2 text-sm font-semibold text-cyan-950 hover:bg-white'
    if (colorScheme === '3ds')
      return darkMode
        ? 'w-full rounded-md border border-rose-400/40 bg-zinc-900/75 px-3 py-2 text-sm font-semibold text-rose-50 hover:bg-zinc-900'
        : 'w-full rounded-md border border-rose-300/85 bg-white px-3 py-2 text-sm font-semibold text-rose-950 hover:bg-rose-50/80'
    return 'w-full rounded-xl border border-sky-300 bg-sky-50/90 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-white dark:border-sky-500/40 dark:bg-slate-900/70 dark:text-sky-200 dark:hover:bg-slate-900'
  }, [colorScheme, darkMode])

  const loginSmtpOutlineClass = useMemo(() => {
    if (colorScheme === 'ps3')
      return 'w-full rounded-md border border-sky-500/50 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-slate-800/80'
    if (colorScheme === 'xbox360')
      return 'w-full rounded-md border border-lime-500/45 px-3 py-2 text-sm font-semibold text-lime-100 hover:bg-zinc-900/90'
    if (colorScheme === 'teal')
      return 'w-full rounded-md border border-black/40 bg-[#ece9d8] px-3 py-2 text-sm font-semibold text-[#000080] hover:bg-[#ddd9d0] dark:border-black/55 dark:bg-[#4a4a4a] dark:text-[#9ec1ff] dark:hover:bg-[#555]'
    return cn(
      'w-full rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
      colorScheme === 'sunset' && (darkMode ? 'border-cyan-400/45 text-cyan-100 hover:bg-slate-900/80' : 'border-fuchsia-300 text-fuchsia-900 hover:bg-pink-50'),
      colorScheme === 'bee' && (darkMode ? 'border-amber-400/45 text-amber-100 hover:bg-stone-900/85' : 'border-amber-500/50 text-amber-950 hover:bg-amber-50'),
      colorScheme === 'default' && 'border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-500/45 dark:text-sky-200 dark:hover:bg-slate-800/80',
      !['sunset', 'default', 'ps3', 'xbox360', 'teal', 'bee'].includes(colorScheme) &&
        'border-indigo-300 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-slate-800/80'
    )
  }, [colorScheme, darkMode])

  const loginAuthMessageClass = useMemo(() => {
    if (colorScheme === 'ps3') return 'text-slate-300'
    if (colorScheme === 'xbox360') return 'text-zinc-300'
    if (colorScheme === 'teal') return 'text-gray-800 dark:text-gray-200'
    if (colorScheme === 'sunset') return darkMode ? 'text-slate-200' : 'text-indigo-900/90'
    if (colorScheme === 'bee') return darkMode ? 'text-amber-100/90' : 'text-amber-950/90'
    if (colorScheme === '3ds') return darkMode ? 'text-rose-100/90' : 'text-rose-900/90'
    return 'text-slate-600 dark:text-slate-300'
  }, [colorScheme, darkMode])

  const loginShellMaxClass = useMemo(() => {
    if (colorScheme === '3ds') return 'max-w-[52rem]'
    if (isPs3OrXbox360(colorScheme)) return 'max-w-[70rem]'
    if (colorScheme === 'sunset') return 'max-w-[72rem]'
    if (colorScheme === 'cube') return 'max-w-[68rem]'
    if (colorScheme === 'bee') return 'max-w-[76rem]'
    return 'max-w-6xl'
  }, [colorScheme])

  const loginSignColumnClass = useMemo(() => {
    if (isPs3OrXbox360(colorScheme)) return 'w-full min-w-0 lg:max-w-[22rem] lg:justify-self-end'
    if (colorScheme === 'teal') return 'w-full min-w-0 lg:max-w-none'
    return 'w-full min-w-0'
  }, [colorScheme])

  const reorderWorkspaceFlow = useCallback((from: WorkspaceFlowRegion, to: WorkspaceFlowRegion) => {
    if (from === to) return
    setRegionFlowCustom(true)
    setWorkspaceFlow((prev) => {
      const fi = prev.indexOf(from)
      const ti = prev.indexOf(to)
      if (fi === -1 || ti === -1) return prev
      const next = [...prev]
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      return next
    })
    setActiveUiPresetId(null)
  }, [])

  const moveWorkspaceRegionByOffset = useCallback((region: WorkspaceFlowRegion, delta: -1 | 1) => {
    setRegionFlowCustom(true)
    setWorkspaceFlow((prev) => {
      const i = prev.indexOf(region)
      if (i === -1) return prev
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const tmp = next[i]!
      next[i] = next[j]!
      next[j] = tmp!
      return next
    })
    setActiveUiPresetId(null)
  }, [])

  const moveWorkspaceRegionToIndex = useCallback((region: WorkspaceFlowRegion, targetIndex: number) => {
    setRegionFlowCustom(true)
    setWorkspaceFlow((prev) => {
      const i = prev.indexOf(region)
      if (i === -1) return prev
      const next = prev.filter((r) => r !== region)
      const clamped = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(clamped, 0, region)
      return next
    })
    setActiveUiPresetId(null)
  }, [])

  function updateBattleDraft(
    characterId: string,
    patch: Partial<BattleDraft>
  ): void {
    setBattleDrafts((prev) => ({
      ...prev,
      [characterId]: {
        hpCurrent: prev[characterId]?.hpCurrent ?? 0,
        armorCurrent: prev[characterId]?.armorCurrent ?? 0,
        initiative: prev[characterId]?.initiative ?? 0,
        notes: prev[characterId]?.notes ?? '',
        conditions: prev[characterId]?.conditions ?? [],
        selectedAction: prev[characterId]?.selectedAction ?? '',
        ...patch
      }
    }))
  }

  function saveBattleRow(characterId: string): void {
    const base = characters.find((row) => row.id === characterId)
    if (!base) return
    setAppMessage(`Encounter state updated for ${base.name} (character sheet unchanged).`)
  }

  function moveParticipantToIndex(characterId: string, targetIndex: number): void {
    setBattleParticipants((prev) => {
      const currentIndex = prev.indexOf(characterId)
      if (currentIndex === -1) {
        if (showFirstDragHint) {
          setShowFirstDragHint(false)
          try {
            window.localStorage.setItem(DRAG_HINT_DISMISSED_KEY, '1')
          } catch {
            // ignore storage errors
          }
        }
        const next = [...prev]
        const clamped = Math.max(0, Math.min(targetIndex, next.length))
        next.splice(clamped, 0, characterId)
        return next
      }
      const next = [...prev]
      next.splice(currentIndex, 1)
      const clamped = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(clamped, 0, characterId)
      return next
    })
  }

  function removeParticipant(characterId: string): void {
    setBattleParticipants((prev) => prev.filter((id) => id !== characterId))
  }

  function addVisibleRosterToEncounter(): void {
    const visibleIds = filteredCharacters.map((character) => character.id)
    setBattleParticipants((prev) => {
      const onBoard = new Set(prev)
      const toAdd = visibleIds.filter((id) => !onBoard.has(id))
      if (toAdd.length === 0) {
        queueMicrotask(() =>
          setAppMessage('Everyone in the current roster filter is already on the board.')
        )
        return prev
      }
      queueMicrotask(() =>
        setAppMessage(
          `Added ${toAdd.length} character${toAdd.length === 1 ? '' : 's'} from the roster filter to the encounter.`
        )
      )
      return [...prev, ...toAdd]
    })
  }

  function sortParticipantsByInitiative(): void {
    setBattleParticipants((prev) =>
      [...prev].sort((a, b) => {
        const ai = battleDrafts[a]?.initiative ?? 0
        const bi = battleDrafts[b]?.initiative ?? 0
        return bi - ai
      })
    )
  }

  function nextTurn(): void {
    if (battleParticipants.length === 0) return
    setActiveTurnIndex((prev) => {
      const next = prev + 1
      if (next >= battleParticipants.length) {
        setEncounterRound((round) => round + 1)
        return 0
      }
      return next
    })
  }

  function loadEncounterFromSheets(): void {
    const next: Record<string, BattleDraft> = {}
    for (const row of characters) {
      next[row.id] = {
        hpCurrent: row.hpCurrent,
        armorCurrent: row.armorCurrent,
        initiative: row.stats?.initiative ?? 0,
        notes: row.notes ?? '',
        conditions: [],
        selectedAction: ''
      }
    }
    setBattleDrafts(next)
    setEncounterRound(1)
    setActiveTurnIndex(0)
    setAppMessage('Encounter values reset from character sheets.')
  }

  const wsTab = workspaceTab
  const devCommands = useMemo(
    () => [
      {
        id: 'open-workshop',
        label: 'Open Workshop',
        run: () => setShowDevPanel(true)
      },
      {
        id: 'open-theme-menu',
        label: 'Open Theme menu',
        run: () => openThemeMenu()
      },
      {
        id: 'open-settings-menu',
        label: 'Open Settings menu',
        run: () => {
          setShowThemeMenu(false)
          setShowSettingsMenu(true)
        }
      },
      {
        id: 'toggle-layout-editor',
        label: layoutEditMode ? 'Disable layout editor' : 'Enable layout editor',
        run: () => setLayoutEditMode((v) => !v)
      },
      {
        id: 'go-home',
        label: 'Switch to Home tab',
        run: () => setWorkspaceTab('home')
      },
      {
        id: 'go-sheet',
        label: 'Switch to Sheet tab',
        run: () => setWorkspaceTab('sheet')
      },
      {
        id: 'go-battle',
        label: 'Switch to Battle tab',
        run: () => setWorkspaceTab('battle')
      },
      {
        id: 'toggle-ui-bounds',
        label: devLabFlags.showUiBounds ? 'Disable UI bounds overlay' : 'Enable UI bounds overlay',
        run: () => setDevLabFlags((prev) => ({ ...prev, showUiBounds: !prev.showUiBounds }))
      },
      {
        id: 'toggle-verbose-feed',
        label: devLabFlags.verboseActivityFeed ? 'Disable verbose activity feed' : 'Enable verbose activity feed',
        run: () => setDevLabFlags((prev) => ({ ...prev, verboseActivityFeed: !prev.verboseActivityFeed }))
      }
    ],
    [
      openThemeMenu,
      layoutEditMode,
      setLayoutEditMode,
      setWorkspaceTab,
      devLabFlags.showUiBounds,
      devLabFlags.verboseActivityFeed
    ]
  )
  const filteredDevCommands = useMemo(() => {
    const q = devCommandQuery.trim().toLowerCase()
    if (!q) return devCommands
    return devCommands.filter((cmd) => cmd.label.toLowerCase().includes(q) || cmd.id.includes(q))
  }, [devCommands, devCommandQuery])

  const runDevCommand = useCallback(
    (commandId: string): void => {
      const cmd = devCommands.find((row) => row.id === commandId)
      if (!cmd) return
      cmd.run()
      setShowDevCommandPalette(false)
      setAppMessage(`Ran command: ${cmd.label}`)
    },
    [devCommands]
  )
  const shouldShowUpdatePrompt =
    updateStatus.phase === 'available' &&
    !!updateStatus.version &&
    dismissedUpdateVersion !== updateStatus.version
  const downloadProgress = typeof updateStatus.progress === 'number' ? Math.max(0, Math.min(100, updateStatus.progress)) : 0
  const handleBeginUpdateDownload = useCallback(async (): Promise<void> => {
    if (!updaterApiAvailable) return
    const result = await backend.appApi.updateDownload().catch(() => ({ ok: false as const, message: 'Download failed.' }))
    if (!result.ok) setAppMessage(result.message ?? 'Download failed.')
  }, [updaterApiAvailable])
  const handleInstallUpdate = useCallback(async (): Promise<void> => {
    if (!updaterApiAvailable) return
    const result = await backend.appApi.updateInstall().catch(() => ({ ok: false as const, message: 'Install failed.' }))
    if (!result.ok) setAppMessage(result.message ?? 'Install failed.')
  }, [updaterApiAvailable])
  const handleRevealLegacyInstall = useCallback(async (): Promise<void> => {
    if (!legacyInstallApiAvailable) return
    const path = legacyInstallPaths[0]
    if (!path) return
    const result = await backend.appApi.openPath(path).catch(() => ({ ok: false as const, message: 'Unable to open path.' }))
    if (!result.ok) setAppMessage(result.message ?? 'Unable to open path.')
  }, [legacyInstallApiAvailable, legacyInstallPaths])
  const handleManualUpdateCheck = useCallback(async (): Promise<void> => {
    if (!updaterApiAvailable) {
      setAuthMessage('Update checks are available in packaged desktop builds.')
      return
    }
    setLastUpdateCheckAt(Date.now())
    const result: { ok: boolean; message?: string } = await backend.appApi
      .updateCheck()
      .catch(() => ({ ok: false, message: 'Unable to check for updates.' }))
    if (!result.ok && result.message) setAuthMessage(result.message)
    else if (result.ok) setAuthMessage('Checking for updates...')
  }, [updaterApiAvailable])
  const updatePrompt = shouldShowUpdatePrompt ? (
    <div className="pointer-events-auto fixed left-1/2 top-3 z-[130] flex w-[min(94vw,42rem)] -translate-x-1/2 items-start gap-3 rounded-xl border-2 border-emerald-300 bg-white/95 px-3 py-2.5 text-sm text-zinc-900 shadow-xl backdrop-blur-sm motion-safe:animate-ecs-pop-in dark:border-emerald-500/45 dark:bg-zinc-950/95 dark:text-zinc-50">
      <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none text-emerald-600 dark:text-emerald-300">
        ↑
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        Update available: <strong>v{updateStatus.version}</strong>
        {appVersion ? ` (you are on v${appVersion}).` : '.'} Download and install directly in Tactile.
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleBeginUpdateDownload()}
          className="ecs-interactive rounded-md border border-emerald-400/75 bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600 dark:border-emerald-500/45 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Download now
        </button>
        <button
          type="button"
          aria-label="Dismiss update prompt"
          onClick={() => {
            const version = updateStatus.version ?? null
            setDismissedUpdateVersion(version)
            if (!version) return
            try {
              window.localStorage.setItem(UPDATE_PROMPT_DISMISSED_KEY, version)
            } catch {
              // ignore storage write issues
            }
          }}
          className="ecs-interactive rounded-md border border-zinc-300 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
        >
          ×
        </button>
      </div>
    </div>
  ) : null
  const showUpdateOverlay = updateStatus.phase === 'checking' || updateStatus.phase === 'downloading'
  const updateOverlay = showUpdateOverlay ? (
    <div className="fixed inset-0 z-[70000] flex items-center justify-center bg-slate-950/82 px-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/92 p-6 text-slate-50 shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/45 bg-cyan-500/10">
          <EcsLogoMark className="h-10 w-10 motion-safe:animate-[spin_2.2s_linear_infinite]" />
        </div>
        <h3 className="mt-4 text-center text-xl font-semibold">
          {updateStatus.phase === 'checking' ? 'Checking for update...' : 'Downloading update...'}
        </h3>
        <p className="mt-2 text-center text-sm text-slate-300">{updateStatus.message ?? 'Preparing updater...'}</p>
        {updateStatus.phase === 'downloading' ? (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${downloadProgress}%` }} />
            </div>
            <p className="mt-2 text-center text-xs font-medium text-cyan-200">{downloadProgress}% complete</p>
          </div>
        ) : null}
      </div>
    </div>
  ) : null
  const installPrompt = updateStatus.phase === 'downloaded' ? (
    <div className="pointer-events-auto fixed left-1/2 top-3 z-[130] flex w-[min(94vw,42rem)] -translate-x-1/2 items-start gap-3 rounded-xl border-2 border-cyan-300 bg-white/95 px-3 py-2.5 text-sm text-zinc-900 shadow-xl backdrop-blur-sm motion-safe:animate-ecs-pop-in dark:border-cyan-500/45 dark:bg-zinc-950/95 dark:text-zinc-50">
      <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none text-cyan-600 dark:text-cyan-300">
        ✓
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        Update {updateStatus.version ? `v${updateStatus.version}` : ''} downloaded. Restart to install now.
      </div>
      <button
        type="button"
        onClick={() => void handleInstallUpdate()}
        className="ecs-interactive shrink-0 rounded-md border border-cyan-400/75 bg-cyan-500 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-600 dark:border-cyan-500/45 dark:bg-cyan-600 dark:hover:bg-cyan-500"
      >
        Restart & install
      </button>
    </div>
  ) : null
  const hasUpdateBanner = Boolean(updatePrompt || installPrompt)
  const showLegacyInstallPrompt =
    legacyInstallApiAvailable && !dismissLegacyCleanupPrompt && legacyInstallPaths.length > 0
  const legacyInstallPrompt = showLegacyInstallPrompt ? (
    <div
      className={cn(
        'pointer-events-auto fixed left-1/2 z-[129] flex w-[min(94vw,46rem)] -translate-x-1/2 items-start gap-3 rounded-xl border border-amber-300/85 bg-amber-50/95 px-3 py-2.5 text-sm text-amber-950 shadow-xl backdrop-blur-sm motion-safe:animate-ecs-pop-in dark:border-amber-500/45 dark:bg-zinc-950/95 dark:text-amber-100',
        hasUpdateBanner ? 'top-[4.25rem]' : 'top-3'
      )}
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none text-amber-700 dark:text-amber-300">
        !
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        Found older app install{legacyInstallPaths.length > 1 ? 's' : ''} on this Mac. Delete them to avoid opening the wrong
        version by mistake.
      </div>
      <button
        type="button"
        onClick={() => void handleRevealLegacyInstall()}
        className="ecs-interactive shrink-0 rounded-md border border-amber-400/75 bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600 dark:border-amber-500/45 dark:bg-amber-600 dark:hover:bg-amber-500"
      >
        Show old app
      </button>
      <button
        type="button"
        aria-label="Dismiss cleanup prompt"
        onClick={() => setDismissLegacyCleanupPrompt(true)}
        className="ecs-interactive shrink-0 rounded-md border border-zinc-300 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
      >
        ×
      </button>
    </div>
  ) : null
  const hasTopBanner = Boolean(updatePrompt || installPrompt || legacyInstallPrompt)
  const isCheckingUpdates = updateStatus.phase === 'checking'
  const secondsSinceLastCheck = lastUpdateCheckAt ? Math.max(0, Math.round((Date.now() - lastUpdateCheckAt) / 1000)) : null
  const lastCheckedLabel = lastUpdateCheckAt
    ? secondsSinceLastCheck !== null && secondsSinceLastCheck < 45
      ? 'Last checked just now'
      : `Last checked ${new Date(lastUpdateCheckAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit'
        })}`
    : 'Not checked yet'

  if (!isAuthed) {
    const authField = cn('ecs-ui-input w-full px-3 py-2', ecsWideControlRound(colorScheme), loginAuthFieldClass)
    return (
      <div
        className={cn(
          'ecs-theme-shell ecs-signature-shell ecs-aero-login-shell relative min-h-screen overflow-x-clip leading-relaxed',
          shellText
        )}
        data-ecs-login="1"
      >
        <EcsPaletteBackdrop />
        {updatePrompt}
        {installPrompt}
        {legacyInstallPrompt}
        {updateOverlay}
        <div className="relative z-[1] px-4 py-6">
          <div className={cn('mx-auto w-full', loginShellMaxClass)}>
            {colorScheme === 'teal' ? (
              <div className={loginOuterChrome}>
                <div className="flex select-none items-center justify-between border-b border-black/40 bg-gradient-to-r from-[#000080] to-[#1084d0] px-2 py-1 dark:border-black/55">
                  <span className="truncate pl-0.5 text-left text-[11px] font-bold tracking-wide text-white">
                    {t('app.productTitle')}
                  </span>
                  <span className="inline-flex gap-0.5 pr-0.5" aria-hidden>
                    <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-[#c0c0c0]/95 shadow-[inset_-1px_-1px_0_#555]" />
                    <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-[#c0c0c0]/95 shadow-[inset_-1px_-1px_0_#555]" />
                    <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-[#c0c0c0]/95 shadow-[inset_-1px_-1px_0_#555]" />
                  </span>
                </div>
                <div className={cn(loginShellGridClass, 'min-h-0 flex-1 p-2 sm:p-3')}>
                  <div className="flex min-h-0 flex-col gap-4 lg:min-h-[min(100%,calc(100vh-5.5rem))]">
                    <section
                      className={cn(
                        'ecs-login-hero-panel relative flex shrink-0 flex-col overflow-hidden bg-gradient-to-br p-7 shadow-aero-float',
                        'rounded-md border border-black/50 shadow-[4px_4px_0_rgba(0,0,0,0.14)] dark:border-black/55 dark:shadow-[4px_4px_0_rgba(0,0,0,0.35)]',
                        scheme.grad
                      )}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 opacity-[0.14] motion-safe:animate-ecs-aero-ribbon"
                        style={{
                          background:
                            'repeating-linear-gradient(-12deg, transparent, transparent 14px, rgba(255,255,255,0.35) 14px, rgba(255,255,255,0.35) 16px)'
                        }}
                        aria-hidden
                      />
                      <div className="relative shrink-0">
                        <div className="flex items-center gap-3">
                          <EcsLogoMark className="h-10 w-10" />
                          <div className={cn('text-xs font-semibold uppercase tracking-[0.25em]', loginHeroTypography.badge)}>
                            {loginHeroCopy.badge}
                          </div>
                        </div>
                        <h1 className={cn('mt-4 text-4xl font-bold leading-tight', loginHeroTypography.title)}>
                          {loginHeroCopy.title}
                        </h1>
                        {loginHeroCopy.body ? (
                          <p className={cn('mt-3 max-w-xl text-sm leading-relaxed', loginHeroTypography.body)}>
                            {loginHeroCopy.body}
                          </p>
                        ) : null}
                      </div>
                    </section>
                    <LoginUpdateLog className="relative min-h-0 flex-1" colorScheme={colorScheme} />
                  </div>

                  <section className={cn('ecs-login-auth-panel ecs-ui-surface', loginSignPanel, loginSignColumnClass)}>
                    <h2 className={cn('text-2xl font-bold tracking-tight', loginSignHeadingClass)}>
                      {authMode === 'login' ? 'Sign in' : null}
                      {authMode === 'register' ? 'Create your account' : null}
                      {authMode === 'reset' ? 'Reset your password' : null}
                      {authMode === 'dev' ? 'Developer access' : null}
                    </h2>
                    <p className={cn('mt-1 text-sm leading-relaxed', loginIntroMuted)}>
                      {authMode === 'login' ? 'Use your username or email and password.' : null}
                      {authMode === 'register' ? 'Pick a display name and a strong password to get started.' : null}
                      {authMode === 'reset' ? 'Request a one-time token, then set a new password.' : null}
                      {authMode === 'dev' ? 'Restricted access mode.' : null}
                    </p>

                    <div role="tablist" aria-label="Authentication mode" className="mt-4 flex flex-wrap gap-2">
                      {(['login', 'register'] as AuthMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="tab"
                          aria-selected={authMode === mode}
                          onClick={() => setAuthMode(mode)}
                          className={cn(
                            'ecs-interactive ecs-ui-btn ecs-ui-btn-quiet px-3 py-1.5 text-xs font-semibold uppercase motion-safe:active:scale-[0.98]',
                            ecsAuthControlRound(colorScheme),
                            authMode === mode ? scheme.primary : loginMutedBtn
                          )}
                        >
                          {mode === 'login' ? 'Sign in' : 'Register'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAuthMode('reset')}
                        aria-pressed={authMode === 'reset'}
                        className={cn(
                          'ecs-interactive ecs-ui-btn ecs-ui-btn-quiet ml-auto px-3 py-1.5 text-xs font-semibold motion-safe:active:scale-[0.98]',
                          ecsAuthControlRound(colorScheme),
                          authMode === 'reset' ? scheme.primary : loginMutedBtn
                        )}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {showAdvancedAuthTools ? (
                        <button
                          type="button"
                          onClick={() => setAuthMode('dev')}
                          aria-pressed={authMode === 'dev'}
                          className={cn(
                            'ecs-interactive ecs-ui-btn ecs-ui-btn-quiet px-2 py-1 text-[11px] font-semibold uppercase',
                            ecsAuthControlRound(colorScheme),
                            authMode === 'dev' ? scheme.primary : loginMutedBtn
                          )}
                        >
                          Dev mode
                        </button>
                      ) : null}
                    </div>

                    {authMode === 'dev' ? (
                      <div className="mt-4 space-y-2">
                        <input
                          value={devPassword}
                          onChange={(event) => setDevPassword(event.target.value)}
                          type="password"
                          placeholder="Dev mode password"
                          className={authField}
                        />
                        <p className={cn('text-xs', loginAuthMessageClass)}>Dev mode is password-only for quick local access.</p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {authMode === 'register' ? (
                          <input
                            value={authDisplayName}
                            onChange={(event) => setAuthDisplayName(event.target.value)}
                            placeholder="Display name"
                            className={authField}
                          />
                        ) : null}
                        <input
                          value={authEmail}
                          onChange={(event) => setAuthEmail(event.target.value)}
                          placeholder={authMode === 'login' ? 'Email or username' : 'Email'}
                          className={authField}
                        />
                        <input
                          value={authMode === 'reset' ? newResetPassword : authPassword}
                          onChange={(event) =>
                            authMode === 'reset'
                              ? setNewResetPassword(event.target.value)
                              : setAuthPassword(event.target.value)
                          }
                          type="password"
                          placeholder={authMode === 'reset' ? 'New password' : 'Password'}
                          className={authField}
                        />
                        {authMode === 'reset' ? (
                          <button
                            type="button"
                            onClick={() => void handleRequestResetToken()}
                            className={loginGhostActionClass}
                          >
                            Request reset token
                          </button>
                        ) : null}
                        {authMode === 'reset' ? (
                          <input
                            value={resetToken}
                            onChange={(event) => setResetToken(event.target.value)}
                            placeholder="Reset token"
                            className={authField}
                          />
                        ) : null}
                        {authMode === 'register' ? (
                          <ul className={cn(loginPwdRulesPanelClass)}>
                            {pwdRules.map((rule) => (
                              <li
                                key={rule.label}
                                className={rule.pass ? 'text-emerald-600 dark:text-emerald-300' : loginAuthMessageClass}
                              >
                                {rule.pass ? '✓' : '•'} {rule.label}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <label className="inline-flex items-center gap-2 px-1 text-xs text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={rememberLogin}
                            onChange={(event) => setRememberLogin(event.target.checked)}
                            className="h-3.5 w-3.5 rounded border border-slate-300 accent-sky-500 dark:border-slate-600"
                          />
                          Remember me on this device
                        </label>
                        {showAdvancedAuthTools ? (
                          <>
                            <button type="button" onClick={() => void handleSendTestEmail()} className={loginSmtpOutlineClass}>
                              Send test email
                            </button>
                            <button type="button" onClick={() => void handleCheckSmtpStatus()} className={loginSmtpOutlineClass}>
                              Check email setup
                            </button>
                          </>
                        ) : null}
                        {smtpMessage ? (
                          <p className="ecs-ui-subtle-panel rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
                            {smtpMessage}
                          </p>
                        ) : null}
                        {resetTokenHint ? (
                          <p className="ecs-ui-subtle-panel rounded-lg border-amber-300/80 bg-amber-100/75 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100">
                            {resetTokenHint}
                          </p>
                        ) : null}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleAuthSubmit()}
                      className={cn(
                        'ecs-ui-btn-primary mt-4 w-full px-4 py-2 text-sm font-semibold transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                        ecsWideControlRound(colorScheme),
                        scheme.primary
                      )}
                    >
                      {authMode === 'login' ? 'Sign in' : null}
                      {authMode === 'register' ? 'Create account' : null}
                      {authMode === 'reset' ? 'Set new password' : null}
                      {authMode === 'dev' ? 'Unlock dev mode' : null}
                    </button>
                    {authMessage ? <p className={cn('mt-3 text-sm', loginAuthMessageClass)}>{authMessage}</p> : null}
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={handleBuildStampTap}
                        className="select-none rounded px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-400/70 hover:text-slate-500 dark:text-slate-500/70 dark:hover:text-slate-400"
                        aria-label="App build stamp"
                      >
                        {appVersion ? `v${appVersion}` : ' '}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className={cn(loginShellGridClass, loginOuterChrome)}>
                <div className="flex min-h-0 flex-col gap-4 lg:min-h-[min(100%,calc(100vh-3rem))]">
                  <section
                    className={cn(
                      'ecs-login-hero-panel relative flex shrink-0 flex-col overflow-hidden bg-gradient-to-br p-7 shadow-aero-float',
                      colorScheme === 'violet' &&
                        (useShapeSoft
                          ? 'ecs-diagonal-strip rounded-[1.75rem]'
                          : 'ecs-shape-banner ecs-diagonal-strip rounded-[1.75rem]'),
                      colorScheme === 'sunset' &&
                        (useShapeSoft
                          ? 'ecs-diagonal-strip rounded-[1.75rem]'
                          : 'ecs-shape-banner ecs-diagonal-strip rounded-[1.75rem]'),
                      colorScheme === 'wii' &&
                        'rounded-[2rem] border border-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-gray-600/45',
                      colorScheme === 'ps3' &&
                        'rounded-xl border border-slate-700/55 shadow-[inset_0_0_48px_rgba(0,0,0,0.35)]',
                      colorScheme === 'xbox360' &&
                        'rounded-lg border border-lime-700/25 shadow-[inset_0_0_40px_rgba(0,0,0,0.45),0_0_28px_rgba(74,222,128,0.08)]',
                      colorScheme === 'cube' &&
                        'rounded-[1.2rem] border border-indigo-300/45 shadow-[0_0_34px_rgba(99,102,241,0.24)] dark:border-indigo-400/35',
                      colorScheme === 'bee' &&
                        'rounded-[1.65rem] border-2 border-amber-300/75 shadow-[0_0_32px_rgba(245,158,11,0.22)] dark:border-amber-500/40',
                      colorScheme === 'wiiu' &&
                        'rounded-[1.5rem] border border-cyan-200/55 shadow-[0_0_30px_rgba(34,211,238,0.22)] dark:border-cyan-500/35',
                      colorScheme === '3ds' &&
                        'rounded-md border border-rose-300/70 shadow-[0_0_26px_rgba(244,63,94,0.22)] dark:border-rose-500/35',
                      colorScheme === 'default' &&
                        'rounded-2xl border border-slate-200 shadow-md dark:border-slate-700',
                      scheme.grad,
                      !darkMode && colorScheme === 'sunset' && 'text-indigo-950',
                      !darkMode && colorScheme === 'wii' && 'text-gray-900',
                      !darkMode && colorScheme === 'wiiu' && 'text-cyan-900',
                      !darkMode && colorScheme === '3ds' && 'text-rose-900',
                      !darkMode && colorScheme === 'bee' && 'text-amber-950',
                      !darkMode && colorScheme === 'default' && 'text-slate-900',
                      (darkMode || !['sunset', 'wii', 'wiiu', '3ds', 'default', 'bee'].includes(colorScheme)) && 'text-white'
                    )}
                  >
                    {colorScheme === 'violet' ? (
                      <>
                        <div
                          className="pointer-events-none absolute -right-24 top-8 h-56 w-56 rounded-[58%_42%_55%_45%] bg-white/25 blur-2xl motion-safe:animate-ecs-aero-float"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-72 rotate-12 rounded-[45%_55%_48%_52%] bg-lime-300/25 blur-2xl motion-safe:animate-ecs-aero-float"
                          style={{ animationDelay: '-7s' }}
                          aria-hidden
                        />
                      </>
                    ) : null}
                    {colorScheme === 'sunset' ? (
                      <>
                        <div
                          className="pointer-events-none absolute -left-10 top-1/4 h-44 w-44 rounded-full bg-fuchsia-400/30 blur-3xl motion-safe:animate-ecs-aero-float dark:bg-fuchsia-600/20"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute -bottom-8 right-0 h-52 w-52 rounded-full bg-cyan-400/25 blur-3xl motion-safe:animate-ecs-aero-float dark:bg-cyan-500/15"
                          style={{ animationDelay: '-9s' }}
                          aria-hidden
                        />
                      </>
                    ) : null}
                    {colorScheme === 'wii' ? (
                      <>
                        <div
                          className="ecs-wii-shine-bubble pointer-events-none -left-[12%] top-[18%] h-56 w-56 motion-safe:animate-ecs-wii-drift"
                          aria-hidden
                        />
                        <div
                          className="ecs-wii-shine-bubble pointer-events-none bottom-[8%] right-[-8%] h-48 w-72 opacity-30 motion-safe:animate-ecs-wii-drift"
                          style={{ animationDelay: '-8s' }}
                          aria-hidden
                        />
                      </>
                    ) : null}
                    {colorScheme === 'ps3' ? (
                      <>
                        <div
                          className="ecs-xmb-wave-layer motion-safe:animate-ecs-xmb-wave pointer-events-none"
                          aria-hidden
                        />
                        <div className="ecs-xmb-login-sheen motion-safe:animate-ecs-xmb-wave pointer-events-none" aria-hidden />
                      </>
                    ) : null}
                    {colorScheme === 'xbox360' ? (
                      <>
                        <div
                          className="ecs-nxe-blade-sweep motion-safe:animate-ecs-nxe-drift pointer-events-none opacity-80"
                          aria-hidden
                        />
                        <div className="ecs-nxe-ring-glow pointer-events-none opacity-70" aria-hidden />
                      </>
                    ) : null}
                    {colorScheme === 'cube' ? (
                      <>
                        <div className="ecs-cube-sphere-glow pointer-events-none motion-safe:animate-ecs-aero-float" aria-hidden />
                        <div
                          className="pointer-events-none absolute right-[12%] top-[14%] h-36 w-36 rotate-12 rounded-3xl border border-white/15 bg-white/5 blur-[1px]"
                          aria-hidden
                        />
                      </>
                    ) : null}
                    {colorScheme === 'bee' ? (
                      <div className="ecs-bee-nectar-glow pointer-events-none motion-safe:animate-ecs-aero-float" aria-hidden />
                    ) : null}
                    {colorScheme === 'wiiu' ? (
                      <div className="ecs-wiiu-bar pointer-events-none motion-safe:animate-ecs-aero-ribbon" aria-hidden />
                    ) : null}
                    {colorScheme === '3ds' ? (
                      <div className="ecs-3ds-hinge pointer-events-none" aria-hidden />
                    ) : null}
                    <div className="relative shrink-0">
                      <div className="flex items-center gap-3">
                        <EcsLogoMark className="h-10 w-10" />
                        <div className={cn('text-xs font-semibold uppercase tracking-[0.25em]', loginHeroTypography.badge)}>
                          {loginHeroCopy.badge}
                        </div>
                      </div>
                      <h1 className={cn('mt-4 text-4xl font-bold leading-tight', loginHeroTypography.title)}>
                        {loginHeroCopy.title}
                      </h1>
                      {loginHeroCopy.body ? (
                        <p className={cn('mt-3 max-w-xl text-sm leading-relaxed', loginHeroTypography.body)}>
                          {loginHeroCopy.body}
                        </p>
                      ) : null}
                    </div>
                  </section>
                  <LoginUpdateLog className="relative min-h-0 flex-1" colorScheme={colorScheme} />
                </div>

                <section className={cn('ecs-login-auth-panel ecs-ui-surface', loginSignPanel, loginSignColumnClass)}>
                  <h2 className={cn('text-2xl font-bold tracking-tight', loginSignHeadingClass)}>
                    {authMode === 'login' ? 'Sign in' : null}
                    {authMode === 'register' ? 'Create your account' : null}
                    {authMode === 'reset' ? 'Reset your password' : null}
                    {authMode === 'dev' ? 'Developer access' : null}
                  </h2>
                  <p className={cn('mt-1 text-sm leading-relaxed', loginIntroMuted)}>
                    {authMode === 'login' ? 'Use your username or email and password.' : null}
                    {authMode === 'register' ? 'Pick a display name and a strong password to get started.' : null}
                    {authMode === 'reset' ? 'Request a one-time token, then set a new password.' : null}
                    {authMode === 'dev' ? 'Restricted access mode.' : null}
                  </p>

                  <div role="tablist" aria-label="Authentication mode" className="mt-4 flex flex-wrap gap-2">
                    {(['login', 'register'] as AuthMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={authMode === mode}
                        onClick={() => setAuthMode(mode)}
                        className={cn(
                          'ecs-interactive ecs-ui-btn ecs-ui-btn-quiet px-3 py-1.5 text-xs font-semibold uppercase motion-safe:active:scale-[0.98]',
                          ecsAuthControlRound(colorScheme),
                          authMode === mode ? scheme.primary : loginMutedBtn
                        )}
                      >
                        {mode === 'login' ? 'Sign in' : 'Register'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAuthMode('reset')}
                      aria-pressed={authMode === 'reset'}
                      className={cn(
                        'ecs-interactive ecs-ui-btn ecs-ui-btn-quiet ml-auto px-3 py-1.5 text-xs font-semibold motion-safe:active:scale-[0.98]',
                        ecsAuthControlRound(colorScheme),
                        authMode === 'reset' ? scheme.primary : loginMutedBtn
                      )}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {showAdvancedAuthTools ? (
                      <button
                        type="button"
                        onClick={() => setAuthMode('dev')}
                        aria-pressed={authMode === 'dev'}
                        className={cn(
                          'ecs-interactive ecs-ui-btn ecs-ui-btn-quiet px-2 py-1 text-[11px] font-semibold uppercase',
                          ecsAuthControlRound(colorScheme),
                          authMode === 'dev' ? scheme.primary : loginMutedBtn
                        )}
                      >
                        Dev mode
                      </button>
                    ) : null}
                  </div>

                  {authMode === 'dev' ? (
                    <div className="mt-4 space-y-2">
                      <input
                        value={devPassword}
                        onChange={(event) => setDevPassword(event.target.value)}
                        type="password"
                        placeholder="Dev mode password"
                        className={authField}
                      />
                      <p className={cn('text-xs', loginAuthMessageClass)}>Dev mode is password-only for quick local access.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {authMode === 'register' ? (
                        <input
                          value={authDisplayName}
                          onChange={(event) => setAuthDisplayName(event.target.value)}
                          placeholder="Display name"
                          className={authField}
                        />
                      ) : null}
                      <input
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        placeholder={authMode === 'login' ? 'Email or username' : 'Email'}
                        className={authField}
                      />
                      <input
                        value={authMode === 'reset' ? newResetPassword : authPassword}
                        onChange={(event) =>
                          authMode === 'reset'
                            ? setNewResetPassword(event.target.value)
                            : setAuthPassword(event.target.value)
                        }
                        type="password"
                        placeholder={authMode === 'reset' ? 'New password' : 'Password'}
                        className={authField}
                      />
                      {authMode === 'reset' ? (
                        <button type="button" onClick={() => void handleRequestResetToken()} className={loginGhostActionClass}>
                          Request reset token
                        </button>
                      ) : null}
                      {authMode === 'reset' ? (
                        <input
                          value={resetToken}
                          onChange={(event) => setResetToken(event.target.value)}
                          placeholder="Reset token"
                          className={authField}
                        />
                      ) : null}
                      {authMode === 'register' ? (
                        <ul className={cn(loginPwdRulesPanelClass)}>
                          {pwdRules.map((rule) => (
                            <li
                              key={rule.label}
                              className={rule.pass ? 'text-emerald-600 dark:text-emerald-300' : loginAuthMessageClass}
                            >
                              {rule.pass ? '✓' : '•'} {rule.label}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <label className="inline-flex items-center gap-2 px-1 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={rememberLogin}
                          onChange={(event) => setRememberLogin(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border border-slate-300 accent-sky-500 dark:border-slate-600"
                        />
                        Remember me on this device
                      </label>
                      {showAdvancedAuthTools ? (
                        <>
                          <button type="button" onClick={() => void handleSendTestEmail()} className={loginSmtpOutlineClass}>
                            Send test email
                          </button>
                          <button type="button" onClick={() => void handleCheckSmtpStatus()} className={loginSmtpOutlineClass}>
                            Check email setup
                          </button>
                        </>
                      ) : null}
                      {smtpMessage ? (
                        <p className="ecs-ui-subtle-panel rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
                          {smtpMessage}
                        </p>
                      ) : null}
                      {resetTokenHint ? (
                        <p className="ecs-ui-subtle-panel rounded-lg border-amber-300/80 bg-amber-100/75 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100">
                          {resetTokenHint}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleAuthSubmit()}
                    className={cn(
                      'ecs-ui-btn-primary mt-4 w-full px-4 py-2 text-sm font-semibold transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                      ecsWideControlRound(colorScheme),
                      scheme.primary
                    )}
                  >
                    {authMode === 'login' ? 'Sign in' : null}
                    {authMode === 'register' ? 'Create account' : null}
                    {authMode === 'reset' ? 'Set new password' : null}
                    {authMode === 'dev' ? 'Unlock dev mode' : null}
                  </button>
                  {authMessage ? <p className={cn('mt-3 text-sm', loginAuthMessageClass)}>{authMessage}</p> : null}
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={handleBuildStampTap}
                      className="select-none rounded px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-400/70 hover:text-slate-500 dark:text-slate-500/70 dark:hover:text-slate-400"
                      aria-label="App build stamp"
                    >
                      {appVersion ? `v${appVersion}` : ' '}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
        <div className="fixed bottom-4 right-4 z-[140] flex flex-col items-end gap-1.5 rounded-lg border border-slate-300/70 bg-white/85 p-2 shadow-xl backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-950/82">
          <button
            type="button"
            onClick={() => void handleManualUpdateCheck()}
            disabled={isCheckingUpdates}
            className="ecs-interactive inline-flex items-center gap-1.5 rounded-md border border-sky-300/80 bg-sky-500 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-500/55 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <span aria-hidden>{isCheckingUpdates ? '↻' : '⟳'}</span>
            {isCheckingUpdates ? 'Checking updates...' : 'Check for updates'}
          </button>
          <p className="px-1 text-[10px] text-slate-600 dark:text-slate-300">
            {lastCheckedLabel}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('ecs-theme-shell ecs-signature-shell relative min-h-screen overflow-x-clip overflow-y-visible leading-relaxed', shellText)}>
      {updatePrompt}
      {installPrompt}
      {legacyInstallPrompt}
      {updateOverlay}
      {syncBanner ? (
        <div
          role="status"
          className={cn(
            'pointer-events-auto fixed left-1/2 z-[120] flex max-w-md -translate-x-1/2 items-start gap-2 rounded-xl border border-sky-200/90 bg-sky-50/95 px-3 py-2 text-sm text-sky-950 shadow-lg backdrop-blur-sm motion-safe:animate-ecs-pop-in dark:border-sky-500/35 dark:bg-sky-950/90 dark:text-sky-50',
            hasTopBanner ? 'top-[4.25rem]' : 'top-3'
          )}
        >
          <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">↻</span>
          <span className="min-w-0 flex-1 leading-snug">{syncBanner}</span>
          <button
            type="button"
            aria-label="Dismiss sync notice"
            onClick={() => {
              if (syncBannerClearRef.current) clearTimeout(syncBannerClearRef.current)
              syncBannerClearRef.current = null
              setSyncBanner(null)
            }}
            className="ecs-interactive shrink-0 rounded-md border border-sky-300/80 px-2 py-0.5 text-xs font-semibold text-sky-900 hover:bg-sky-100/80 dark:border-sky-400/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
          >
            ×
          </button>
        </div>
      ) : null}
      {appMessage ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-auto fixed right-4 z-[125] flex w-[min(92vw,22rem)] items-start gap-2 rounded-xl border-2 border-amber-300 bg-white/95 px-3 py-2.5 text-sm text-zinc-900 shadow-xl backdrop-blur-sm motion-safe:animate-ecs-pop-in dark:border-amber-500/45 dark:bg-zinc-950/95 dark:text-zinc-50',
            syncBanner && hasTopBanner ? 'top-[8.5rem]' : syncBanner || hasTopBanner ? 'top-[4.25rem]' : 'top-3'
          )}
        >
          <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none text-amber-600 dark:text-amber-300">
            ◆
          </span>
          <span className="min-w-0 flex-1 leading-snug">{appMessage}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setAppMessage(null)}
            className="ecs-interactive shrink-0 rounded-md border border-zinc-300 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            ×
          </button>
        </div>
      ) : null}
      {showDevCommandPalette && isDevAccount && devLabFlags.enableCommandPalette ? (
        <div className="fixed inset-0 z-[51000] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close command palette"
            onClick={() => setShowDevCommandPalette(false)}
            className="absolute inset-0"
          />
          <div className="relative z-[1] w-full max-w-xl rounded-xl border border-slate-300 bg-white/95 shadow-2xl dark:border-slate-700 dark:bg-slate-950/95">
            <div className="border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Command palette
            </div>
            <input
              autoFocus
              value={devCommandQuery}
              onChange={(event) => setDevCommandQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setShowDevCommandPalette(false)
                  return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (filteredDevCommands.length > 0) runDevCommand(filteredDevCommands[0].id)
                }
              }}
              placeholder="Type a command..."
              className="w-full border-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <ul className="max-h-72 overflow-y-auto border-t border-slate-200 px-2 py-2 dark:border-slate-700">
              {filteredDevCommands.length > 0 ? (
                filteredDevCommands.map((cmd, idx) => (
                  <li key={cmd.id}>
                    <button
                      type="button"
                      onClick={() => runDevCommand(cmd.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70',
                        idx === 0 && 'bg-slate-100 dark:bg-slate-800/60'
                      )}
                    >
                      <span>{cmd.label}</span>
                      <span className="font-mono text-[10px] text-slate-400">{cmd.id}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400">No command matches this search.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
      <EcsPaletteBackdrop />
      <div
        className={cn(
          'relative mx-auto',
          workspaceShellClass,
          layoutEditMode &&
            'rounded-xl outline outline-1 outline-dashed outline-amber-400/45 outline-offset-1 dark:outline-amber-500/35'
        )}
      >
        <DevToolsPanel
          open={showDevPanel && isDevAccount}
          onClose={() => setShowDevPanel(false)}
          activeTab={devPanelTab}
          setActiveTab={setDevPanelTab}
          colorScheme={colorScheme}
          setColorScheme={applyColorSchemeSelection}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          useThemeLayout={useThemeLayout}
          setUseThemeLayout={setUseThemeLayout}
          mergeGeneratedAttacks={mergeGeneratedAttacks}
          persistThemePerAccount={persistThemePerAccount}
          uiSoundsEnabled={uiSoundsEnabled}
          beeThemeUnlocked={beeThemeUnlocked}
          rulesMode={rulesMode}
          setRulesMode={setRulesMode}
          cornerStyle={cornerStyle}
          chromeWeight={chromeWeight}
          sidebarPlacement={sidebarPlacement}
          sidebarWidth={sidebarWidth}
          workspaceDensity={workspaceDensity}
          workspaceFlow={workspaceFlow}
          regionFlowCustom={regionFlowCustom}
          activeUiPresetId={activeUiPresetId}
          layoutEditMode={layoutEditMode}
          activeAccountId={activeAccountId}
          characters={characters}
          campaigns={campaigns}
          campaignMembers={campaignMembers}
          workspaceTab={workspaceTab}
          selectedCampaignId={selectedCampaignId}
          editor={editor}
          battleParticipants={battleParticipants}
          battleDrafts={battleDrafts}
          encounterRound={encounterRound}
          setAppMessage={setAppMessage}
          reloadCharacters={() => loadCharacters(activeAccountId ?? '', selectedCampaignId)}
          guidedSetup={guidedSetup}
          setGuidedSetup={setGuidedSetup}
          setLayoutEditMode={setLayoutEditMode}
          setShowThemeMenu={setShowThemeMenu}
          setShowSettingsMenu={setShowSettingsMenu}
          setWorkspaceTab={setWorkspaceTab}
          compactCreator={compactCreator}
          setCompactCreator={setCompactCreator}
          compactBattle={compactBattle}
          setCompactBattle={setCompactBattle}
          setMergeGeneratedAttacks={setMergeGeneratedAttacks}
          setCornerStyle={setCornerStyle}
          setChromeWeight={setChromeWeight}
          setWorkspaceDensity={setWorkspaceDensity}
          setSidebarPlacement={setSidebarPlacement}
          setSidebarWidth={setSidebarWidth}
          setUiSoundsEnabled={setUiSoundsEnabled}
          setPersistThemePerAccount={setPersistThemePerAccount}
          setActiveUiPresetId={setActiveUiPresetId}
          uiCopyOverrides={uiCopyOverrides}
          setUiCopyOverrides={setUiCopyOverrides}
          devLabFlags={devLabFlags}
          setDevLabFlags={setDevLabFlags}
        >
        <div className="ecs-workspace-flow">
        <header
          className={cn(headerChrome, 'ecs-signature-header')}
          data-region="header"
          style={{ order: workspaceFlow.indexOf('header') }}
        >
          {colorScheme === 'teal' ? (
            <>
              <div
                className="pointer-events-none absolute left-0 right-0 top-0 h-2 rounded-none bg-gradient-to-r from-[#000080] to-[#1084d0]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute right-2 top-0 flex h-2 items-center gap-[3px] pr-1"
                aria-hidden
              >
                <span className="block h-1.5 w-3 rounded-[2px] bg-[#c0c0c0]/85" />
                <span className="block h-1.5 w-3 rounded-[2px] bg-[#c0c0c0]/85" />
                <span className="block h-1.5 w-3 rounded-[2px] bg-[#ff6b6b]/85" />
              </div>
            </>
          ) : null}
          {colorScheme === 'ps3' ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-400/75 to-transparent"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'xbox360' ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-lime-400/65 to-transparent"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'wii' && !darkMode ? (
            <div
              className="pointer-events-none absolute inset-x-6 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'cube' ? (
            <div
              className="pointer-events-none absolute bottom-2 left-3 top-3 w-1 rounded-full bg-gradient-to-b from-indigo-300 to-slate-200 opacity-90"
              aria-hidden
            />
          ) : null}
          {colorScheme === 'sunset' ? (
            <div
              className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-70 motion-safe:animate-ecs-pulse-soft"
              style={{
                background:
                  'conic-gradient(from 220deg at 50% 50%, rgba(244,114,182,0.0), rgba(244,114,182,0.18), rgba(56,189,248,0.16), rgba(190,242,100,0.12), rgba(244,114,182,0.0))',
                filter: 'blur(28px)'
              }}
              aria-hidden
            />
          ) : null}
          <div className="relative z-[1] flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <EcsLogoMark className="h-9 w-9" />
                <h1
                  className={cn(
                    'ecs-product-wordmark text-3xl font-bold tracking-tight sm:text-4xl',
                    colorScheme === 'sunset' && 'ecs-y2k-text-glow'
                  )}
                >
                  {t('app.productTitle')}
                </h1>
              </div>
              <p className={cn('ecs-product-tagline mt-2 max-w-xl text-sm leading-relaxed', headerSubtitleClass)}>
                {t('app.productTagline')}
              </p>
              {isDevAccount ? (
                <div className="ecs-logo-preview-strip mt-2 flex items-center gap-1.5" title="Logo stress preview at small sizes">
                  {LOGO_MARK_VARIANTS.map((variant) => (
                    <EcsLogoMark
                      key={variant}
                      variant={variant}
                      className={cn(
                        'h-6 w-6 border-current/25 bg-current/5',
                        variant === ACTIVE_LOGO_MARK && 'ring-1 ring-current/25'
                      )}
                    />
                  ))}
                  <EcsLogoMark variant={ACTIVE_LOGO_MARK} className="h-4 w-4 border-current/25 bg-current/5" />
                </div>
              ) : null}
            </div>
            <div className="ecs-signature-toolbar relative flex flex-wrap items-center gap-2">
              {isDevAccount ? (
                <button
                  type="button"
                  onClick={() => setShowDevPanel(true)}
                  aria-expanded={showDevPanel}
                  title="Open the Workshop docked beside the workspace (themes, layout, paths, UI copy)"
                  className="ecs-interactive ecs-toolbar-btn ecs-ui-btn-secondary inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border-2 border-zinc-500 bg-zinc-900 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-lg hover:bg-zinc-800 dark:border-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  <span aria-hidden className="text-lg leading-none">
                    ◆
                  </span>
                  <span>Workshop</span>
                </button>
              ) : null}
              <div
                className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold dark:border-slate-600"
                role="group"
                aria-label="Character sheet rules mode"
              >
                <button
                  type="button"
                  aria-pressed={rulesMode === 'ttrpg'}
                  onClick={() => setRulesMode('ttrpg')}
                  title="Lightweight generic character sheet"
                  className={cn(
                    'ecs-interactive ecs-toolbar-btn ecs-ui-btn px-2.5 py-1.5 transition-colors',
                    rulesMode === 'ttrpg'
                      ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                  )}
                >
                  TTRPG
                </button>
                <button
                  type="button"
                  aria-pressed={rulesMode === 'dnd'}
                  onClick={() => setRulesMode('dnd')}
                  title="DnD 5e-style abilities, skills, and sheet"
                  className={cn(
                    'ecs-interactive ecs-toolbar-btn ecs-ui-btn border-l border-slate-300 px-2.5 py-1.5 transition-colors dark:border-slate-600',
                    rulesMode === 'dnd'
                      ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                  )}
                >
                  DnD
                </button>
              </div>
              <button
                type="button"
                aria-pressed={layoutEditMode}
                onClick={() => {
                  setShowThemeMenu(false)
                  setShowSettingsMenu(false)
                  setLayoutEditMode((prev) => !prev)
                }}
                title={
                  layoutEditMode
                    ? 'Exit workspace order mode'
                    : 'Reorder title bar, status strip, and main column (bottom panel)'
                }
                className={cn(
                  'ecs-interactive ecs-toolbar-btn ecs-ui-btn ecs-ui-btn-quiet inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold active:brightness-95',
                  layoutEditMode
                    ? 'border-amber-500 bg-amber-100 text-amber-950 shadow-sm dark:border-amber-400 dark:bg-amber-500/20 dark:text-amber-50'
                    : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/70'
                )}
              >
                <span aria-hidden className="text-sm leading-none">
                  ⇅
                </span>
                <span className="hidden sm:inline">Layout</span>
                <span className="sm:hidden">Move UI</span>
              </button>
              <button
                ref={themeMenuButtonRef}
                type="button"
                onClick={() => {
                  if (showThemeMenu) {
                    setShowThemeMenu(false)
                  } else {
                    openThemeMenu()
                  }
                }}
                aria-haspopup="dialog"
                aria-expanded={showThemeMenu}
                title="Themes, layout, and appearance"
                className="ecs-interactive ecs-toolbar-btn ecs-ui-btn ecs-ui-btn-quiet inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 active:brightness-95 dark:border-slate-700 dark:hover:bg-slate-800/70"
              >
                <span aria-hidden className="text-sm leading-none">
                  ◐
                </span>
                <span>Theme</span>
              </button>
              <button
                ref={settingsButtonRef}
                type="button"
                onClick={() => {
                  setShowThemeMenu(false)
                  setShowSettingsMenu((prev) => !prev)
                }}
                aria-haspopup="dialog"
                aria-expanded={showSettingsMenu}
                title="Open workspace settings"
                className="ecs-interactive ecs-toolbar-btn ecs-ui-btn ecs-ui-btn-quiet inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 active:brightness-95 dark:border-slate-700 dark:hover:bg-slate-800/70"
              >
                <span aria-hidden className="text-sm leading-none">⚙</span>
                <span>Settings</span>
              </button>
              <span aria-hidden className="hidden h-5 w-px bg-slate-300/70 sm:inline-block dark:bg-slate-700/70" />
              <button
                type="button"
                onClick={() => void handleLogout('Logged out.')}
                title="Sign out of this workspace"
                className="ecs-interactive ecs-toolbar-btn ecs-ui-btn ecs-ui-btn-danger inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 active:brightness-95 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <span aria-hidden className="text-sm leading-none">⏻</span>
                <span>Logout</span>
              </button>
            </div>
          </div>
          {colorScheme === 'teal' ? (
            <div
              className="ecs-win98-menubar relative z-[1] mt-2 flex items-center gap-3 border-t border-black/35 pt-1 text-[11px] font-semibold tracking-wide text-gray-800 dark:border-black/55 dark:text-gray-200"
              aria-hidden
            >
              <span><u>F</u>ile</span>
              <span><u>E</u>dit</span>
              <span><u>V</u>iew</span>
              <span><u>H</u>elp</span>
            </div>
          ) : null}
        </header>

        <div
          data-region="status"
          style={{ order: workspaceFlow.indexOf('status') }}
          className="ecs-workspace-status flex flex-col gap-2 motion-safe:animate-ecs-fade-up motion-safe:[animation-delay:55ms]"
        >
          <div className="flex flex-wrap gap-2">
            <div className={cn(statusPill, 'ecs-status-pill')}>
              Mode: <span className="font-semibold">{rulesMode === 'dnd' ? 'DnD' : 'TTRPG'}</span>
            </div>
            <div className={cn(statusPill, 'ecs-status-pill')}>
              Characters: <span className="font-semibold">{characters.length}</span>
            </div>
            <div className={cn(statusPill, 'ecs-status-pill')}>
              {t('workspace.campaignLabel')}: <span className="font-semibold">{activeCampaign?.name ?? 'Personal'}</span>
            </div>
          </div>
          <div
            className={cn(
              'ecs-signature-panel w-full rounded-xl border border-slate-200/80 bg-white/50 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-950/30',
              cardClass
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="ecs-ui-field-label">
                {t('activity.heading')}
              </span>
              {activityFeed.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setActivityFeed([])}
                  className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet rounded-md border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {activityFeed.length === 0 ? (
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {t('activity.emptyBlurb')}
              </p>
            ) : (
              <ul
                className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300"
                aria-label="Recent workspace activity"
                aria-live="polite"
              >
                {activityFeed.map((entry) => {
                  const glyph = activityKindGlyph(entry.kind)
                  return (
                    <li key={entry.entryId} className="flex items-start gap-1.5">
                      <span
                        aria-hidden
                        title={glyph.label}
                        className={cn(
                          'mt-px shrink-0 select-none text-[12px] font-bold leading-none',
                          glyph.tone
                        )}
                      >
                        {glyph.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="whitespace-nowrap font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {formatLocalActivityTime(entry.at)}
                        </span>{' '}
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {activeAccountId && entry.actorAccountId === activeAccountId ? 'You' : entry.actorDisplayName}
                        </span>{' '}
                        {devLabFlags.verboseActivityFeed ? (
                          <span className="mr-1 rounded border border-slate-300 px-1 py-0 text-[9px] font-mono uppercase text-slate-500 dark:border-slate-600 dark:text-slate-400">
                            {entry.kind}
                          </span>
                        ) : null}
                        <span className="text-slate-600 dark:text-slate-300">{entry.summary}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div className={workspaceGridClass} data-region="grid" style={{ order: workspaceFlow.indexOf('grid') }}>
          <aside
            className={cn(
              workspaceShellRound,
              'ecs-sidebar-shell ecs-signature-panel min-w-0 p-4 shadow-sm lg:sticky lg:top-5 lg:h-fit',
              cardClass
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="ecs-ui-section-title">{t('sidebar.charactersHeading')}</h2>
              <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                {filteredCharacters.length} of {characters.length}
              </span>
            </div>
            {selectedCampaignId && workspaceTab === 'battle' ? (
              <div className="mt-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2 py-1 text-[10px] leading-snug text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
                <span aria-hidden className="mr-1">⠿</span>
                {t('sidebar.battleDragHint')}
              </div>
            ) : null}
            <div className="mt-2 space-y-1.5">
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                  🔍
                </span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('sidebar.searchPlaceholder')}
                  aria-label="Search characters"
                  className="ecs-ui-input w-full rounded-lg border border-slate-300 bg-transparent py-1.5 pl-6 pr-7 text-xs dark:border-slate-700"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {factionOptions.length > 0 ? (
                <select
                  value={factionFilter}
                  onChange={(event) => setFactionFilter(event.target.value)}
                  aria-label="Filter by faction"
                  className="ecs-ui-input w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700"
                >
                  <option value="all">All factions</option>
                  {factionOptions.map((faction) => (
                    <option key={faction} value={faction}>
                      {faction}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <button
              type="button"
              onClick={openQuickCreate}
              title="Guided 4-step character creation"
              className={cn(
                'ecs-primary-cta ecs-ui-btn-primary mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                scheme.primary
              )}
            >
              <span aria-hidden>＋</span>
              <span>{t('sidebar.newCharacter')}</span>
            </button>
            {filteredCharacters.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-5 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <span aria-hidden className="text-2xl leading-none opacity-70">
                  {characters.length === 0 ? '🛡️' : '🔍'}
                </span>
                <p className="text-[12px] font-semibold leading-snug text-slate-600 dark:text-slate-300">
                  {characters.length === 0 ? t('sidebar.emptyRoster') : t('sidebar.emptyFilter')}
                </p>
                {characters.length === 0 ? (
                  <button
                    type="button"
                    onClick={openQuickCreate}
                    className={cn(
                      'mt-1 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95',
                      scheme.primary
                    )}
                  >
                    <span aria-hidden>＋</span>
                    <span>Create your first</span>
                  </button>
                ) : (
                  (search || factionFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setFactionFilter('all')
                      }}
                      className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet mt-1 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    >
                      Clear filters
                    </button>
                  )
                )}
              </div>
            ) : (
              <ul className="ecs-character-list mt-2 space-y-1.5">
                {filteredCharacters.map((character) => {
                  const isDraggable = Boolean(selectedCampaignId && workspaceTab === 'battle' && !layoutEditMode)
                  return (
                    <li key={character.id}>
                      <button
                        type="button"
                        draggable={isDraggable}
                        onDragStart={() => setDragCharacterId(character.id)}
                        onDragEnd={() => setDragCharacterId(null)}
                        onClick={() => openCharacter(character)}
                        title={isDraggable ? `Click to open • drag to add to battle` : 'Open character'}
                        className={cn(
                          'ecs-character-row flex w-full items-center gap-2 border px-2 py-1.5 text-left motion-safe:transition-[border-color,box-shadow,background-color] motion-safe:duration-200 motion-safe:hover:shadow-md motion-safe:hover:border-slate-300 dark:motion-safe:hover:border-slate-600',
                          ecsCharacterRowRound(colorScheme),
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                          selectedId === character.id
                            ? characterRowSelected
                            : 'border-slate-200 dark:border-slate-700'
                        )}
                      >
                        {isDraggable ? (
                          <span aria-hidden className="text-slate-400 dark:text-slate-500" title="Draggable">
                            ⠿
                          </span>
                        ) : null}
                        {character.portraitRelativePath ? (
                          <span className="ecs-portrait-hex h-10 w-9 shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
                            <img
                              alt=""
                              src={ecsPortraitSrc(character.portraitRelativePath)}
                              className="h-full w-full object-cover"
                            />
                          </span>
                        ) : (
                          <span className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 dark:border-slate-600 dark:text-slate-500">
                            —
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">{character.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono">
                              {character.hpCurrent}/{character.hpMax}
                            </span>
                            <span className="mx-1 text-slate-400">HP</span>
                            {character.factionGroup ? (
                              <>
                                <span className="text-slate-400">·</span>{' '}
                                <span className="truncate">{character.factionGroup}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
              <h3 className="ecs-ui-section-title text-slate-500 dark:text-slate-400">
                {t('sidebar.sharingHeading')}
              </h3>
              {guidedSetup ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                  {t('sidebar.guidedBlurb')}
                </p>
              ) : null}

              {activeCampaign ? (
                <>
                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1 dark:border-slate-700 dark:bg-slate-900/40">
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                      title={activeCampaign.code}
                    >
                      {activeCampaign.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(activeCampaign.code)
                        setAppMessage(`Copied ${activeCampaign.code} to clipboard.`)
                      }}
                      className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800/80"
                      title="Copy join code"
                    >
                      Copy
                    </button>
                  </div>
                  <details className="mt-1.5 rounded-md border border-slate-200 dark:border-slate-700">
                    <summary className="cursor-pointer select-none list-none px-2 py-1 text-[10px] font-semibold text-slate-600 marker:content-none dark:text-slate-300 [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-2">
                        <span>Members & leave</span>
                        <span className="font-normal text-slate-400">{campaignMembers.length}</span>
                      </span>
                    </summary>
                    <div className="border-t border-slate-200 px-2 pb-2 pt-1.5 dark:border-slate-700">
                      {campaignMembers.length === 0 ? (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">No members loaded yet.</div>
                      ) : (
                        <ul className="max-h-20 space-y-0.5 overflow-y-auto text-[10px] leading-tight">
                          {campaignMembers.map((member) => (
                            <li key={member.id} className="truncate">
                              <span className="font-medium">{member.displayName}</span>{' '}
                              <span className="text-slate-500">({member.email})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleLeaveCampaign()}
                        className="ecs-ui-btn ecs-ui-btn-danger mt-2 w-full rounded border border-rose-300 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        Leave campaign
                      </button>
                    </div>
                  </details>
                </>
              ) : null}

              <div className="mt-2 rounded-md border border-slate-200 p-1.5 dark:border-slate-700">
                <div role="tablist" aria-label="Add a campaign" className="flex gap-0.5">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={campaignAddMode === 'create'}
                    onClick={() => setCampaignAddMode('create')}
                    className={cn(
                      'flex-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                      campaignAddMode === 'create'
                        ? `${scheme.primary} text-white`
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50'
                    )}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={campaignAddMode === 'join'}
                    onClick={() => setCampaignAddMode('join')}
                    className={cn(
                      'flex-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                      campaignAddMode === 'join'
                        ? `${scheme.primary} text-white`
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50'
                    )}
                  >
                    Join
                  </button>
                </div>
                {campaignAddMode === 'create' ? (
                  <div className="mt-1.5">
                    <label htmlFor="campaign-name" className="sr-only">
                      New campaign name
                    </label>
                    <input
                      id="campaign-name"
                      value={newCampaignName}
                      onChange={(event) => setNewCampaignName(event.target.value)}
                      placeholder="Campaign name…"
                      className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void createCampaign()}
                      disabled={!newCampaignName.trim()}
                      className={cn(
                        'ecs-ui-btn-primary mt-1.5 w-full rounded px-2 py-1 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
                        scheme.primary
                      )}
                    >
                      Create campaign
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <label htmlFor="campaign-code" className="sr-only">
                      Campaign join code
                    </label>
                    <input
                      id="campaign-code"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value)}
                      placeholder="Share code"
                      className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs font-mono dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void joinCampaign()}
                      disabled={!joinCode.trim()}
                      className={cn(
                        'ecs-ui-btn-primary mt-1.5 w-full rounded px-2 py-1 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
                        scheme.secondary
                      )}
                    >
                      Join campaign
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="min-h-min min-w-0 space-y-5">
            <section
              className={cn(
                workspaceShellRound,
                'ecs-workspace-panel ecs-signature-panel p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40',
                cardClass
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div role="tablist" aria-label="Workspace view" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={wsTab === 'home'}
                    aria-controls="workspace-tab-panel"
                    onClick={() => setWorkspaceTab('home')}
                    className={cn(
                      'ecs-workspace-tab-btn rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-150 motion-safe:active:scale-[0.98]',
                      wsTab === 'home'
                        ? `${scheme.primary} text-white hover:brightness-110 active:brightness-95`
                        : 'ecs-interactive border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                    )}
                    >
                    {t('workspace.home')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={workspaceTab === 'sheet'}
                    aria-controls="workspace-tab-panel"
                    onClick={() => setWorkspaceTab('sheet')}
                    className={cn(
                      'ecs-workspace-tab-btn rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-150 motion-safe:active:scale-[0.98]',
                      workspaceTab === 'sheet'
                        ? `${scheme.primary} text-white hover:brightness-110 active:brightness-95`
                        : 'ecs-interactive border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                    )}
                    >
                    {t('workspace.sheet')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={workspaceTab === 'battle'}
                    aria-controls="workspace-tab-panel"
                    disabled={!selectedCampaignId}
                    onClick={() => setWorkspaceTab('battle')}
                    className={cn(
                      'ecs-workspace-tab-btn rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition duration-150 motion-safe:active:scale-[0.98]',
                      workspaceTab === 'battle'
                        ? `${scheme.secondary} text-white hover:brightness-110 active:brightness-95`
                        : 'ecs-interactive border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
                      !selectedCampaignId ? 'cursor-not-allowed opacity-50' : null
                    )}
                    title={
                      selectedCampaignId ? 'Switch to encounter tracking' : t('workspace.battleLockedHint')
                    }
                  >
                    {t('workspace.battle')}
                  </button>
                </div>

                <div className="flex min-w-[min(100%,11rem)] flex-[1_1_14rem] flex-wrap items-center gap-2">
                  {selectedCampaignId ? (
                    <span className="ecs-ui-chip shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      Shared
                    </span>
                  ) : (
                    <span className="ecs-ui-chip shrink-0 bg-slate-500/15 text-slate-600 dark:text-slate-300">
                      Personal
                    </span>
                  )}
                  <label htmlFor="header-campaign-select" className="sr-only">
                    Active campaign
                  </label>
                  <select
                    id="header-campaign-select"
                    value={selectedCampaignId ?? ''}
                    onChange={(event) => setSelectedCampaignId(event.target.value || null)}
                    className="ecs-ui-input min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700"
                    title="Switch personal workspace or a shared campaign"
                  >
                    <option value="">{t('workspace.personalWorkspace')}</option>
                    {campaigns.length > 0 ? (
                      <optgroup label="Shared campaigns">
                        {campaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </div>

                {wsTab !== 'home' ? (
                  <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                    <label htmlFor="tab-density" className="ecs-ui-field-label">
                      {workspaceTab === 'sheet' ? 'Editor' : 'Cards'}
                    </label>
                    <select
                      id="tab-density"
                      value={
                        workspaceTab === 'sheet'
                          ? compactCreator
                            ? 'compact'
                            : 'full'
                          : compactBattle
                            ? 'compact'
                            : 'full'
                      }
                      onChange={(event) => {
                        const compact = event.target.value === 'compact'
                        if (workspaceTab === 'sheet') setCompactCreator(compact)
                        else setCompactBattle(compact)
                      }}
                      className="ecs-ui-input rounded-md border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
                      title={
                        workspaceTab === 'sheet'
                          ? 'Compact hides large description fields. Full shows everything.'
                          : 'Compact shows a tight stat row per fighter. Full expands per-card notes.'
                      }
                    >
                      <option value="compact">Compact</option>
                      <option value="full">Full</option>
                    </select>
                  </div>
                ) : null}
              </div>
              {!selectedCampaignId ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('workspace.battleLockedHint')}</p>
              ) : null}
            </section>
            {workspaceTab === 'home' ? (
              <div className={cn('mx-auto w-full', loginShellMaxClass)}>
                <div
                  className={cn(loginShellGridClass, loginOuterChrome, colorScheme === 'teal' && 'p-3 sm:p-4')}
                >
                  <div className="flex min-h-0 flex-col gap-4 lg:min-h-[min(100%,calc(100vh-14rem))]">
                    <section
                      className={cn(
                        'relative flex shrink-0 flex-col overflow-hidden bg-gradient-to-br p-6 shadow-md',
                        colorScheme === 'violet' &&
                          (useShapeSoft
                            ? 'ecs-diagonal-strip rounded-[1.75rem]'
                            : 'ecs-shape-banner ecs-diagonal-strip rounded-[1.75rem]'),
                        colorScheme === 'sunset' &&
                          (useShapeSoft
                            ? 'ecs-diagonal-strip rounded-[1.75rem]'
                            : 'ecs-shape-banner ecs-diagonal-strip rounded-[1.75rem]'),
                        colorScheme === 'wii' &&
                          'rounded-[2rem] border border-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-gray-600/45',
                        colorScheme === 'ps3' &&
                          'rounded-xl border border-slate-700/55 shadow-[inset_0_0_48px_rgba(0,0,0,0.35)]',
                        colorScheme === 'xbox360' &&
                          'rounded-lg border border-lime-700/25 shadow-[inset_0_0_40px_rgba(0,0,0,0.45),0_0_28px_rgba(74,222,128,0.08)]',
                        colorScheme === 'cube' &&
                          'rounded-[1.2rem] border border-indigo-300/45 shadow-[0_0_34px_rgba(99,102,241,0.24)] dark:border-indigo-400/35',
                        colorScheme === 'bee' &&
                          'rounded-[1.65rem] border-2 border-amber-300/75 shadow-[0_0_32px_rgba(245,158,11,0.22)] dark:border-amber-500/40',
                        colorScheme === 'wiiu' &&
                          'rounded-[1.5rem] border border-cyan-200/55 shadow-[0_0_30px_rgba(34,211,238,0.22)] dark:border-cyan-500/35',
                        colorScheme === '3ds' &&
                          'rounded-md border border-rose-300/70 shadow-[0_0_26px_rgba(244,63,94,0.22)] dark:border-rose-500/35',
                        colorScheme === 'teal' &&
                          'rounded-md border border-black/50 shadow-[4px_4px_0_rgba(0,0,0,0.14)] dark:border-black/55 dark:shadow-[4px_4px_0_rgba(0,0,0,0.35)]',
                        colorScheme === 'default' &&
                          'rounded-2xl border border-slate-200 shadow-md dark:border-slate-700',
                        scheme.grad,
                        !darkMode && colorScheme === 'sunset' && 'text-indigo-950',
                        !darkMode && colorScheme === 'wii' && 'text-gray-900',
                        !darkMode && colorScheme === 'wiiu' && 'text-cyan-900',
                        !darkMode && colorScheme === '3ds' && 'text-rose-900',
                        !darkMode && colorScheme === 'bee' && 'text-amber-950',
                        !darkMode && colorScheme === 'default' && 'text-slate-900',
                        (darkMode || !['sunset', 'wii', 'wiiu', '3ds', 'default', 'bee'].includes(colorScheme)) && 'text-white'
                      )}
                    >
                      <div className="relative shrink-0">
                        <div className={cn('text-xs font-semibold uppercase tracking-[0.25em]', loginHeroTypography.badge)}>
                          {workspaceHomeHero.badge}
                        </div>
                        <h1 className={cn('mt-3 text-3xl font-bold leading-tight', loginHeroTypography.title)}>
                          {workspaceHomeHero.title}
                        </h1>
                        <p className={cn('mt-2 max-w-xl text-sm leading-relaxed', loginHeroTypography.body)}>
                          {workspaceHomeHero.body}
                        </p>
                      </div>
                    </section>
                    <LoginUpdateLog className="relative min-h-0 flex-1" colorScheme={colorScheme} />
                  </div>

                  <section className={cn('ecs-ui-surface ecs-signature-panel', loginSignPanel, loginSignColumnClass, 'self-stretch')}>
                    <h2 className={cn('text-xl font-bold tracking-tight', loginSignHeadingClass)}>Start</h2>
                    <p className={cn('mt-1 text-sm leading-relaxed', loginIntroMuted)}>
                      Open Sheet or Battle from here, or use the tabs under the header.
                    </p>
                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setWorkspaceTab('sheet')}
                        className={cn(
                          'ecs-ui-btn-primary w-full px-4 py-2.5 text-sm font-semibold transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99]',
                          ecsWideControlRound(colorScheme),
                          scheme.primary
                        )}
                      >
                        Character sheets
                      </button>
                      <button
                        type="button"
                        disabled={!selectedCampaignId}
                        onClick={() => setWorkspaceTab('battle')}
                        title={selectedCampaignId ? 'Encounter tracker' : 'Choose a shared campaign in the sidebar first'}
                        className={cn(
                          'ecs-ui-btn-primary w-full px-4 py-2.5 text-sm font-semibold transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40',
                          ecsWideControlRound(colorScheme),
                          scheme.secondary
                        )}
                      >
                        Battle board
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
            {(workspaceTab === 'sheet' || workspaceTab === 'battle') && (
              <>
            <section
              className={cn(
                workspaceShellRound,
                'ecs-workspace-panel ecs-signature-panel p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40',
                cardClass
              )}
            >
              {/* Toolbar: primary actions left, status right. Display toggles live in Settings. */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Create group */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={openQuickCreate}
                    title="Guided 4-step character creation"
                    className={cn(
                      'ecs-ui-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.98]',
                      scheme.primary
                    )}
                  >
                    <span aria-hidden className="text-sm leading-none">＋</span>
                    <span>{t('sidebar.newCharacter')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={newCharacter}
                    title="Open a blank sheet for advanced editing"
                    className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    Blank sheet
                  </button>
                </div>

                <span aria-hidden className="hidden h-6 w-px bg-slate-300/70 sm:inline-block dark:bg-slate-700/70" />

                {/* Persist group */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void saveCharacter()}
                    title="Save the open character to your library"
                    className={cn(
                      'ecs-ui-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition duration-150 hover:brightness-110 active:brightness-95 motion-safe:active:scale-[0.98]',
                      scheme.secondary
                    )}
                  >
                    <span aria-hidden className="text-sm leading-none">💾</span>
                    <span>Save</span>
                  </button>
                  {editor.id ? (
                    <button
                      type="button"
                      onClick={() => void deleteCharacter()}
                      title="Delete this character (cannot be undone)"
                      className="ecs-interactive ecs-ui-btn ecs-ui-btn-danger rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>

                <span aria-hidden className="hidden h-6 w-px bg-slate-300/70 sm:inline-block dark:bg-slate-700/70" />

                {/* Generate group */}
                <button
                  type="button"
                  onClick={() => void generateAttacks()}
                  title="Build attacks from the character's keywords list"
                  className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  <span aria-hidden className="text-sm leading-none">⚡</span>
                  <span>Generate attacks</span>
                </button>

                {rulesMode === 'dnd' ? (
                  <>
                    <span aria-hidden className="hidden h-6 w-px bg-slate-300/70 sm:inline-block dark:bg-slate-700/70" />
                    <div className="flex items-center gap-1" aria-label="Apply DnD class preset">
                      <span className="ecs-ui-field-label text-slate-400 dark:text-slate-500">Preset</span>
                      <button
                        type="button"
                        onClick={() => applyCharacterPreset('frontliner')}
                        className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                      >
                        Frontliner
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCharacterPreset('caster')}
                        className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                      >
                        Caster
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCharacterPreset('rogue')}
                        className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                      >
                        Rogue
                      </button>
                    </div>
                  </>
                ) : null}

                {/* Status pinned right */}
                <div className="ml-auto flex items-center gap-2">
                  {selectedCampaignId && (workspaceTab === 'sheet' || workspaceTab === 'battle') ? (
                    <button
                      type="button"
                      onClick={() => setWorkspaceTab((prev) => (prev === 'sheet' ? 'battle' : 'sheet'))}
                      className="ecs-interactive ecs-ui-btn ecs-ui-btn-quiet rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                    >
                      {workspaceTab === 'sheet' ? 'Go to battle' : 'Back to sheet'}
                    </button>
                  ) : null}
                  <div
                    className="ecs-ui-chip rounded-full border border-slate-300/70 px-3 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                    title={selectedCampaignId ? 'Active shared campaign' : 'Personal — only you see these characters'}
                  >
                    {selectedCampaignId ? `Campaign: ${activeCampaign?.name ?? 'Unknown'}` : 'Personal workspace'}
                  </div>
                </div>
              </div>
            </section>

            {workspaceTab === 'battle' && selectedCampaignId ? (
              <section
                className={cn(
                  workspaceShellRound,
                  'ecs-workspace-panel ecs-signature-panel p-5 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40',
                  cardClass
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Encounter board</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Live turn tracker for this campaign. Changes here never modify the underlying sheets.
                    </p>
                  </div>
                  <div
                    className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                    title="Current encounter round number"
                  >
                    Round {encounterRound}
                  </div>
                </div>
                {showFirstDragHint ? (
                  <div className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
                    <div>
                      <span className="font-semibold">Tip:</span> drag a character from the sidebar onto the
                      board to add them, then drag a card to reorder turn order.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowFirstDragHint(false)
                        try {
                          window.localStorage.setItem(DRAG_HINT_DISMISSED_KEY, '1')
                        } catch {
                          // ignore storage errors
                        }
                      }}
                      className="shrink-0 rounded border border-indigo-300 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:border-indigo-400/40 dark:text-indigo-100"
                    >
                      Got it
                    </button>
                  </div>
                ) : null}
                <div
                  className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (dragCharacterId) moveParticipantToIndex(dragCharacterId, battleParticipants.length)
                    setDragCharacterId(null)
                  }}
                >
                  <button
                    type="button"
                    onClick={nextTurn}
                    disabled={battleParticipants.length === 0}
                    title="Advance the active turn marker"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
                      scheme.primary
                    )}
                  >
                    <span aria-hidden>▶</span>
                    Next turn
                  </button>
                  <button
                    type="button"
                    onClick={sortParticipantsByInitiative}
                    disabled={battleParticipants.length === 0}
                    title="Reorder fighters from highest to lowest initiative"
                    className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    Sort by initiative
                  </button>
                  <button
                    type="button"
                    onClick={loadEncounterFromSheets}
                    title="Reload HP / AC values from each character's saved sheet"
                    className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    Reset from sheets
                  </button>
                  <button
                    type="button"
                    onClick={addVisibleRosterToEncounter}
                    disabled={filteredCharacters.length === 0}
                    title="Append every character visible in the sidebar (search + faction filter) who is not already on the board"
                    className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    Add filtered roster
                  </button>
                  <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
                    {battleParticipants.length} on board
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {battleParticipants.length === 0 ? (
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragCharacterId) moveParticipantToIndex(dragCharacterId, 0)
                        setDragCharacterId(null)
                      }}
                      className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 px-3 py-5 text-sm text-slate-600 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-slate-300"
                    >
                      Drag characters from the left list and drop them here to begin this encounter.
                      <div className="mt-1 text-xs font-medium">
                        You can reorder active fighters by dragging their encounter cards.
                      </div>
                    </div>
                  ) : (
                    characters
                      .filter((character) => battleParticipants.includes(character.id))
                      .map((character) => {
                      const draft = battleDrafts[character.id] ?? {
                        hpCurrent: character.hpCurrent,
                        armorCurrent: character.armorCurrent,
                        initiative: character.stats?.initiative ?? 0,
                        notes: character.notes ?? '',
                        conditions: [],
                        selectedAction: ''
                      }
                      return (
                        <div
                          key={character.id}
                          draggable
                          onDragStart={() => setDragCharacterId(character.id)}
                          onDragEnd={() => setDragCharacterId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            if (!dragCharacterId) return
                            const targetIndex = battleParticipants.indexOf(character.id)
                            if (targetIndex >= 0) moveParticipantToIndex(dragCharacterId, targetIndex)
                            setDragCharacterId(null)
                          }}
                          className={cn(
                            'cursor-grab rounded-xl border border-slate-200 p-3 active:cursor-grabbing dark:border-slate-700',
                            battleParticipants[activeTurnIndex] === character.id ? `ring-2 ${scheme.ring}` : ''
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold">
                              <span className="mr-1 text-slate-400">::</span>
                              {character.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeParticipant(character.id)}
                              className="ecs-ui-btn ecs-ui-btn-quiet rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {/* HP block — primary, with damage/heal stepper */}
                            <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                              <div className="flex items-center justify-between">
                                <span className="ecs-ui-field-label text-rose-600 dark:text-rose-400">
                                  HP
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  Sheet: {character.hpCurrent}/{character.hpMax}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1">
                                <button
                                  type="button"
                                  className="ecs-ui-btn ecs-ui-btn-danger rounded border border-slate-300 px-1.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent - 5 })}
                                  title="Take 5 damage"
                                >
                                  −5
                                </button>
                                <button
                                  type="button"
                                  className="ecs-ui-btn ecs-ui-btn-danger rounded border border-slate-300 px-1.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent - 1 })}
                                  title="Take 1 damage"
                                >
                                  −1
                                </button>
                                <input
                                  type="number"
                                  aria-label={`${character.name} hit points`}
                                  value={draft.hpCurrent}
                                  onChange={(event) =>
                                    updateBattleDraft(character.id, {
                                      hpCurrent: Number(event.target.value || 0)
                                    })
                                  }
                                  className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-center text-sm font-semibold dark:border-slate-700"
                                />
                                <button
                                  type="button"
                                  className="ecs-ui-btn ecs-ui-btn-quiet rounded border border-slate-300 px-1.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent + 1 })}
                                  title="Heal 1 HP"
                                >
                                  +1
                                </button>
                                <button
                                  type="button"
                                  className="ecs-ui-btn ecs-ui-btn-quiet rounded border border-slate-300 px-1.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                                  onClick={() => updateBattleDraft(character.id, { hpCurrent: draft.hpCurrent + 5 })}
                                  title="Heal 5 HP"
                                >
                                  +5
                                </button>
                              </div>
                            </div>
                            {/* Defense / Initiative / Faction block */}
                            <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                              <span className="ecs-ui-field-label">
                                Combat stats
                              </span>
                              <div className="mt-1 grid grid-cols-3 gap-2">
                                <label className="ecs-ui-field-label">
                                  AC
                                  <input
                                    type="number"
                                    value={draft.armorCurrent}
                                    onChange={(event) =>
                                      updateBattleDraft(character.id, {
                                        armorCurrent: Number(event.target.value || 0)
                                      })
                                    }
                                    className="ecs-ui-input mt-0.5 w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-center text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100"
                                  />
                                </label>
                                <label className="ecs-ui-field-label">
                                  Init
                                  <input
                                    type="number"
                                    value={draft.initiative}
                                    onChange={(event) =>
                                      updateBattleDraft(character.id, {
                                        initiative: Number(event.target.value || 0)
                                      })
                                    }
                                    className="ecs-ui-input mt-0.5 w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-center text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100"
                                  />
                                </label>
                                <div className="ecs-ui-field-label">
                                  Faction
                                  <div
                                    className="mt-0.5 truncate rounded border border-slate-200 px-2 py-1 text-center text-xs font-medium normal-case text-slate-700 dark:border-slate-700 dark:text-slate-200"
                                    title={character.factionGroup || 'None'}
                                  >
                                    {character.factionGroup || '—'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {rulesMode === 'dnd' ? (
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <label className="text-xs">
                                Turn action
                                <select
                                  value={draft.selectedAction}
                                  onChange={(event) =>
                                    updateBattleDraft(character.id, { selectedAction: event.target.value })
                                  }
                                  className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                                >
                                  <option value="">No action selected</option>
                                  {DND_ACTIONS.map((action) => (
                                    <option key={action} value={action}>
                                      {action}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="text-xs">
                                Conditions
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {DND_CONDITIONS.map((condition) => {
                                    const active = draft.conditions.includes(condition)
                                    return (
                                      <button
                                        key={condition}
                                        type="button"
                                        onClick={() =>
                                          updateBattleDraft(character.id, {
                                            conditions: active
                                              ? draft.conditions.filter((c) => c !== condition)
                                              : [...draft.conditions, condition]
                                          })
                                        }
                                        className={cn(
                                          'rounded border px-2 py-0.5 text-[11px]',
                                          active
                                            ? 'border-indigo-400 bg-indigo-500/15 text-indigo-900 dark:text-indigo-100'
                                            : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                                        )}
                                      >
                                        {condition}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {!compactBattle ? (
                            <label className="mt-2 block text-xs">
                              Battle notes
                              <textarea
                                rows={2}
                                value={draft.notes}
                                onChange={(event) =>
                                  updateBattleDraft(character.id, {
                                    notes: event.target.value
                                  })
                                }
                                className="mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => saveBattleRow(character.id)}
                            className={cn('mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white', scheme.secondary)}
                          >
                            Save encounter row
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            ) : null}

            {workspaceTab === 'sheet' ? (
              rulesMode === 'dnd' ? (
                <DndSheetSection
                  cardClass={cardClass}
                  scheme={scheme}
                  editor={editor}
                  setEditor={setEditor}
                  keywordText={keywordText}
                  setKeywordText={setKeywordText}
                  onGenerateAttacks={() => void generateAttacks()}
                  onRemoveAttack={removeAttack}
                  manualAttackDraft={manualAttackDraft}
                  setManualAttackDraft={setManualAttackDraft}
                  onAddManualAttack={addManualAttack}
                  onPickPortrait={() => void pickCharacterPortrait()}
                  onClearPortrait={() => void clearCharacterPortrait()}
                  dndClass={dndClass}
                  dndProf={dndProf}
                  dndSpellAttack={dndSpellAttack}
                  dndSpellSaveDc={dndSpellSaveDc}
                  dndCastingAbility={dndCastingAbility}
                  showAdvancedCharacterFields={showAdvancedCharacterFields}
                  setShowAdvancedCharacterFields={setShowAdvancedCharacterFields}
                  keywordIntelLines={sheetAttackIntel?.lines ?? []}
                />
              ) : (
            <section className={cn('ecs-signature-panel rounded-2xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <h2 className="text-lg font-semibold">Character Details</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {guidedSetup
                  ? 'Start with the core fields. Expand advanced fields only when needed.'
                  : 'Clear, simplified inputs based on your original layout.'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                TTRPG mode — freeform fields with bracket export below.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void pickCharacterPortrait()}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold text-white', scheme.primary)}
                >
                  Portrait…
                </button>
                <button
                  type="button"
                  onClick={() => void clearCharacterPortrait()}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                >
                  Clear portrait
                </button>
                {editor.portraitRelativePath ? (
                  <div className="ecs-portrait-hex h-14 w-12 shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
                    <img alt="" src={ecsPortraitSrc(editor.portraitRelativePath)} className="h-full w-full object-cover" />
                  </div>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <input
                  value={editor.name}
                  onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Character name"
                  className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <input
                  type="number"
                  value={editor.hpCurrent}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, hpCurrent: Number(event.target.value || 0) }))
                  }
                  placeholder="HP current"
                  className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <input
                  type="number"
                  value={editor.hpMax}
                  onChange={(event) =>
                    setEditor((prev) => ({ ...prev, hpMax: Number(event.target.value || 0) }))
                  }
                  placeholder="HP max"
                  className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                {!compactCreator ? (
                  <>
                    <input
                      value={editor.factionGroup}
                      onChange={(event) =>
                        setEditor((prev) => ({ ...prev, factionGroup: event.target.value }))
                      }
                      placeholder="Faction group (e.g. Iron Vanguard)"
                      className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                    />
                    <input
                      value={editor.dedicatedEssence}
                      onChange={(event) =>
                        setEditor((prev) => ({ ...prev, dedicatedEssence: event.target.value }))
                      }
                      placeholder="Dedicated essence"
                      className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                    />
                  </>
                ) : null}
              </div>
              {compactCreator ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Compact creator hides optional fields. Switch to Creator full for faction and essence inputs.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowAdvancedCharacterFields((prev) => !prev)}
                className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                {showAdvancedCharacterFields ? 'Hide advanced fields' : 'Show advanced fields'}
              </button>
              {showAdvancedCharacterFields ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editor.traitDescription}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, traitDescription: event.target.value }))
                    }
                    placeholder="Trait description"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                  <textarea
                    value={editor.epicMoveDescription}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, epicMoveDescription: event.target.value }))
                    }
                    placeholder="Epic/Ultimate move description"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                  <textarea
                    value={editor.monolithDescription}
                    onChange={(event) =>
                      setEditor((prev) => ({ ...prev, monolithDescription: event.target.value }))
                    }
                    placeholder="Monolith description"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  />
                </div>
              ) : null}
            </section>
              )
            ) : null}

            {workspaceTab === 'sheet' && rulesMode === 'ttrpg' ? (
            <section className={cn('rounded-2xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <h2 className="text-lg font-semibold">Attacks</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Generate builds a batch from keywords. Turn on &quot;Append generated attacks&quot; in the Theme menu to keep prior batches instead of replacing them.
              </p>
              <input
                value={keywordText}
                onChange={(event) => setKeywordText(event.target.value)}
                placeholder="Keywords: fire, shadow, arcane"
                className="ecs-ui-input mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => void generateAttacks()}
                className={cn('ecs-ui-btn-primary mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-white', scheme.secondary)}
              >
                Generate from keywords
              </button>
              <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-600">
                <div className="ecs-ui-field-label">
                  Add attack manually
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={manualAttackDraft.name}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, name: event.target.value }))}
                    placeholder="Attack name"
                    className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.hitBonus}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, hitBonus: event.target.value }))}
                    placeholder="Hit bonus"
                    className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.damageDice}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, damageDice: event.target.value }))}
                    placeholder="e.g. 2d6+4"
                    className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.damageType}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, damageType: event.target.value }))}
                    placeholder="Damage type"
                    className="ecs-ui-input w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.range}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, range: event.target.value }))}
                    placeholder="Range"
                    className="ecs-ui-input sm:col-span-2 w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                  <input
                    value={manualAttackDraft.description}
                    onChange={(event) => setManualAttackDraft((d) => ({ ...d, description: event.target.value }))}
                    placeholder="Description (optional)"
                    className="ecs-ui-input sm:col-span-2 w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addManualAttack()}
                  className="ecs-ui-btn ecs-ui-btn-quiet w-full rounded-lg border border-slate-400 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-800/60"
                >
                  Add to list
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {editor.attacks.map((attack) => (
                  <li key={attack.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                          <span>{attack.name}</span>
                          {attack.source === 'generated' ? (
                            <span className="ecs-ui-chip rounded bg-amber-200/70 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                              Gen
                            </span>
                          ) : attack.source === 'manual' ? (
                            <span className="ecs-ui-chip rounded bg-sky-200/70 px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-sky-900 dark:bg-sky-500/20 dark:text-sky-100">
                              Manual
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {attack.damageDice} {attack.damageType} | +{attack.hitBonus} | {attack.range}
                        </div>
                        {attack.description ? (
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {attack.description}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttack(attack.id)}
                        title="Remove this attack from the sheet"
                        aria-label={`Remove ${attack.name}`}
                        className="shrink-0 rounded border border-rose-300 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            ) : null}

            {workspaceTab === 'sheet' ? (
            <section className={cn('rounded-2xl p-4 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/40', cardClass)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Sheet preview</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Read-only bracket export — copy and paste into your VTT or notes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(preview)
                    setAppMessage('Copied sheet to clipboard.')
                  }}
                  className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  Copy
                </button>
              </div>
              <textarea
                readOnly
                value={preview}
                rows={10}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950/60"
              />
            </section>
            ) : null}
            </>
            )}
          </main>
        </div>

        {colorScheme === 'teal' && useThemeLayout ? (
          <div
            data-region="statusbar"
            className="ecs-win98-statusbar mt-2 flex items-center gap-0 border-t border-l border-white/85 border-b border-r border-black/55 bg-[#ece9d8] px-1 py-1 text-[11px] text-gray-900 shadow-[inset_-1px_-1px_0_#404040,inset_1px_1px_0_#ffffff] dark:bg-[#5a5a5a] dark:text-gray-100 dark:shadow-[inset_-1px_-1px_0_#222,inset_1px_1px_0_#888]"
          >
            <span className="ecs-win98-statusbar-cell">Ready</span>
            <span className="ecs-win98-statusbar-cell">{characters.length} object(s)</span>
            <span className="ecs-win98-statusbar-cell">Campaign: {activeCampaign?.name ?? 'Personal'}</span>
            <span className="ecs-win98-statusbar-cell ml-auto">{rulesMode === 'dnd' ? 'DnD mode' : 'TTRPG mode'}</span>
          </div>
        ) : null}

        {showQuickCreate ? (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4 motion-safe:animate-ecs-backdrop-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-create-title"
          >
            <div className={cn('relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl motion-safe:animate-ecs-pop-in', cardClass)}>
              {/* Header with stepper */}
              <header className="border-b border-slate-200/60 px-5 py-4 dark:border-slate-700/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      Step {quickStep} of 4
                    </div>
                    <h3 id="quick-create-title" className="mt-0.5 text-lg font-semibold">
                      {quickStep === 1 ? 'Pick a class' : null}
                      {quickStep === 2 ? 'Name your character' : null}
                      {quickStep === 3 ? 'Set the stats' : null}
                      {quickStep === 4 ? 'Review & create' : null}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickCreate(false)
                      resetQuickWizard()
                    }}
                    aria-label="Close character creator"
                    className="ecs-interactive rounded-md border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  >
                    Cancel
                  </button>
                </div>
                <ol className="mt-3 flex items-center gap-1.5" aria-label="Wizard progress">
                  {[1, 2, 3, 4].map((step) => (
                    <li key={step} className="flex flex-1 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQuickStep(step as 1 | 2 | 3 | 4)}
                        disabled={step > quickStep && !quickName.trim()}
                        aria-current={quickStep === step ? 'step' : undefined}
                        className={cn(
                          'h-1.5 w-full rounded-full transition-colors duration-150',
                          quickStep === step
                            ? scheme.primary
                            : step < quickStep
                              ? 'bg-slate-400 dark:bg-slate-500'
                              : 'bg-slate-200 dark:bg-slate-700',
                          step > quickStep && !quickName.trim() ? 'cursor-not-allowed' : 'cursor-pointer'
                        )}
                      />
                    </li>
                  ))}
                </ol>
              </header>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {/* Step 1: Class / Role */}
                {quickStep === 1 ? (
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {rulesMode === 'dnd'
                        ? 'Class is the biggest decision — it shapes how you fight, cast, and roleplay. You can rename and tune everything later.'
                        : 'Pick a starting role. Each one comes with sensible defaults; you can rebalance on the next step.'}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {rulesMode === 'dnd'
                        ? DND_CLASSES.map((klass) => {
                            const baseline = DND_CLASS_BASELINE[klass] ?? { hp: 10, ac: 14 }
                            const isSelected = quickClass === klass
                            return (
                              <button
                                key={klass}
                                type="button"
                                onClick={() => setQuickClass(klass)}
                                aria-pressed={isSelected}
                                className={cn(
                                  'rounded-xl border p-3 text-left transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2',
                                  scheme.ring,
                                  isSelected
                                    ? characterRowSelected
                                    : 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40'
                                )}
                              >
                                <div className="text-sm font-bold">{klass}</div>
                                <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                                  {DND_CLASS_BLURB[klass]}
                                </div>
                                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  HP {baseline.hp} · AC {baseline.ac}
                                </div>
                              </button>
                            )
                          })
                        : (Object.keys(TTRPG_PRESETS) as QuickPreset[]).map((key) => {
                            const preset = TTRPG_PRESETS[key]
                            const isSelected = quickPreset === key
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setQuickPreset(key)}
                                aria-pressed={isSelected}
                                className={cn(
                                  'rounded-xl border p-3 text-left transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2',
                                  scheme.ring,
                                  isSelected
                                    ? characterRowSelected
                                    : 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40'
                                )}
                              >
                                <div className="text-sm font-bold">{preset.label}</div>
                                <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                                  {preset.blurb}
                                </div>
                                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  HP {preset.hp} · AC {preset.ac}
                                </div>
                              </button>
                            )
                          })}
                    </div>
                  </div>
                ) : null}

                {/* Step 2: Name + identity */}
                {quickStep === 2 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Just a name is required — the rest is optional flavor you can fill in later.
                    </p>
                    <SettingsField
                      label="Character name"
                      htmlFor="quick-name"
                      hint="What everyone at the table will call them. Required."
                    >
                      <input
                        id="quick-name"
                        autoFocus
                        value={quickName}
                        onChange={(event) => setQuickName(event.target.value)}
                        placeholder="e.g. Mira Halewind"
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                      />
                    </SettingsField>
                    {rulesMode === 'dnd' ? (
                      <SettingsField
                        label="Subclass / Oath / Circle"
                        htmlFor="quick-subclass"
                        hint="Optional flavor for the chosen class — e.g. Path of the Berserker, Oath of Devotion."
                      >
                        <input
                          id="quick-subclass"
                          value={quickSubclass}
                          onChange={(event) => setQuickSubclass(event.target.value)}
                          placeholder="Optional"
                          className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                        />
                      </SettingsField>
                    ) : null}
                    <SettingsField
                      label="Faction or party group"
                      htmlFor="quick-faction"
                      hint="Helps you group, filter, and color-code characters across campaigns. Optional."
                    >
                      <input
                        id="quick-faction"
                        value={quickFaction}
                        onChange={(event) => setQuickFaction(event.target.value)}
                        placeholder={rulesMode === 'dnd' ? 'e.g. The Lantern Watch' : `e.g. ${TTRPG_PRESETS[quickPreset].factionGroup}`}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                      />
                    </SettingsField>
                    <SettingsField
                      label="One-line concept"
                      htmlFor="quick-desc"
                      hint="A sentence that captures the vibe — saved into the sheet's notes field. Optional."
                    >
                      <input
                        id="quick-desc"
                        value={quickDescription}
                        onChange={(event) => setQuickDescription(event.target.value)}
                        placeholder="e.g. Disgraced knight seeking redemption"
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                      />
                    </SettingsField>
                  </div>
                ) : null}

                {/* Step 3: Stats */}
                {quickStep === 3 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Defaults come from your {rulesMode === 'dnd' ? 'class' : 'role'} pick. Override anything below.
                      </p>
                      <button
                        type="button"
                        onClick={applyQuickBaselineStats}
                        className="ecs-interactive rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800/60"
                      >
                        Reset to defaults
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <SettingsField
                        label="Hit points"
                        htmlFor="quick-hp"
                        hint={`Suggested ${quickBaselineForCurrentMode().hp} for ${rulesMode === 'dnd' ? quickClass : TTRPG_PRESETS[quickPreset].label}.`}
                      >
                        <input
                          id="quick-hp"
                          type="number"
                          min={1}
                          value={quickHp}
                          onChange={(event) => setQuickHp(Math.max(1, Number(event.target.value) || 1))}
                          className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                        />
                      </SettingsField>
                      <SettingsField
                        label="Armor class"
                        htmlFor="quick-ac"
                        hint={`Suggested ${quickBaselineForCurrentMode().ac}. Higher is harder to hit.`}
                      >
                        <input
                          id="quick-ac"
                          type="number"
                          min={0}
                          value={quickArmor}
                          onChange={(event) => setQuickArmor(Math.max(0, Number(event.target.value) || 0))}
                          className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                        />
                      </SettingsField>
                      <SettingsField
                        label="Level"
                        htmlFor="quick-level"
                        hint={rulesMode === 'dnd' ? 'Sets DnD proficiency tier.' : 'Power rating for your TTRPG system.'}
                      >
                        <input
                          id="quick-level"
                          type="number"
                          min={1}
                          max={30}
                          value={quickLevel}
                          onChange={(event) => setQuickLevel(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
                          className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                        />
                      </SettingsField>
                    </div>
                    {rulesMode === 'dnd' ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                        At level {quickLevel}, your proficiency bonus will be <span className="font-semibold">+{proficiencyBonus(quickLevel)}</span>.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Step 4: Review */}
                {quickStep === 4 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Last look. Click any line to jump back and edit.
                    </p>
                    <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                      {[
                        {
                          step: 1 as const,
                          label: rulesMode === 'dnd' ? 'Class' : 'Role',
                          value: rulesMode === 'dnd' ? quickClass : TTRPG_PRESETS[quickPreset].label
                        },
                        { step: 2 as const, label: 'Name', value: quickName.trim() || '— (required)' },
                        ...(rulesMode === 'dnd' && quickSubclass.trim()
                          ? [{ step: 2 as const, label: 'Subclass', value: quickSubclass.trim() }]
                          : []),
                        { step: 2 as const, label: 'Faction', value: quickFaction.trim() || (rulesMode === 'dnd' ? '—' : TTRPG_PRESETS[quickPreset].factionGroup) },
                        ...(quickDescription.trim()
                          ? [{ step: 2 as const, label: 'Concept', value: quickDescription.trim() }]
                          : []),
                        { step: 3 as const, label: 'HP / AC', value: `${quickHp} HP · AC ${quickArmor}` },
                        { step: 3 as const, label: 'Level', value: String(quickLevel) }
                      ].map((row, idx) => (
                        <button
                          key={`${row.label}-${idx}`}
                          type="button"
                          onClick={() => setQuickStep(row.step)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {row.label}
                          </span>
                          <span className="truncate text-right font-medium">{row.value}</span>
                        </button>
                      ))}
                    </dl>
                    {!quickName.trim() ? (
                      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
                        A name is required before creating. Jump back to step 2.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <footer className="flex items-center justify-between gap-2 border-t border-slate-200/60 px-5 py-3 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setQuickStep((step) => (step > 1 ? ((step - 1) as 1 | 2 | 3 | 4) : step))}
                  disabled={quickStep === 1}
                  className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                >
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  {quickStep === 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const baseline = quickBaselineForCurrentMode()
                        if (!quickName.trim()) {
                          const fallback = rulesMode === 'dnd' ? `New ${quickClass}` : `New ${TTRPG_PRESETS[quickPreset].label}`
                          setQuickName(fallback)
                        }
                        setQuickHp(baseline.hp)
                        setQuickArmor(baseline.ac)
                        setQuickStep(4)
                      }}
                      className="ecs-interactive rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800/60"
                      title="Use class defaults and skip straight to review"
                    >
                      Quick build
                    </button>
                  ) : null}
                  {quickStep < 4 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (quickStep === 1) applyQuickBaselineStats()
                        setQuickStep((step) => (step < 4 ? ((step + 1) as 1 | 2 | 3 | 4) : step))
                      }}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold text-white',
                        scheme.primary
                      )}
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void createQuickCharacter()}
                      disabled={!quickName.trim()}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
                        scheme.primary
                      )}
                    >
                      Create character
                    </button>
                  )}
                </div>
              </footer>
            </div>
          </div>
        ) : null}

        </div>
        </DevToolsPanel>
      </div>

      {showThemeMenu && themeMenuPos
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close theme menu"
                className="fixed inset-0 z-[50200] cursor-default bg-slate-950/30 motion-safe:animate-ecs-backdrop-in"
                onClick={() => setShowThemeMenu(false)}
              />
              <div
                role="dialog"
                aria-label="Theme and appearance"
                className={cn(
                  'fixed z-[50201] flex max-h-[min(92vh,calc(100dvh-12px))] w-[22rem] origin-top-right flex-col overflow-hidden rounded-xl border shadow-xl motion-safe:animate-ecs-pop-in',
                  cardClass
                )}
                style={{ top: themeMenuPos.top, left: themeMenuPos.left }}
              >
                <header className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3 dark:border-slate-700/60">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      Theme
                    </div>
                    <div className="text-sm font-semibold">Palette &amp; shell</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowThemeMenu(false)}
                    aria-label="Close theme menu"
                    className="ecs-interactive rounded-md border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  >
                    Close
                  </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <SettingsSection title="Color scheme">
                    <div className="grid grid-cols-2 gap-2">
                      {themeSchemeMenuChoices.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => applyColorSchemeSelection(row.id)}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-left text-xs transition-colors',
                            colorScheme === row.id
                              ? 'border-sky-500 bg-sky-500/15 ring-2 ring-sky-400/80 dark:border-sky-400 dark:bg-sky-500/10 dark:ring-sky-500/50'
                              : 'border-slate-300/80 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/60'
                          )}
                        >
                          <div className="font-semibold">{row.title}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{row.blurb}</div>
                          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            Source cue: {THEME_SOURCE_REFS[row.id].sourceLabel}
                          </div>
                        </button>
                      ))}
                    </div>
                  </SettingsSection>

                  <SettingsSection title="Layout & brightness">
                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        Professional app presets
                      </div>
                      <div className="grid gap-2">
                        {PROFESSIONAL_UI_PRESETS.map((preset) => {
                          const isActive =
                            colorScheme === preset.settings.colorScheme &&
                            themeMode === preset.settings.themeMode &&
                            useThemeLayout === preset.settings.useThemeLayout &&
                            cornerStyle === preset.settings.cornerStyle &&
                            chromeWeight === preset.settings.chromeWeight &&
                            workspaceDensity === preset.settings.workspaceDensity &&
                            sidebarPlacement === preset.settings.sidebarPlacement &&
                            sidebarWidth === preset.settings.sidebarWidth
                          return (
                            <div
                              key={preset.id}
                              className={cn(
                                'rounded-md border px-2 py-2',
                                isActive
                                  ? 'border-sky-400 bg-sky-500/10 dark:border-sky-500/60 dark:bg-sky-500/10'
                                  : 'border-slate-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/60'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold">{preset.title}</div>
                                <button
                                  type="button"
                                  onClick={() => applyProfessionalUiPreset(preset)}
                                  className={cn(
                                    'rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                                    isActive
                                      ? 'border-sky-400 text-sky-700 dark:text-sky-200'
                                      : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                  )}
                                >
                                  {isActive ? 'Active' : 'Apply'}
                                </button>
                              </div>
                              <div className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{preset.blurb}</div>
                              <a
                                href={preset.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex text-[9px] uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                              >
                                Source: {preset.sourceLabel}
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <SettingsField
                      label="Page layout"
                      htmlFor="theme-layout"
                      hint="Themed reshapes the workspace to match each console or OS look. Default keeps the standard sidebar-left layout with palette colors only."
                    >
                      <select
                        id="theme-layout"
                        value={useThemeLayout ? 'themed' : 'default'}
                        onChange={(event) => setUseThemeLayout(event.target.value === 'themed')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="themed">Themed layout (per scheme)</option>
                        <option value="default">Default layout (sidebar left)</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label="Light / dark"
                      htmlFor="theme-tone"
                      hint="System follows your OS. Light and Dark force the UI tone for the whole workspace."
                    >
                      <select
                        id="theme-tone"
                        value={themeMode}
                        onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </SettingsField>
                  </SettingsSection>

                  <SettingsSection title="Shape & chrome">
                    <SettingsField
                      label="Corner vocabulary"
                      htmlFor="theme-corners"
                      hint="Soft / Organic favor rounded glass; Era restores angled clip-path cards on glossy palettes; Sharp is tight radii everywhere. Win9x teal keeps its polygons in Soft, Organic, and Sharp."
                    >
                      <select
                        id="theme-corners"
                        value={cornerStyle}
                        onChange={(event) => {
                          setCornerStyle(event.target.value as CornerStyle)
                          setActiveUiPresetId(null)
                        }}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="soft">Soft — friendly rounded cards</option>
                        <option value="organic">Organic — larger bubbly radii</option>
                        <option value="era">Era — angled banners & clipped tiles</option>
                        <option value="sharp">Sharp — compact tech corners</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label="Surface chrome"
                      htmlFor="theme-chrome"
                      hint="Light / heavy adjusts the drop-shadow wash on the main workspace grid (desktop)."
                    >
                      <select
                        id="theme-chrome"
                        value={chromeWeight}
                        onChange={(event) => {
                          setChromeWeight(event.target.value as ChromeWeight)
                          setActiveUiPresetId(null)
                        }}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="light">Light — airy, low lift</option>
                        <option value="standard">Standard — balanced</option>
                        <option value="heavy">Heavy — deeper stack</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label="Workspace density"
                      htmlFor="theme-density"
                      hint="Controls vertical rhythm between the header, status strip, and grid."
                    >
                      <select
                        id="theme-density"
                        value={workspaceDensity}
                        onChange={(event) => {
                          setWorkspaceDensity(event.target.value as WorkspaceDensity)
                          setActiveUiPresetId(null)
                        }}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="cozy">Cozy — tight spacing</option>
                        <option value="comfortable">Comfortable — default</option>
                        <option value="spacious">Spacious — more air</option>
                      </select>
                    </SettingsField>
                  </SettingsSection>

                  <SettingsSection title="Columns & regions">
                    <SettingsField
                      label="Campaign column"
                      htmlFor="theme-sidebar-side"
                      hint="Auto follows each palette’s authored grid (e.g. Win98 explorer on the right). Left / Right forces the campaign sidebar on large screens and overrides those templates."
                    >
                      <select
                        id="theme-sidebar-side"
                        value={sidebarPlacement}
                        onChange={(event) => {
                          setSidebarPlacement(event.target.value as SidebarPlacement)
                          setActiveUiPresetId(null)
                        }}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="auto">Auto — palette default</option>
                        <option value="left">Force left column</option>
                        <option value="right">Force right column</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label="Sidebar width (forced)"
                      htmlFor="theme-sidebar-w"
                      hint="Only applies when Campaign column is not Auto (lg breakpoint and up)."
                    >
                      <select
                        id="theme-sidebar-w"
                        value={sidebarWidth}
                        onChange={(event) => {
                          setSidebarWidth(event.target.value as SidebarWidthPreset)
                          setActiveUiPresetId(null)
                        }}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="compact">Compact — 240px</option>
                        <option value="medium">Medium — 300px</option>
                        <option value="wide">Wide — 380px</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label="Layout edit mode"
                      htmlFor="theme-layout-edit"
                      hint="When on, reorder only from the bottom panel: drag rows, use ↑ ↓, or focus a row and use arrows, Home, or End. Battle drag-and-drop pauses while this is on."
                    >
                      <select
                        id="theme-layout-edit"
                        value={layoutEditMode ? 'on' : 'off'}
                        onChange={(event) => setLayoutEditMode(event.target.value === 'on')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="off">Off</option>
                        <option value="on">On — reorder regions</option>
                      </select>
                    </SettingsField>
                    <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                      Current order:{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-200">
                        {workspaceFlow.join(' → ')}
                      </span>
                    </p>
                  </SettingsSection>

                  <SettingsSection title="UI presets">
                    <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                      Presets capture shape, chrome, density, columns, region order, and layout mode. They optionally include the active color scheme. Stored in{' '}
                      <span className="font-mono text-[10px]">localStorage</span> on this device (shared across accounts).
                    </p>
                    <SettingsField label="Preset name" htmlFor="theme-preset-name" hint="Choose a short label before saving.">
                      <input
                        id="theme-preset-name"
                        value={newPresetDraftName}
                        onChange={(event) => setNewPresetDraftName(event.target.value)}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                        maxLength={80}
                      />
                    </SettingsField>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ecs-interactive rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/60"
                        onClick={() => {
                          const preset = {
                            id: newPresetId(),
                            name: newPresetDraftName.trim() || 'Untitled layout',
                            updatedAt: new Date().toISOString(),
                            layout: {
                              cornerStyle,
                              chromeWeight,
                              sidebarPlacement,
                              sidebarWidth,
                              workspaceDensity,
                              workspaceFlow,
                              useThemeLayout,
                              colorScheme
                            }
                          }
                          setUiPresets(upsertUiPreset(uiPresets, preset))
                          setActiveUiPresetId(preset.id)
                          setAppMessage(`Saved preset “${preset.name}”.`)
                        }}
                      >
                        Save new preset
                      </button>
                      {activeUiPresetId ? (
                        <button
                          type="button"
                          className="ecs-interactive rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/60"
                          onClick={() => {
                            const existing = uiPresets.find((p) => p.id === activeUiPresetId)
                            if (!existing) return
                            const preset = {
                              ...existing,
                              updatedAt: new Date().toISOString(),
                              layout: {
                                cornerStyle,
                                chromeWeight,
                                sidebarPlacement,
                                sidebarWidth,
                                workspaceDensity,
                                workspaceFlow,
                                useThemeLayout,
                                colorScheme
                              }
                            }
                            setUiPresets(upsertUiPreset(uiPresets, preset))
                            setAppMessage(`Updated preset “${preset.name}”.`)
                          }}
                        >
                          Overwrite selected
                        </button>
                      ) : null}
                    </div>
                    <SettingsField label="Apply preset" htmlFor="theme-preset-apply" hint="Loads the saved layout bundle.">
                      <select
                        id="theme-preset-apply"
                        value={activeUiPresetId ?? ''}
                        onChange={(event) => {
                          const id = event.target.value
                          if (!id) {
                            setActiveUiPresetId(null)
                            setRegionFlowCustom(false)
                            setWorkspaceFlow(themedWorkspaceFlowDefault(colorScheme, useThemeLayout))
                            return
                          }
                          const p = uiPresets.find((row) => row.id === id)
                          if (!p) return
                          const { layout } = p
                          setCornerStyle(layout.cornerStyle)
                          setChromeWeight(layout.chromeWeight)
                          setSidebarPlacement(layout.sidebarPlacement)
                          setSidebarWidth(layout.sidebarWidth)
                          setWorkspaceDensity(layout.workspaceDensity)
                          setWorkspaceFlow(normalizeWorkspaceFlow(layout.workspaceFlow))
                          setUseThemeLayout(layout.useThemeLayout)
                          if (layout.colorScheme) applyColorSchemeSelection(parseColorScheme(layout.colorScheme))
                          setRegionFlowCustom(true)
                          setActiveUiPresetId(p.id)
                          setAppMessage(`Applied preset “${p.name}”.`)
                        }}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="">— none —</option>
                        {uiPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </SettingsField>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!activeUiPresetId}
                        className="ecs-interactive rounded-md border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-500/10"
                        onClick={() => {
                          if (!activeUiPresetId) return
                          setUiPresets(deleteUiPreset(uiPresets, activeUiPresetId))
                          setActiveUiPresetId(null)
                          setAppMessage('Deleted preset.')
                        }}
                      >
                        Delete selected
                      </button>
                      <button
                        type="button"
                        className="ecs-interactive rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/60"
                        onClick={() => setUiPresets(loadUiPresets())}
                      >
                        Reload list
                      </button>
                    </div>
                  </SettingsSection>

                  <SettingsSection title="Appearance storage">
                    <SettingsField
                      label="Remember appearance per account"
                      htmlFor="theme-persist"
                      hint="Saves Theme menu choices per account on this device. Guests still get a local theme on the sign-in screen."
                    >
                      <select
                        id="theme-persist"
                        value={persistThemePerAccount ? 'on' : 'off'}
                        onChange={(event) => setPersistThemePerAccount(event.target.value === 'on')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="on">On — per account</option>
                        <option value="off">Off — session only</option>
                      </select>
                    </SettingsField>
                  </SettingsSection>

                  <SettingsSection title="Sound">
                    <SettingsField
                      label="Button click sound"
                      htmlFor="theme-ui-sounds"
                      hint="Very short tick on primary mouse / pen presses for buttons and button-like controls (capture phase). Off by default; first click unlocks audio in the browser."
                    >
                      <select
                        id="theme-ui-sounds"
                        value={uiSoundsEnabled ? 'on' : 'off'}
                        onChange={(event) => setUiSoundsEnabled(event.target.value === 'on')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="off">Off</option>
                        <option value="on">On — tick on button presses</option>
                      </select>
                    </SettingsField>
                  </SettingsSection>

                  <SettingsSection title="Attack generator">
                    <SettingsField
                      label="Append generated attacks"
                      htmlFor="theme-merge-attacks"
                      hint="Off replaces the previous generated batch each time you generate. On keeps prior batches. Manual attacks are never removed."
                    >
                      <select
                        id="theme-merge-attacks"
                        value={mergeGeneratedAttacks ? 'on' : 'off'}
                        onChange={(event) => setMergeGeneratedAttacks(event.target.value === 'on')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="off">Replace prior generated batch</option>
                        <option value="on">Append new generated batch</option>
                      </select>
                    </SettingsField>
                  </SettingsSection>
                </div>

                <footer className="border-t border-slate-200/60 px-4 py-2 text-[10px] text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
                  Sheet rules (TTRPG / DnD) use the toggle in the header bar.
                </footer>
              </div>
            </>,
            document.body
          )
        : null}

      {showSettingsMenu && settingsPanelPos
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close settings"
                className="fixed inset-0 z-[50000] cursor-default bg-slate-950/30 motion-safe:animate-ecs-backdrop-in"
                onClick={() => setShowSettingsMenu(false)}
              />
              <div
                role="dialog"
                aria-label="Workspace settings"
                className={cn(
                  'fixed z-[50001] flex max-h-[min(80vh,640px)] w-80 origin-top-right flex-col overflow-hidden rounded-xl border shadow-xl motion-safe:animate-ecs-pop-in',
                  cardClass
                )}
                style={{ top: settingsPanelPos.top, left: settingsPanelPos.left }}
              >
                <header className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3 dark:border-slate-700/60">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      Settings
                    </div>
                    <div className="text-sm font-semibold">Workspace preferences</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettingsMenu(false)}
                    aria-label="Close settings"
                    className="ecs-interactive rounded-md border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  >
                    Close
                  </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <p className="mb-4 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-600 dark:border-slate-600/80 dark:bg-slate-800/50 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Theme, colors, and presets</span> live in the header{' '}
                    <span className="font-mono text-[10px]">Theme</span> menu. Use <span className="font-mono text-[10px]">Layout</span>{' '}
                    (⇅) to open the bottom panel and reorder the title bar, status strip, and main column. The{' '}
                    <span className="font-mono text-[10px]">TTRPG</span> / <span className="font-mono text-[10px]">DnD</span> toggle sets sheet rules.
                  </p>

                  <SettingsSection title="Secret codes">
                    <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                      Unlock extra themes on this device. Codes are checked locally; nothing is sent to a server.
                    </p>
                    {beeThemeUnlocked ? (
                      <p className="mt-2 rounded-md border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-900/25 dark:text-emerald-100">
                        Honey bee theme unlocked — open the header <span className="font-mono">Theme</span> menu, then{' '}
                        <span className="font-semibold">Color scheme</span>.
                      </p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={secretCodeInput}
                        onChange={(event) => {
                          setSecretCodeInput(event.target.value)
                          setSecretCodeHint(null)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          document.getElementById('ecs-secret-code-apply')?.click()
                        }}
                        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                        placeholder="Enter code"
                        aria-label="Secret code"
                      />
                      <button
                        id="ecs-secret-code-apply"
                        type="button"
                        className="ecs-interactive shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/60"
                        onClick={() => {
                          if (normalizeSecretInput(secretCodeInput) === BEE_THEME_SECRET_NORMALIZED) {
                            if (beeThemeUnlocked) {
                              setSecretCodeHint('Honey bee theme is already unlocked.')
                              return
                            }
                            persistBeeThemeUnlocked()
                            setBeeThemeUnlocked(true)
                            setSecretCodeInput('')
                            setSecretCodeHint('Unlocked. Open Theme → Color scheme and pick Honey bee.')
                            return
                          }
                          setSecretCodeHint('That code is not recognized.')
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    {secretCodeHint ? (
                      <p className="mt-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300">{secretCodeHint}</p>
                    ) : null}
                  </SettingsSection>

                  <SettingsSection title="Workspace layout">
                    <SettingsField
                      label="Layout edit mode"
                      htmlFor="settings-layout-edit"
                      hint="When on, use the bottom panel: drag rows, use ↑ ↓, or focus a row and use arrows, Home, or End. Battle drag-and-drop pauses while this is on."
                    >
                      <select
                        id="settings-layout-edit"
                        value={layoutEditMode ? 'on' : 'off'}
                        onChange={(event) => setLayoutEditMode(event.target.value === 'on')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="off">Off</option>
                        <option value="on">On — reorder regions</option>
                      </select>
                    </SettingsField>
                    <p className="mt-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                      Current order:{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-200">{workspaceFlow.join(' → ')}</span>
                    </p>
                  </SettingsSection>

                  <SettingsSection title="Help & guidance">
                    <SettingsField
                      label="Guided helper text"
                      htmlFor="setting-guided"
                      hint="Show extra one-liners around the sidebar and tabs. Turn off once you know your way around. Per-tab Compact / Full controls live on the tab itself."
                    >
                      <select
                        id="setting-guided"
                        value={guidedSetup ? 'on' : 'off'}
                        onChange={(event) => setGuidedSetup(event.target.value === 'on')}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="on">On — show helper text</option>
                        <option value="off">Off — hide helper text</option>
                      </select>
                    </SettingsField>
                    <SettingsField
                      label="Startup splash duration"
                      htmlFor="setting-startup-splash"
                      hint="How long the Tactile loading splash stays visible during launch."
                    >
                      <select
                        id="setting-startup-splash"
                        value={String(startupSplashDurationMs)}
                        onChange={(event) => setStartupSplashDurationMs(parseStartupSplashDuration(event.target.value))}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
                      >
                        <option value="1200">Quick — 1.2s</option>
                        <option value="2200">Standard — 2.2s</option>
                        <option value="3000">Long — 3.0s</option>
                        <option value="4500">Extended — 4.5s</option>
                      </select>
                    </SettingsField>
                  </SettingsSection>
                </div>

                <footer className="flex items-center justify-between border-t border-slate-200/60 px-4 py-3 text-xs dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400">Changes apply immediately</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRulesMode('ttrpg')
                      setColorScheme('default')
                      setUseThemeLayout(true)
                      setThemeMode('system')
                      setCornerStyle('soft')
                      setChromeWeight('standard')
                      setSidebarPlacement('auto')
                      setSidebarWidth('medium')
                      setWorkspaceDensity('comfortable')
                      setRegionFlowCustom(false)
                      setWorkspaceFlow(themedWorkspaceFlowDefault('default', true))
                      setActiveUiPresetId(null)
                      setLayoutEditMode(false)
                      setMergeGeneratedAttacks(false)
                      setPersistThemePerAccount(true)
                      setUiSoundsEnabled(false)
                      setStartupSplashDurationMs(3000)
                      setGuidedSetup(true)
                      setCompactCreator(true)
                      setCompactBattle(true)
                      setAppMessage('Settings reset to defaults.')
                    }}
                    className="ecs-interactive rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800/60"
                  >
                    Reset to defaults
                  </button>
                </footer>
              </div>
            </>,
            document.body
          )
        : null}

      {layoutEditMode && isAuthed
        ? createPortal(
            <>
              <div id="ecs-layout-howto" className="sr-only">
                Workspace order is a vertical stack: title bar, status strip, then campaign and editor. Reorder only in
                this panel: drag a row onto another row, use the up and down buttons, or focus a row with Tab and use
                arrow keys, Home, or End. Press Escape or Done to exit.
              </div>
              <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                {layoutA11yMessage}
              </div>
              <div
                role="dialog"
                aria-label="Workspace order"
                aria-describedby="ecs-layout-editor-hint ecs-layout-howto"
                className="pointer-events-auto fixed bottom-5 left-1/2 z-[60000] flex w-[min(26rem,calc(100vw-1.25rem))] max-w-[calc(100vw-1.25rem)] -translate-x-1/2 flex-col gap-2 rounded-xl border border-amber-400/70 bg-amber-50/98 px-3 py-2.5 text-xs font-semibold text-amber-950 shadow-xl backdrop-blur-md dark:border-amber-400/50 dark:bg-slate-900/98 dark:text-amber-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-50">Workspace order</h2>
                  <button
                    type="button"
                    className="ecs-interactive shrink-0 rounded-md border border-amber-600/60 bg-white/90 px-3 py-1.5 text-[11px] font-bold text-amber-950 hover:bg-white dark:border-amber-300/50 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/70"
                    onClick={() => setLayoutEditMode(false)}
                  >
                    Done
                  </button>
                </div>
                <p
                  id="ecs-layout-editor-hint"
                  className="text-[11px] font-medium leading-snug text-amber-900/90 dark:text-amber-100/90"
                >
                  Top shows first. Drag a row, tap the arrows, or focus a row and use arrow keys, Home, or End.
                </p>
                <ul
                  className="m-0 list-none space-y-1.5 p-0"
                  aria-label="Vertical stack order"
                  aria-describedby="ecs-layout-howto"
                >
                  {workspaceFlow.map((r, idx) => {
                    const label = ecsWorkspaceRegionLabel(r)
                    const isDropHighlight =
                      layoutPanelDropOver === r && layoutPanelDragFrom !== null && layoutPanelDragFrom !== r
                    return (
                      <li
                        key={r}
                        tabIndex={0}
                        draggable
                        aria-label={`${label}, position ${idx + 1} of ${workspaceFlow.length}`}
                        className={cn(
                          'flex cursor-grab items-center justify-between gap-2 rounded-lg border border-amber-600/40 bg-white/90 px-2.5 py-2 text-[12px] text-amber-950 outline-none transition-[opacity,box-shadow] active:cursor-grabbing dark:border-amber-400/35 dark:bg-slate-950/70 dark:text-amber-50',
                          'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50 dark:focus-visible:ring-amber-400 dark:focus-visible:ring-offset-slate-900',
                          layoutPanelDragFrom === r && 'opacity-55',
                          isDropHighlight &&
                            'ring-2 ring-amber-500 ring-offset-2 ring-offset-amber-50 dark:ring-amber-400 dark:ring-offset-slate-900'
                        )}
                        onDragStart={(e) => {
                          setLayoutPanelDragFrom(r)
                          e.dataTransfer.setData('application/ecs-flow', r)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          setLayoutPanelDropOver(r)
                        }}
                        onDragLeave={(e) => {
                          if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) {
                            setLayoutPanelDropOver((h) => (h === r ? null : h))
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const raw = e.dataTransfer.getData('application/ecs-flow')
                          if (raw === 'header' || raw === 'status' || raw === 'grid') reorderWorkspaceFlow(raw, r)
                          setLayoutPanelDropOver(null)
                          setLayoutPanelDragFrom(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                            e.preventDefault()
                            moveWorkspaceRegionByOffset(r, -1)
                            return
                          }
                          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                            e.preventDefault()
                            moveWorkspaceRegionByOffset(r, 1)
                            return
                          }
                          if (e.key === 'Home') {
                            e.preventDefault()
                            moveWorkspaceRegionToIndex(r, 0)
                            return
                          }
                          if (e.key === 'End') {
                            e.preventDefault()
                            moveWorkspaceRegionToIndex(r, workspaceFlow.length)
                          }
                        }}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="select-none text-amber-600/70 dark:text-amber-300/80" aria-hidden>
                            ⋮⋮
                          </span>
                          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-amber-700/25 bg-amber-100/80 px-1.5 text-[11px] font-black tabular-nums text-amber-900 dark:border-amber-200/20 dark:bg-slate-900/80 dark:text-amber-100">
                            {idx + 1}
                          </span>
                          <span className="truncate font-medium">{label}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="ecs-interactive cursor-pointer rounded border border-amber-700/35 px-1.5 py-0.5 text-[12px] font-bold leading-none text-amber-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 dark:border-amber-200/30 dark:text-amber-50 dark:hover:bg-slate-800/80"
                            disabled={idx <= 0}
                            aria-label={`Move ${label} up`}
                            onClick={() => moveWorkspaceRegionByOffset(r, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="ecs-interactive cursor-pointer rounded border border-amber-700/35 px-1.5 py-0.5 text-[12px] font-bold leading-none text-amber-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 dark:border-amber-200/30 dark:text-amber-50 dark:hover:bg-slate-800/80"
                            disabled={idx >= workspaceFlow.length - 1}
                            aria-label={`Move ${label} down`}
                            onClick={() => moveWorkspaceRegionByOffset(r, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div className="border-t border-amber-400/40 pt-2 dark:border-amber-500/30">
                  <button
                    type="button"
                    className="ecs-interactive rounded-md border border-amber-700/40 bg-white/90 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 hover:bg-white dark:border-amber-300/40 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-900/70"
                    onClick={() => {
                      setRegionFlowCustom(false)
                      setWorkspaceFlow(themedWorkspaceFlowDefault(colorScheme, useThemeLayout))
                      setActiveUiPresetId(null)
                      setLayoutA11yMessage(
                        `Reset vertical order to palette default: ${themedWorkspaceFlowDefault(colorScheme, useThemeLayout)
                          .map(ecsWorkspaceRegionLabel)
                          .join(', ')}.`
                      )
                    }}
                  >
                    Reset to palette default
                  </button>
                </div>
              </div>
            </>,
            document.body
          )
        : null}

    </div>
  )
}

