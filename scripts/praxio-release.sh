#!/usr/bin/env bash
# Praxio release helper — Phase B-2 (AZU-1834)
#
# Bumps electron/package.json to the given CalVer version, generates a
# Praxio-scoped CHANGELOG.md entry from git history scoped to Praxio paths,
# commits the change, and tags `praxio-v<version>`. Pushing the tag is what
# triggers the Phase B-1 release workflow (.github/workflows/praxio-release.yml).
#
# Usage:
#   scripts/praxio-release.sh <calver>            # bump + commit + tag (no push)
#   scripts/praxio-release.sh <calver> --push     # ...and push the tag
#   scripts/praxio-release.sh <calver> --dry-run  # show planned changes only
#   scripts/praxio-release.sh --help
#
# CalVer format: YYYY.M.PATCH  (e.g. 2026.5.0, 2026.5.1, 2026.12.3)
#   - YYYY: 4-digit year
#   - M:    1- or 2-digit month, NO leading zero (5, not 05)
#   - PATCH: non-negative integer
#
# Behaviour:
#   - Requires a clean working tree.
#   - Requires the current branch to be `master`.
#   - Refuses if tag `praxio-v<calver>` already exists locally or on origin.
#   - Updates only electron/package.json (root package.json stays on Paperclip
#     versioning).
#   - Writes a CHANGELOG.md entry under the top-level `## Praxio` section. If
#     CHANGELOG.md does not exist, it is created with the canonical header.
#   - CHANGELOG entries are sourced from
#       git log <last-praxio-tag>..HEAD -- electron/ server/ ui/ packages/db/ \
#                                          scripts/electron* electron-builder.yml
#     Conventional-commit subjects are grouped (feat/fix/perf/refactor/docs/
#     build/chore/test); other subjects fall through to a "Changes" bucket.
#   - Commit message: `chore(praxio-release): praxio-v<calver>`
#   - Tag is annotated: `praxio-v<calver>` pointing at the release commit.
#   - --dry-run prints the planned version, CHANGELOG diff, commit message, and
#     tag name without modifying the working tree or git state.
#   - --push performs `git push origin master praxio-v<calver>`. Without it, the
#     caller is responsible for pushing (recommended for the first dry runs).
#
# Exit codes:
#   0 success (or dry-run preview)
#   1 usage error / validation failure / dirty tree / wrong branch / tag exists
#   2 internal error (git/jq/etc unavailable)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ELECTRON_PKG="$REPO_ROOT/electron/package.json"
CHANGELOG="$REPO_ROOT/CHANGELOG.md"
CHANGELOG_HEADER="# Changelog"
PRAXIO_SECTION_HEADER="## Praxio"
SCOPED_PATHS=(electron/ server/ ui/ packages/db/ electron-builder.yml)
SCOPED_GLOBS=(scripts/electron*)
TAG_PREFIX="praxio-v"
COMMIT_PREFIX="chore(praxio-release):"
DEFAULT_BRANCH="master"

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
}

fail() {
  printf 'praxio-release: %s\n' "$*" >&2
  exit 1
}

internal_fail() {
  printf 'praxio-release: internal: %s\n' "$*" >&2
  exit 2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || internal_fail "required command not found: $1"
}

# ---- arg parsing -------------------------------------------------------------

version=""
dry_run=false
do_push=false

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      dry_run=true
      ;;
    --push)
      do_push=true
      ;;
    --no-push)
      do_push=false
      ;;
    --*)
      fail "unknown flag: $1"
      ;;
    *)
      if [ -n "$version" ]; then
        fail "unexpected positional argument: $1 (version already set to $version)"
      fi
      version="$1"
      ;;
  esac
  shift
done

[ -n "$version" ] || { usage; exit 1; }

# ---- validation --------------------------------------------------------------

require_cmd git
require_cmd jq

# CalVer: YYYY.M.PATCH — month with no leading zero; year/month/patch sane.
if ! [[ "$version" =~ ^([0-9]{4})\.([1-9]|1[0-2])\.(0|[1-9][0-9]*)$ ]]; then
  fail "version '$version' is not valid CalVer YYYY.M.PATCH (e.g. 2026.5.0)"
fi

cd "$REPO_ROOT"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$DEFAULT_BRANCH" ]; then
  fail "must be on '$DEFAULT_BRANCH' branch (currently on '$current_branch')"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "working tree is dirty; commit or stash before releasing"
fi

if [ -n "$(git ls-files --others --exclude-standard)" ]; then
  fail "untracked files present; commit, ignore, or remove them before releasing"
fi

tag_name="${TAG_PREFIX}${version}"

if git rev-parse -q --verify "refs/tags/${tag_name}" >/dev/null; then
  fail "tag ${tag_name} already exists locally"
fi

# Check remote too — but only if we can reach origin without prompting. A
# transient network failure should not silently bypass the check.
if git ls-remote --exit-code --tags origin "refs/tags/${tag_name}" >/dev/null 2>&1; then
  fail "tag ${tag_name} already exists on origin"
