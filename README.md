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
cd epic-character-storage
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
Use `RELEASE_NOTES_TEMPLATE.md` as the standard notes/checklist for each version.

### macOS "app is damaged" permanent fix (maintainers)

Unsigned macOS builds can be blocked by Gatekeeper and shown as "damaged."  
To stop this for released builds, configure Apple signing + notarization secrets in GitHub:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

The release workflow will automatically notarize macOS artifacts when these secrets are present.
If they are missing, the macOS release job now fails intentionally so unsigned "damaged" builds are not shipped by mistake.

Required repository secrets for signed/notarized macOS releases:

- `CSC_LINK` (base64/file link to Developer ID Application `.p12`)
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- Optional alternative auth: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`

If you need to ship unsigned builds temporarily, set:

- `ALLOW_UNSIGNED_MAC_RELEASE=true`

This enables fallback unsigned mac artifacts in CI. Keep in mind users may still see Gatekeeper trust warnings.

### macOS no-paid-account workaround

If you are distributing unsigned builds, users can install with a workaround script that copies the app and clears quarantine:

```bash
curl -fsSL "https://raw.githubusercontent.com/Rhinehart58/Epic-Character-Storage/main/scripts/install-macos-workaround.sh" | bash -s -- latest
```

You can also pass a specific tag:

```bash
curl -fsSL "https://raw.githubusercontent.com/Rhinehart58/Epic-Character-Storage/main/scripts/install-macos-workaround.sh" | bash -s -- v1.0.13
```

This is a workaround only; notarized/signing distribution remains the recommended path.

### macOS "app is damaged" bypass (end users)

If macOS shows "Tactile is damaged and can't be opened", try these in order:

1. **Use in-app repair first**  
   On the login screen, click **Repair/Reinstall**.
2. **Use the installer workaround script**  
   ```bash
   curl -fsSL "https://raw.githubusercontent.com/Rhinehart58/Epic-Character-Storage/main/scripts/install-macos-workaround.sh" | bash -s -- latest
   ```
3. **Manual fallback (if needed)**  
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Tactile.app"
   open "/Applications/Tactile.app"
   ```
4. **If you still have old copies installed**  
   Remove older `Tactile.app` copies from Downloads/Desktop/Applications and launch only the newest one in `/Applications`.

These steps are for unsigned builds. Signed + notarized releases are the long-term fix.

### Windows publisher / firewall warning reduction

To show your publisher name and reduce SmartScreen/firewall trust prompts, sign Windows installers:

- Buy an OV/EV code-signing certificate (EV gives fastest SmartScreen trust)
- Add repo secrets:
  - `WIN_CSC_LINK` (base64/file link to `.pfx` / `.p12`)
  - `WIN_CSC_KEY_PASSWORD`
- Release workflow will sign Windows installers automatically when these are present.

Unsigned Windows builds still work but can show "Unknown publisher" warnings.

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

## Dev mode security note

Do not publish dev access credentials in documentation, release notes, screenshots, or support messages.  
Keep developer-only credentials private and rotate them before sharing builds outside your own test group.

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

