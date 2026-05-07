/** Local-only unlock flags (not synced to account JSON). */

export const BEE_THEME_SECRET_NORMALIZED = 'bee4u'

const STORAGE_BEE_THEME = 'ecs-secret-bee4u-v1'

export function readBeeThemeUnlocked(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_BEE_THEME) === '1'
  } catch {
    return false
  }
}

export function persistBeeThemeUnlocked(): void {
  try {
    window.localStorage.setItem(STORAGE_BEE_THEME, '1')
  } catch {
    /* quota / private mode */
  }
}

export function normalizeSecretInput(raw: string): string {
  return raw.trim().toLowerCase()
}