fi

[ -f "$ELECTRON_PKG" ] || fail "missing $ELECTRON_PKG"

current_version="$(jq -r '.version' "$ELECTRON_PKG")"
if [ "$current_version" = "$version" ]; then
  fail "electron/package.json is already at $version — nothing to bump"
fi

# ---- CHANGELOG entry generation ---------------------------------------------

last_tag="$(git tag --list "${TAG_PREFIX}*" --sort=-v:refname | head -n1 || true)"

# Build the git log range. Empty range means "all history".
if [ -n "$last_tag" ]; then
  log_range="${last_tag}..HEAD"
else
  log_range="HEAD"
fi

# Collect pathspecs.
pathspecs=()
for p in "${SCOPED_PATHS[@]}"; do
  pathspecs+=("$p")
done
# Glob expansion (scripts/electron*) — let the shell expand against the working
# tree; git log accepts the literal paths just fine, missing paths are ignored.
shopt -s nullglob
for g in "${SCOPED_GLOBS[@]}"; do
  for match in $g; do
    pathspecs+=("$match")
  done
done
shopt -u nullglob

# Pull subjects (one per commit, scoped to Praxio paths). bash 3.2 (macOS
# system bash) has no mapfile, so read into an array manually.
subjects=()
while IFS= read -r line; do
  subjects+=("$line")
done < <(git log --no-merges --pretty=format:'%s' "$log_range" -- "${pathspecs[@]}" 2>/dev/null || true)

# Group by conventional-commit type.
declare -a feat_lines=()
declare -a fix_lines=()
declare -a perf_lines=()
declare -a refactor_lines=()
declare -a build_lines=()
declare -a docs_lines=()
declare -a test_lines=()
declare -a chore_lines=()
declare -a other_lines=()

cc_re='^([a-zA-Z]+)(\([^)]+\))?!?:[[:space:]]*(.+)$'
# bash 3.2 + set -u: empty arrays need the `${arr[@]+...}` guard.
for subj in ${subjects[@]+"${subjects[@]}"}; do
  [ -z "$subj" ] && continue
  if [[ "$subj" =~ $cc_re ]]; then
    type="${BASH_REMATCH[1]}"
    body="${BASH_REMATCH[3]}"
    type="$(printf '%s' "$type" | tr '[:upper:]' '[:lower:]')"
    case "$type" in
      feat)     feat_lines+=("$body") ;;
      fix)      fix_lines+=("$body") ;;
      perf)     perf_lines+=("$body") ;;
      refactor) refactor_lines+=("$body") ;;
      build)    build_lines+=("$body") ;;
      docs)     docs_lines+=("$body") ;;
      test)     test_lines+=("$body") ;;
      chore)    chore_lines+=("$body") ;;
      *)        other_lines+=("$subj") ;;
    esac
  else
    other_lines+=("$subj")
  fi
done

emit_group() {
  local heading="$1"
  shift
  if [ "$#" -eq 0 ]; then
    return 0
  fi
  printf '#### %s\n\n' "$heading"
  local line
  for line in "$@"; do
    printf -- '- %s\n' "$line"
  done
  printf '\n'
}

today_utc="$(date -u +%Y-%m-%d)"

entry="$(
  printf '### %s — %s\n\n' "$version" "$today_utc"
  if [ -n "$last_tag" ]; then
    printf '_Changes since %s._\n\n' "$last_tag"
  else
    printf '_Initial Praxio release._\n\n'
  fi
  total="${#subjects[@]}"
  if [ "$total" -eq 0 ]; then
    printf -- '- No code changes detected in Praxio-scoped paths since the last tag.\n\n'
  else
    # bash 3.2 + set -u: empty arrays cannot be expanded as "${arr[@]}", use
    # the `${arr[@]+...}` guard pattern.
    emit_group "Features"        ${feat_lines[@]+"${feat_lines[@]}"}
    emit_group "Fixes"           ${fix_lines[@]+"${fix_lines[@]}"}
    emit_group "Performance"     ${perf_lines[@]+"${perf_lines[@]}"}
    emit_group "Refactors"       ${refactor_lines[@]+"${refactor_lines[@]}"}
    emit_group "Build/Packaging" ${build_lines[@]+"${build_lines[@]}"}
    emit_group "Docs"            ${docs_lines[@]+"${docs_lines[@]}"}
    emit_group "Tests"           ${test_lines[@]+"${test_lines[@]}"}
    emit_group "Chores"          ${chore_lines[@]+"${chore_lines[@]}"}
    emit_group "Changes"         ${other_lines[@]+"${other_lines[@]}"}
  fi
)"

# ---- Compose new CHANGELOG.md ------------------------------------------------

if [ -f "$CHANGELOG" ]; then
  existing="$(cat "$CHANGELOG")"
else
  existing=""
fi

