# Rosalind — Current State
Last updated: 2026-05-18

## Role
Chief of Staff. Primary coordinator across the agent team. Reads all agent state files at session start.

## Active Work
- Praxio Phase 1 fully shipped (PR #1 merged to master)
- Phase 2 not yet started — Engineering on standby
- Two worktrees (feat-today-view, feat-visible-rebrand) built but not merged — fate TBD

## Open Items
- [ ] Decide fate of feat-today-view and feat-visible-rebrand worktrees (merge to master or abandon)
- [ ] Engineering to begin Phase 2: conversation persistence → live streaming → grading feedback loop
- [ ] Agent Ops to activate review cycle once Phase 2 grading is live
- [ ] Marketing has no active campaigns for Praxio — no ask pending

## Key Context
- Rosalind's full skill library lives in the CoS repo, not in agents/rosalind/skills/
- This state file is the primary coordination anchor — updated at every session end
- Cross-agent issues surface here before escalating to CEO context

## Decisions Made
- Phase 2 sprint sequence: conversation persistence → live agent integration → streaming → grading feedback loop
- All sub-agents (under directors) write to their manager's state, not their own
- Rebranding: visible-only now; package names + env vars deferred to external launch
- Release Manager added to team; reports to Engineering; Rosalind reads its state at session start
- Engineering work must route through Engineering + Release Manager agents, not executed directly
- /conversations page removed — Issues + Agent assignment is the primary human→agent workflow
- Strategic intent: Praxio is the operating environment for the agent team going forward — development work happens inside the app, not via external Claude Code sessions

## Flags / Blockers
- None active

## People Context
- Steven Christopher — CEO, Azul Digital. Works from conversation; prefers concise updates, no summaries of obvious things.
- Email: Outlook (work/primary), iCloud (personal). Do NOT assume Gmail.
