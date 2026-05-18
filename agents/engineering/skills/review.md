# /review — Code Review

**Trigger:** `/review [file or PR link]`

**Input:** File path, diff, or PR URL

**Output:** Structured review with: summary of changes, issues (critical/minor), suggestions, approval status

**Steps:**
1. Read the full diff or file content
2. Check for: security issues (injection, auth, secrets), logic errors, test coverage gaps, naming clarity, YAGNI violations
3. Return structured markdown: ## Summary, ## Issues, ## Suggestions, ## Verdict (approve / request changes)
