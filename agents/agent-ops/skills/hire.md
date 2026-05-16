# /hire — Hire a New Agent

**Trigger:** `/hire [agent description and role]`

**Output:** New agent record created, SKILL.md drafted, /setup skill invoked

**Steps:**
1. Clarify: role, cadence, who they report to, what integrations they need
2. Draft SKILL.md with: Role, Context, Owns, Routes, Never Touch, System Access, Skills
3. Create `agents/{slug}/` directory with the SKILL.md
4. Invoke `/setup agent {slug}` to run through the 4Cs walkthrough and connection validation
5. Register in org chart
