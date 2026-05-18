# Rosalind — Current State
Last updated: 2026-05-18

## Role
Chief of Staff. Primary coordinator across the agent team. Reads all agent state files at session start.

## Active Work
- Praxio Phase 1 complete — conversation UI shell shipped, Phase 2 backend wiring not yet started
- Two worktree branches ready to merge: `feat/today-view` and `feat/visible-rebrand`
- Release Manager agent scaffolded and wired into team structure

## Open Items
- [ ] Merge `feat/today-view` into `feat/praxio-ui` (Today view + Approvals NavRail + message tags + migration 0087)
- [ ] Merge `feat/visible-rebrand` into `feat/praxio-ui` (30-file visible Paperclip→Praxio rebrand)
- [ ] Engineering to begin Phase 2: conversation persistence → live agent integration → streaming
- [ ] Agent Ops to activate full agent review cycle once grading is live
- [ ] Marketing has no active campaigns for Praxio yet — no ask pending

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

## Flags / Blockers
- None active

## People Context
- Steven Christopher — CEO, Azul Digital. Works from conversation; prefers concise updates, no summaries of obvious things.
- Email: Outlook (work/primary), iCloud (personal). Do NOT assume Gmail. Updated 2026-05-18.
