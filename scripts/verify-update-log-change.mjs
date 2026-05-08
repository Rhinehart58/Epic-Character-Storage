#!/usr/bin/env node
import { execSync } from 'node:child_process'

function sh(command) {
  return execSync(command, { encoding: 'utf8' }).trim()
}

function changedFilesForCiContext() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  if (eventName === 'push') {
    const before = process.env.GITHUB_EVENT_BEFORE
    if (!before || /^0+$/.test(before)) return []
    const out = sh(`git diff --name-only ${before}...HEAD`)
    return out ? out.split('\n') : []
  }

  if (eventName === 'pull_request') {
    const baseRef = process.env.GITHUB_BASE_REF
    if (!baseRef) return []
    sh(`git fetch origin ${baseRef} --depth=1`)
    const mergeBase = sh(`git merge-base HEAD origin/${baseRef}`)
    const out = sh(`git diff --name-only ${mergeBase}...HEAD`)
    return out ? out.split('\n') : []
  }

  const out = sh('git diff --name-only HEAD')
  return out ? out.split('\n') : []
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
