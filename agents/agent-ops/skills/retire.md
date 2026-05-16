# /retire — Retire an Agent

**Trigger:** `/retire [agent name]`

**Output:** Agent paused, final grade report, archive created

**Steps:**
1. Pull agent's full session grade history — write a 1-paragraph performance summary
2. Check for any open/in-progress tasks assigned to this agent. Reassign if the task is actively in progress and has a natural successor agent. Close with a note if the task has been idle for more than 7 days or has no natural successor. Ask the operator before closing any task with external commitments attached.
3. **Confirm with operator before proceeding:** "About to archive {agent-name} and set status = retired in Praxio. This cannot be undone. Confirm?" Do not proceed until explicit confirmation is received.
4. Archive the agent's SKILL.md to `agents/{slug}/archive/`
5. Set agent status to retired in Praxio
6. Notify manager via Slack
