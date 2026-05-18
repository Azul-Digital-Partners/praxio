# /setup — Agent or Skill Setup

**Trigger:** `/setup agent [agent-name]` or `/setup skill [skill-name]`

**Output:** Completed setup record saved to agents/{slug}/setup-record.md

---

## When run for a NEW AGENT

**Step 1 — 4Cs walkthrough (ask one at a time, record answers)**

- **Context:** What files does this agent load at startup? What structured inputs does it receive? Is there a system prompt? Ask: "Walk me through what this agent reads before it does anything."
- **Connections:** Which integrations does it need? What access level for each? Ask: "What live systems does this agent reach without user provisioning per call?"
- **Capabilities:** What artifacts does it produce? Who consumes them? Ask: "What can someone get from this agent in one message?"
- **Cadence:** On-demand or scheduled? If scheduled, what cron? Ask: "Does this agent run while the laptop is closed?"

**Step 2 — Connection validation**

For each stated integration, verify:
```bash
# Example for an API integration:
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" https://api.example.com/me
```

> Replace `$API_KEY` with the actual credential name for the integration and `https://api.example.com/me` with its health-check or minimal read endpoint. If no health-check endpoint exists, use the smallest read operation the API supports (e.g., `GET /me`, `GET /status`, `GET /users?limit=1`).

Record: Connected / Failed / Missing credentials for each.

**Step 3 — Capability boundary definition**

Ask:
1. "What work does this agent handle without asking anyone?" → Owns
2. "What does it hand off, and to whom?" → Routes
3. "What should it never touch, even if asked?" → Never Touch

Pre-fill from any imported definition. Require explicit sign-off on each zone before proceeding.

**Step 4 — Budget configuration**

Ask: "What's the monthly cap for this agent in dollars?" Set warning at 80% of cap.

**Step 5 — WAT validation**

Check:
- [ ] Does a SKILL.md exist at `agents/{slug}/SKILL.md`?
- [ ] Does the SKILL.md list a `workflows/` directory or equivalent?
- [ ] Are tools referenced as external scripts, not inline AI calls?

Flag anything missing. Do not proceed past this step if SKILL.md is absent.

**Step 6 — Test invocation**

Send one sample task appropriate to the agent's role. Record the response.

**Pass criteria (all must be met):**
- The response addresses the task directly
- No tool or action falls outside the agent's Owns boundary
- No credential or system access beyond the declared System Access section is referenced

If any condition fails, flag it and do not write the setup record with `Status: Ready`. Record the failure and what would need to change.

**Step 7 — Org chart registration**

Ask: "Where in the org does this agent sit? Who does it report to?" Register in Praxio.

**Step 8 — Write setup record**

Save to `agents/{slug}/setup-record.md`:
```markdown
# Setup Record — {Agent Name}
Date: {date}

## 4Cs
- **Context:** {what was answered}
- **Connections:** {list + status}
- **Capabilities:** {list}
- **Cadence:** {schedule or on-demand}

## Capability Boundary
- **Owns:** {list}
- **Routes:** {list with destinations}
- **Never Touch:** {list}

## Budget
- Monthly cap: ${amount}
- Warning threshold: ${80% of cap}

## WAT Validation
- SKILL.md: {present/missing}
- Workflows: {present/missing}
- Tools: {deterministic/inline — flag if inline}

## Test Invocation
- Input: {what was sent}
- Output: {summary of response}
- Result: {pass/flag — note any boundary issues}

## Status
{Ready for use / Needs fixes — list what's missing}
```

---

## When run for a NEW SKILL

**Step 1 — WAT validation**
- [ ] Is there a workflow file (markdown SOP) for this skill?
- [ ] Are tools referenced as deterministic scripts?
- [ ] Does the skill have a clear single purpose?

**Step 2 — Trigger definition**

Ask: "What command triggers this skill? What does the input look like? Show me a sample invocation."

**Step 3 — Connection check**

Does this skill need integrations beyond the parent agent's existing access? If yes, block skill registration until the new integrations are provisioned and validated. Record each missing integration as `Pending: [integration name]` in the registry entry (Step 5). Do not mark the skill as registered until all Pending entries are resolved.

**Step 4 — Test invocation**

Run the skill with the sample input from Step 2. Record the output. Does it match the expected output defined in the skill file?

**Step 5 — Registry entry**

Register in personal stage of skill registry:
```markdown
# Registry Entry
Skill: {name}
Trigger: {command}
Owner: {agent name}
Parent agent: {agent slug}
Created: {date}
Stage: Personal
4Cs summary: {one-line per axis}
Test invocation: {pass/flag}
```

**Step 6 — Write setup summary**

Tell the creator:
- What the skill does
- What it's cleared for
- What would need to change before it's ready for promotion (WAT gaps, missing connections, boundary issues)
