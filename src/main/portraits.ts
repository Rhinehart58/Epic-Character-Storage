import { app, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { extname, join, relative, resolve } from 'path'

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export function portraitsRoot(): string {
  return join(app.getPath('userData'), 'portraits')
}

export function resolvePortraitFullPath(relativePath: string): string {
  return resolve(join(app.getPath('userData'), relativePath.replace(/^[/\\]+/, '')))
}

export function deletePortraitIfExists(relativePath: string | undefined | null): void {
  if (!relativePath || typeof relativePath !== 'string') return
  const full = resolvePortraitFullPath(relativePath)
  const root = resolve(portraitsRoot())
  const rel = relative(root, full)
  if (rel.startsWith('..')) return
  if (existsSync(full)) unlinkSync(full)
}

export async function pickAndStorePortrait(characterId: string | null): Promise<{
  ok: boolean
  message?: string
  portraitRelativePath?: string
}> {
  const picked = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  if (picked.canceled || !picked.filePaths[0]) {
    return { ok: false, message: 'No image selected.' }
  }

  mkdirSync(portraitsRoot(), { recursive: true })
  let ext = extname(picked.filePaths[0]).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) ext = '.png'

  const token = characterId ?? `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const relative = `portraits/${token}${ext}`
  const dest = resolvePortraitFullPath(relative)
  copyFileSync(picked.filePaths[0], dest)
  return { ok: true, portraitRelativePath: relative.replace(/\\/g, '/') }
}

/** When a new character is saved, rename draft-* portrait file to final id. */
export function renameDraftPortrait(draftRelative: string | undefined, finalCharacterId: string): string | null {
  if (!draftRelative || !draftRelative.includes('draft-')) return null
  const fullOld = resolvePortraitFullPath(draftRelative)
  const root = resolve(portraitsRoot())
  const relOld = relative(root, fullOld)
  if (relOld.startsWith('..') || !existsSync(fullOld)) return null

  const ext = extname(draftRelative) || '.png'
  const relativeNew = `portraits/${finalCharacterId}${ext}`.replace(/\\/g, '/')
  const fullNew = resolvePortraitFullPath(relativeNew)
  if (existsSync(fullNew)) unlinkSync(fullNew)
  renameSync(fullOld, fullNew)
  return relativeNew
}
