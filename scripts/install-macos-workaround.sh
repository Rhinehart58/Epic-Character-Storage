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

echo "Downloading ${DMG_URL}"
curl -fL "${DMG_URL}" -o "${DMG_PATH}"

echo "Mounting DMG"
ATTACH_OUT="$(hdiutil attach "${DMG_PATH}" -nobrowse 2>&1)"
MOUNT_POINT="$(printf '%s\n' "${ATTACH_OUT}" | awk '/\/Volumes\// {print substr($0, index($0, "/Volumes/"))}' | tail -n1)"
if [[ -z "${MOUNT_POINT}" ]]; then
  echo "Could not mount DMG."
  printf '%s\n' "${ATTACH_OUT}"
  exit 1
fi

cleanup() {
  if [[ -n "${MOUNT_POINT:-}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet || true
  fi
}
trap cleanup EXIT

SRC_APP="${MOUNT_POINT}/${APP_NAME}"
if [[ ! -d "${SRC_APP}" ]]; then
  SRC_APP="$(ls -d "${MOUNT_POINT}"/*.app 2>/dev/null | head -n1 || true)"
  if [[ -z "${SRC_APP}" ]]; then
    echo "Could not find app bundle in mounted DMG."
    exit 1
  fi
fi

echo "Installing to /Applications/${APP_NAME}"
rm -rf "/Applications/${APP_NAME}"
ditto "${SRC_APP}" "/Applications/${APP_NAME}"

echo "Removing quarantine attribute"
xattr -dr com.apple.quarantine "/Applications/${APP_NAME}" || true

echo "Unmounting ${MOUNT_POINT}"
hdiutil detach "${MOUNT_POINT}" -quiet || true
MOUNT_POINT=""

echo "Done. Launching app."
open "/Applications/${APP_NAME}"
