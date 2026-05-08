# EPIC CHARACTER STORAGE

Desktop app for logging tabletop RPG characters with clean UI, bracket-style character sheet formatting, and keyword-based attack generation.

## Features

- Character CRUD: create, edit, delete, and browse saved characters.
- Dedicated authentication screen with:
  - Email/password login
  - Email/password account registration
  - Dev mode login shortcut (password gate)
  - Password reset flow (request token + reset with token)
- Login is always the first screen on app launch (no automatic session bypass).
- Session timeout logout after inactivity for safety.
- Theme modes: `system`, `light`, and `dark` (`system` follows OS appearance automatically).
- Themed page layout per color scheme, with a "default layout" toggle to keep the standard sidebar-on-left workspace.
- Bracket-sheet editor for:
  - `[Character Name] - [Hcurrent/max]`
  - `[Normal Armor : current/max]`
  - `[Dedicated Essence]`
  - `[Trait]`
  - `[Epic/Ultimate Move]`
  - `[Monolith]`
- One-click "Copy Sheet" output in bracketed campaign-ready text format.
- Flexible stat block: STR, DEX, CON, INT, WIS, CHA, HP, AC, and initiative.
- Attack manager: manually add/edit/remove attacks.
- Keyword attack generator: offline rules engine creates themed attacks from tags like `fire`, `shadow`, `holy`, `arcane`, and more.
- Local multi-account profiles.
- Campaign spaces with share codes (join locally on same machine).
- Shared campaign character sheets (characters saved into a campaign are visible for all campaign members in that app data store).
- Local persistence: characters are stored in your OS app data folder as JSON.

## Tech stack

- Electron + Vite + React + TypeScript
- Tailwind CSS for the UI system
- Main/renderer split with shared domain logic in `src/shared`

## Run locally

```bash
cd /Users/rhinehart/Documents/epic-character-storage
npm install
npm run dev
```

## Login update log (GitHub Raw)

The sign-in screen pulls **`update-log.json`** from the repo root. After you publish on GitHub:

1. Commit **`update-log.json`** at the repository root (same file ships as the offline fallback).
2. This repo ships with **`githubRepo`** set to `Rhinehart58/Epic-Character-Storage` in **`update-feed.config.json`** (change it if you fork). Adjust **`branch`** if your default branch is not `main`.
3. The app builds a Raw URL of the form  
   `https://raw.githubusercontent.com/<githubRepo>/<branch>/update-log.json`  
   and refreshes it about every five minutes while the login screen is open.

Optional: set **`VITE_UPDATE_LOG_URL`** in `.env` to override (see `.env.example`).

## Build

```bash
npm run build
npm run build:mac
npm run build:win
```

## GitHub downloads (Releases)

You can publish downloadable installers directly on GitHub Releases.

1. Bump version:
   ```bash
   npm run version:patch
   ```
2. Commit and push your changes.
3. Create and push a release tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. GitHub Actions `Release` workflow will build and attach:
   - macOS: `.dmg` (+ `.zip`)
   - Windows: `setup.exe`
   - Linux: `.AppImage` + `.deb`

Downloads will appear in your repository's [Releases](https://github.com/Rhinehart58/Epic-Character-Storage/releases) page.

## Architecture notes

- `src/shared/character-types.ts`: core app domain model.
- `src/shared/attack-generator.ts`: deterministic keyword-to-attack rules engine.
- `src/main/character-store.ts`: JSON persistence in main process.
- `src/main/index.ts`: IPC for character CRUD + attack generation.
- `src/preload/index.ts`: secure API surface exposed to renderer.
- `src/renderer/src/App.tsx`: main UI layout and workflows.

This structure keeps generation logic portable so future web/embed versions can reuse shared modules.

## Collaboration scope note

Current Phase 2 collaboration is local-first (same machine/app data).  
Next backend phase can add cloud auth, cross-device sync, and real-time multiplayer collaboration.

## Dev mode login password

Current dev-mode password is defined in `src/main/character-store.ts` as:

- `epic-dev`

Change this constant before shipping builds to other users.

## Confirmation email setup

New registrations attempt to send a confirmation email via SMTP.
Set these environment variables before launching the app:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- Optional: `SMTP_SECURE` (`true`/`false`)

If SMTP is not configured, account creation still succeeds and the app will show a clear message that email sending was skipped.

## Password policy

Registration and reset passwords must include:

- At least 8 characters
- One uppercase letter
- One lowercase letter
- One number

