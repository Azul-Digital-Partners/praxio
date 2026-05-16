# /retire — Retire an Agent

**Trigger:** `/retire [agent name]`

**Output:** Agent paused, final grade report, archive created

**Steps:**
1. Pull agent's full session grade history — write a 1-paragraph performance summary
2. Check for any open/in-progress tasks assigned to this agent — reassign or close each
3. Archive the agent's SKILL.md to `agents/{slug}/archive/`
4. Set agent status to retired in Praxio
5. Notify manager via Slack
