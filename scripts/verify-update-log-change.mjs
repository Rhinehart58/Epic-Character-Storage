#!/usr/bin/env node
import { execSync } from 'node:child_process'

function sh(command) {
  return execSync(command, { encoding: 'utf8' }).trim()
}

function trySh(command) {
  try {
    return sh(command)
  } catch {
    return null
  }
}

function changedFilesForCiContext() {
  const split = (out) => (out ? out.split('\n').filter(Boolean) : [])
  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  if (eventName === 'push') {
    const before = process.env.GITHUB_EVENT_BEFORE
    if (!before || /^0+$/.test(before)) return []
    const out = trySh(`git diff --name-only ${before}...HEAD`)
    if (out !== null) return split(out)
    const fallback = trySh('git diff --name-only HEAD~1...HEAD')
    if (fallback !== null) return split(fallback)
    return split(trySh('git diff --name-only HEAD'))
  }

  if (eventName === 'pull_request') {
    const baseRef = process.env.GITHUB_BASE_REF
    if (!baseRef) return []
    trySh(`git fetch origin ${baseRef} --depth=50`)
    const mergeBase = trySh(`git merge-base HEAD origin/${baseRef}`)
    if (mergeBase) {
      const out = trySh(`git diff --name-only ${mergeBase}...HEAD`)
      if (out !== null) return split(out)
    }
    const fallback = trySh('git diff --name-only HEAD~1...HEAD')
    if (fallback !== null) return split(fallback)
    return split(trySh('git diff --name-only HEAD'))
  }

  return split(trySh('git diff --name-only HEAD'))
}

const files = changedFilesForCiContext()
if (files.length === 0) process.exit(0)

const updateLogTouched = files.includes('update-log.json')
const meaningfulChange = files.some((file) => {
  if (file === 'update-log.json') return false
  if (file.startsWith('src/')) return true
  if (file.startsWith('resources/')) return true
  if (file.startsWith('build/')) return true
  return (
    file === 'package.json' ||
    file === 'package-lock.json' ||
    file === 'electron-builder.yml' ||
    file === 'update-feed.config.json'
  )
})

if (meaningfulChange && !updateLogTouched) {
  console.error('Push blocked: app changes detected but update-log.json was not updated.')
  console.error('Add an update-log entry before pushing these changes.')
  process.exit(1)
}

console.log('Update-log check passed.')
