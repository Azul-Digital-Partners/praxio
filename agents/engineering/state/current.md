# Engineering — Current State
Last updated: 2026-05-18

## Active Branch
`feat/praxio-ui`

## Worktrees

| Branch | Path | Status |
|---|---|---|
| `feat/today-view` | `.worktrees/feat-today-view` | Complete, awaiting merge |
| `feat/visible-rebrand` | `.worktrees/feat-visible-rebrand` | Complete, awaiting merge |

## What's Done (Phase 1 — Complete)
- Praxio fork from Paperclip, rebranded
- WAT framework scaffolded
- Drizzle schema: conversations, conversation_messages, session_grades, agent_presence (migration 0086)
- WebSocket server (live-events-ws.ts) — echo stub
- Conversation Thread UI (ConversationThread, Message, MessageInput)
- Agent Sidebar, Presence Indicators, Budget Strip
- Session Grading Panel (UI only — stub route)
- WAT Playbook Panel (UI only — static content)
- Dark/Light theme toggle with localStorage persistence
- E2E tests: conversation thread + right panel
- Agent configs scaffolded: Rosalind, Engineering, Marketing, Agent Ops

## Recent Additions (post-Phase 1, pre-Phase 2)
- NavRail: Approvals page wired with live pending badge (polling 30s)
- feat/today-view: Today command center, Rosalind locked-in, message tags (update/done/task/question/decision), migration 0087 (tag column)
- feat/visible-rebrand: Visible-only Paperclip→Praxio in 30 UI files — package names/env vars/keys untouched

## Active Work (Phase 2 — In Progress)
None started yet. Sequence agreed:
1. Conversation persistence — wire conversations + messages tables to API routes
2. Live agent integration — connect WS server to real Claude Code adapter execution
3. Streaming responses — pump agent output tokens to WS → ConversationThread
4. Grade → feedback loop — grades feed back as structured context next session
5. WAT playbook execution — make workflows/ steps executable, not just readable

## Open Technical Decisions
- How conversation history is chunked when passed as agent context (token limit strategy TBD)
- Whether streaming uses SSE or pure WebSocket (currently WS — keep or reconsider in Phase 2)

## Known Issues
- None blocking

## Sub-Agent Notes
Any sub-agents working under Engineering (e.g., QA, DevOps) write their session updates here, not to their own state file.
