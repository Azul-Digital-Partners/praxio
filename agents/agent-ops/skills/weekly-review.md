# /weekly-review — Weekly Agent Performance Review

**Trigger:** `/weekly-review` (Monday 9am cron or manual)

**Output:** Weekly review report with: session grade summary, budget status per agent, skill usage, recommendations

**Steps:**
1. Pull session grades from last 7 days — count by grade tier per agent
2. Pull budget consumption per agent — flag any above 80%
3. Identify agents with 0 sessions (idle agents eating budget)
4. Write report: ## Grade Summary, ## Budget Status, ## Recommendations
5. Post to Slack agent-ops channel
