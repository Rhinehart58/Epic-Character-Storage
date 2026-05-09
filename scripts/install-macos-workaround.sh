#!/usr/bin/env bash
set -euo pipefail

REPO="Rhinehart58/Epic-Character-Storage"
APP_NAME="Tactile.app"
TMP_DIR="${TMPDIR:-/tmp}"

VERSION="${1:-latest}"
if [[ "${VERSION}" == latest ]]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\(v[^"]*\)".*/\1/p' | head -n1)"
fi

if [[ -z "${VERSION}" ]]; then
  echo "Could not resolve release version."
  exit 1
fi

VERSION_NO_V="${VERSION#v}"
DMG_URL="https://github.com/${REPO}/releases/download/${VERSION}/tactile-${VERSION_NO_V}.dmg"
DMG_PATH="${TMP_DIR}/tactile-${VERSION_NO_V}.dmg"
MOUNT_BASE="/Volumes"

echo "Downloading ${DMG_URL}"
curl -fL "${DMG_URL}" -o "${DMG_PATH}"

echo "Mounting DMG"
hdiutil attach "${DMG_PATH}" -nobrowse -quiet

SRC_APP="$(ls -d "${MOUNT_BASE}"/*/"${APP_NAME}" 2>/dev/null | head -n1 || true)"
if [[ -z "${SRC_APP}" ]]; then
  echo "Could not find ${APP_NAME} in mounted DMG."
  hdiutil detach "$(ls -d "${MOUNT_BASE}"/* | tail -n1)" -quiet || true
  exit 1
fi

echo "Installing to /Applications/${APP_NAME}"
rm -rf "/Applications/${APP_NAME}"
cp -R "${SRC_APP}" "/Applications/"

echo "Removing quarantine attribute"
xattr -dr com.apple.quarantine "/Applications/${APP_NAME}" || true

MOUNT_POINT="$(dirname "${SRC_APP}")"
echo "Unmounting ${MOUNT_POINT}"
hdiutil detach "${MOUNT_POINT}" -quiet || true

echo "Done. Launching app."
open "/Applications/${APP_NAME}"
