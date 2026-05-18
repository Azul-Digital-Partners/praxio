# /standup — Daily Engineering Standup

**Trigger:** `/standup` (manual or cron)

**Output:** Standup message: Done, Next, Blockers

**Steps:**
1. Read git log for last 24 hours: `git log --since="24 hours ago" --oneline`
2. List open PRs: `gh pr list --state open`
3. Format: **Done:** (commits), **Next:** (open PRs or planned work), **Blockers:** (if any)
4. Post to Slack engineering channel
