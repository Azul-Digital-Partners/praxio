# /release — Generate Release Notes

**Trigger:** `/release [branch or tag range]`

**Output:** Formatted release notes with sections: ## New Features, ## Improvements, ## Bug Fixes, ## Breaking Changes, ## Migration Steps

**Steps:**
1. Run `git log [base]..[head] --oneline` for the range
2. Categorize commits: `feat:` → New Features, `fix:` → Bug Fixes, `BREAKING CHANGE:` → Breaking Changes, refactor/style/perf → Improvements
3. Write user-facing descriptions — translate commit messages into plain English
4. Check for migration files in `packages/db/src/migrations/` — document any new migrations under Migration Steps
5. Flag any env var changes or deployment steps required
