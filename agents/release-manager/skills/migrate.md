# /migrate — Migration Checklist

**Trigger:** `/migrate [branch or migration file]`

**Output:** Pre-flight and post-flight migration checklist

**Steps:**
1. Read migration files in `packages/db/src/migrations/` for the branch
2. Identify: new tables, altered columns, dropped columns, index changes
3. For each change: write pre-flight check (backup, verify connection), migration step, rollback step
4. Flag any column drops or renames that require data migration before schema change
5. Note whether migration is zero-downtime or requires maintenance window