# Build the new file content. We keep a single `## Praxio` section near the top
# and prepend new entries inside it. Strategy:
#   - If file is missing: create `# Changelog\n\n## Praxio\n\n<entry>\n`.
#   - If `## Praxio` exists: insert <entry> immediately after that header line,
#     before any prior Praxio entries.
#   - If file exists but no `## Praxio` section: append a new `## Praxio`
#     section (with <entry>) after the top-level `# Changelog` header, or at
#     the top of the file if that header is missing too.

# Stash entry to a temp file so awk can pull it in without macOS awk choking
# on multi-line `-v` assignments.
entry_file="$(mktemp -t praxio-release-entry.XXXXXX)"
trap 'rm -f "$entry_file"' EXIT
printf '%s\n' "$entry" >"$entry_file"

new_changelog="$(
  if [ -z "$existing" ]; then
    printf '%s\n\n' "$CHANGELOG_HEADER"
    printf '%s\n\n' "$PRAXIO_SECTION_HEADER"
    printf '%s\n' "$entry"
  elif printf '%s\n' "$existing" | grep -qE "^${PRAXIO_SECTION_HEADER}[[:space:]]*$"; then
    awk -v entry_file="$entry_file" -v hdr="$PRAXIO_SECTION_HEADER" '
      function load_entry(   line, buf) {
        buf = ""
        while ((getline line < entry_file) > 0) {
          buf = buf line "\n"
        }
        close(entry_file)
        # Strip trailing newline so caller-added blank line is the only spacer.
        sub(/\n$/, "", buf)
        return buf
      }
      BEGIN { entry = load_entry(); inserted = 0 }
      {
        print $0
        if (!inserted && $0 == hdr) {
          print ""
          print entry
          inserted = 1
        }
      }
    ' "$CHANGELOG"
  else
    # No Praxio section yet. Insert one after the first `# Changelog` line if
    # present, otherwise prepend.
    if printf '%s\n' "$existing" | grep -qE '^# '; then
      awk -v entry_file="$entry_file" -v phdr="$PRAXIO_SECTION_HEADER" '
        function load_entry(   line, buf) {
          buf = ""
          while ((getline line < entry_file) > 0) {
            buf = buf line "\n"
          }
          close(entry_file)
          sub(/\n$/, "", buf)
          return buf
        }
        BEGIN { entry = load_entry(); inserted = 0 }
        {
          print $0
          if (!inserted && $0 ~ /^# /) {
            print ""
            print phdr
            print ""
            print entry
            inserted = 1
          }
        }
      ' "$CHANGELOG"
    else
      printf '%s\n\n' "$CHANGELOG_HEADER"
      printf '%s\n\n' "$PRAXIO_SECTION_HEADER"
      printf '%s\n\n' "$entry"
      printf '%s\n' "$existing"
    fi
  fi
)"

# ---- electron/package.json update --------------------------------------------

new_pkg="$(jq --arg v "$version" '.version = $v' "$ELECTRON_PKG")"

# ---- dry-run preview ---------------------------------------------------------

commit_msg="${COMMIT_PREFIX} ${tag_name}"

if $dry_run; then
  printf '== praxio-release dry-run ==\n'
  printf 'Current branch : %s\n' "$current_branch"
  printf 'Last tag       : %s\n' "${last_tag:-<none>}"
  printf 'New tag        : %s\n' "$tag_name"
  printf 'Version bump   : %s -> %s\n' "$current_version" "$version"
  printf 'Commit message : %s\n' "$commit_msg"
  printf 'Push           : %s\n' "$($do_push && echo yes || echo no)"
  printf '\n-- electron/package.json (new .version) --\n'
  printf '%s\n' "$new_pkg" | jq '{name,version,productName}'
  printf '\n-- CHANGELOG.md entry to be inserted --\n%s\n' "$entry"
  printf '\n-- Scoped commit subjects considered (%d) --\n' "${#subjects[@]}"
  if [ "${#subjects[@]}" -gt 0 ]; then
    printf -- '- %s\n' "${subjects[@]}"
  else
    printf '(none)\n'
  fi
  exit 0
fi

# ---- apply changes -----------------------------------------------------------

printf '%s\n' "$new_pkg" >"$ELECTRON_PKG"
printf '%s\n' "$new_changelog" >"$CHANGELOG"

git add -- "$ELECTRON_PKG" "$CHANGELOG"
git commit -m "$commit_msg" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>" >/dev/null
git tag -a "$tag_name" -m "Praxio release $version"

printf 'Created commit %s and tag %s\n' "$(git rev-parse --short HEAD)" "$tag_name"

if $do_push; then
  printf 'Pushing master and %s to origin...\n' "$tag_name"
  git push origin "$DEFAULT_BRANCH" "$tag_name"
  printf 'Pushed. Phase B-1 release workflow should be triggered by the tag.\n'
else
  printf '\nNot pushed (no --push). To trigger the release workflow:\n'
  printf '  git push origin %s %s\n' "$DEFAULT_BRANCH" "$tag_name"
fi
