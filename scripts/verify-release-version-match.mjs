#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const packageVersion = String(pkg.version ?? '').trim()

const tagRef = process.env.GITHUB_REF_NAME ?? process.env.RELEASE_TAG ?? ''
const tagVersion = tagRef.startsWith('v') ? tagRef.slice(1) : tagRef

if (!packageVersion) {
  console.error('Missing package version in package.json.')
  process.exit(1)
}

if (!tagVersion) {
  console.log('No release tag context found; skipping tag/version check.')
  process.exit(0)
}

if (packageVersion !== tagVersion) {
  console.error(`Release blocked: tag ${tagRef} does not match package.json version ${packageVersion}.`)
  console.error('Bump package.json first, then push a matching vX.Y.Z tag.')
  process.exit(1)
}

console.log(`Release version check passed (${packageVersion}).`)
