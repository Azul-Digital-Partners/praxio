# /release — Release Notes

**Trigger:** `/release [tag range or PR list]`

**Output:** Release notes in: ## New Features, ## Bug Fixes, ## Breaking Changes, ## Migration Steps

**Steps:**
1. Read commits or PRs in the range
2. Categorize: features (feat:), fixes (fix:), breaking (BREAKING CHANGE:)
3. Write user-facing descriptions — not commit messages verbatim
4. Flag any migration steps required
