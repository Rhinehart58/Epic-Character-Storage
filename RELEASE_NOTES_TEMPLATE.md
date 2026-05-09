# Tactile vX.Y.Z Release Notes Template

Use this template each release so update messaging stays consistent.

## Title

`vX.Y.Z: <short headline>`

## Summary

- <most important improvement>
- <second important improvement>
- <third important improvement>

## Installer / Trust Notes

- **macOS:** If you are on unsigned builds, run:
  ```bash
  curl -fsSL "https://raw.githubusercontent.com/Rhinehart58/Epic-Character-Storage/main/scripts/install-macos-workaround.sh" | bash -s -- vX.Y.Z
  ```
- **Windows:** Unsigned builds may show SmartScreen / publisher prompts.

## In-app Update Expectations

- Current version in app should report `X.Y.Z`.
- A previous version (`X.Y.(Z-1)`) should detect `vX.Y.Z` via Check for updates.
- Restart & install should complete and relaunch on supported platforms.

## Verification Checklist

- [ ] `package.json` version is `X.Y.Z`
- [ ] Tag is `vX.Y.Z`
- [ ] `update-log.json` has a new top entry
- [ ] Release assets include installer files and updater metadata (`latest*.yml`, `.blockmap`)
- [ ] App reports `X.Y.Z` after install
