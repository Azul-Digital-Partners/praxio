# /grade-review — Review Session Grades

**Trigger:** `/grade-review [agent name or all]`

**Output:** Grade distribution report with trend and recommendation

**Steps:**
1. Pull session grades for the specified agent (or all agents) — last 30 days
2. Calculate: grade distribution (%), trend (improving/declining/stable)
3. Flag agents with >30% major_rework or scrapped sessions
4. Write recommendations: more specific prompting, skill update, or retirement consideration
