#!/usr/bin/env bash
# praxio-release-smoke.sh — post-build smoke check for each Praxio DMG.
#
# For every Praxio-*.dmg in the supplied directory:
#   1. hdiutil-mount the DMG to a per-DMG mount point
#   2. assert Praxio.app exists at the expected layout
#   3. codesign --verify --deep --strict the .app
#   4. spctl --assess --type execute (Gatekeeper acceptance check)
#   5. xcrun stapler validate (notarization ticket attached to the .app)
#   6. xcrun stapler validate on the .dmg itself
#   7. unmount cleanly (always, even on failure)
#
# This script is the AZU-1833 smoke step. Spawning the embedded server
# headless from inside the mounted .app and probing /healthz is reserved
# for a follow-up: the current Praxio.app launches a UI window and does
# not expose a headless run mode, so faking it from CI would either time
# out the runner or pass trivially.
#
# Usage:
#   scripts/praxio-release-smoke.sh dist-electron
#
# Exits non-zero on the first DMG that fails any check. Always unmounts
# what it mounted, including on early exit.

set -euo pipefail

DIST_DIR="${1:-dist-electron}"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "::error::Distribution directory not found: $DIST_DIR"
  exit 1
fi

# Track mount points so the EXIT trap can unmount everything we touched.
declare -a MOUNTED_PATHS=()

cleanup() {
  local rc=$?
  set +e
  for mp in "${MOUNTED_PATHS[@]:-}"; do
    if [[ -n "$mp" && -d "$mp" ]]; then
      echo "[smoke] unmounting $mp"
      hdiutil detach "$mp" -force >/dev/null 2>&1 || true
    fi
  done
  exit "$rc"
}
trap cleanup EXIT INT TERM

shopt -s nullglob
DMG_LIST=( "$DIST_DIR"/Praxio-*.dmg )
shopt -u nullglob

if [[ "${#DMG_LIST[@]}" -eq 0 ]]; then
  echo "::error::No Praxio-*.dmg files found in $DIST_DIR"
  exit 1
fi

echo "[smoke] found ${#DMG_LIST[@]} DMG(s) to smoke-test"
printf '  - %s\n' "${DMG_LIST[@]}"

# Track per-arch hits so we fail loudly if one arch is silently absent.
HAS_ARM64=0
HAS_X64=0

for dmg in "${DMG_LIST[@]}"; do
  echo
  echo "[smoke] === $dmg ==="

  case "$dmg" in
    *arm64*) HAS_ARM64=1 ;;
    *x64*)   HAS_X64=1   ;;
  esac

  # 1. Mount to a unique read-only mountpoint. -nobrowse keeps Finder
  # from opening the volume on the runner. -noautoopen keeps any
  # bundled .app from auto-launching.
  mount_root="$(mktemp -d /tmp/praxio-smoke.XXXXXX)"
  echo "[smoke] mounting -> $mount_root"
  hdiutil attach "$dmg" \
    -nobrowse -noautoopen -readonly \
    -mountpoint "$mount_root" >/dev/null
  MOUNTED_PATHS+=( "$mount_root" )

  # 2. Locate Praxio.app inside the mounted volume.
  app_path="$mount_root/Praxio.app"
  if [[ ! -d "$app_path" ]]; then
    echo "::error::Praxio.app not found at $app_path"
    ls -la "$mount_root"
    exit 1
  fi
  echo "[smoke] found $app_path"

  # Sanity check: the executable inside the .app exists.
  exe_path="$app_path/Contents/MacOS/Praxio"
  if [[ ! -x "$exe_path" ]]; then
    echo "::error::Main executable not found / not executable: $exe_path"
    exit 1
  fi

  # 2b. Per-arch postgres binary must be inside the unpacked resources.
  case "$dmg" in
    *arm64*) embedded_arch="darwin-arm64" ;;
    *x64*)   embedded_arch="darwin-x64"   ;;
    *)       embedded_arch=""             ;;
  esac
  if [[ -n "$embedded_arch" ]]; then
    pg_dir="$app_path/Contents/Resources/app.asar.unpacked/node_modules/@embedded-postgres/$embedded_arch"
    if [[ ! -d "$pg_dir" ]]; then
      echo "::error::Embedded postgres dir missing for $embedded_arch inside DMG: $pg_dir"
      exit 1
    fi
    echo "[smoke] ok: embedded-postgres/$embedded_arch present"
  fi

  # 3. codesign --verify --deep --strict
  echo "[smoke] codesign verify..."
  codesign --verify --deep --strict --verbose=2 "$app_path"

  # 4. spctl --assess (Gatekeeper acceptance). On macos-14 runners this
  # only succeeds when the .app is notarized + stapled OR the runner has
  # an exception. We want the former; the runner has none.
  echo "[smoke] spctl assess..."
  spctl --assess --verbose=4 --type execute "$app_path"

  # 5. stapler validate on the .app — confirms the notarization ticket
  # was stapled to the bundle.
  echo "[smoke] stapler validate (app)..."
  xcrun stapler validate "$app_path"

  # 6. stapler validate on the DMG itself — confirms the DMG (not just
  # the .app inside it) carries a stapled ticket, so end users can mount
  # offline without a Gatekeeper round-trip.
  echo "[smoke] stapler validate (dmg)..."
  xcrun stapler validate "$dmg"

  # 7. Unmount and drop from cleanup list.
  echo "[smoke] unmounting $mount_root"
  hdiutil detach "$mount_root" -force >/dev/null
  # Remove this mount point from MOUNTED_PATHS so the EXIT trap doesn't
  # try to double-detach it (which prints a noisy "no such mount" error).
  new_paths=()
  for mp in "${MOUNTED_PATHS[@]}"; do
    [[ "$mp" != "$mount_root" ]] && new_paths+=( "$mp" )
  done
  MOUNTED_PATHS=( "${new_paths[@]:-}" )
  rmdir "$mount_root" 2>/dev/null || true

  echo "[smoke] PASS — $(basename "$dmg")"
done

if [[ "$HAS_ARM64" -ne 1 ]]; then
  echo "::error::No arm64 DMG found among smoke-tested artifacts."
  exit 1
fi
if [[ "$HAS_X64" -ne 1 ]]; then
  echo "::error::No x64 DMG found among smoke-tested artifacts."
  exit 1
fi

echo
echo "[smoke] all DMGs passed sign + notarize + staple checks."
