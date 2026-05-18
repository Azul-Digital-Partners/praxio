# /branch — Branch Governance

**Trigger:** `/branch [action: list | status | merge-plan]`

**Output:** Branch status table or merge sequencing plan

**Steps:**
1. Run `git worktree list` to see active worktrees
2. Run `git branch -a` to see all branches
3. For each feature branch: check last commit, open items in state, migration status
4. For merge-plan: sequence merges in dependency order, flag conflicts likely, document any pre-merge checks
