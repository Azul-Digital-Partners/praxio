# Engineering — Current State
Last updated: 2026-05-18

## Active Branch
`master` (feat/praxio-ui merged via PR #1)

## Worktrees

| Branch | Path | Status |
|---|---|---|
| `feat/today-view` | `.worktrees/feat-today-view` | Complete — fate TBD (merge to master or abandon) |
| `feat/visible-rebrand` | `.worktrees/feat-visible-rebrand` | Complete — fate TBD (merge to master or abandon) |

## What's Shipped (master)
- Praxio fork from Paperclip, rebranded
- WAT framework scaffolded
- Drizzle schema: conversations, conversation_messages, session_grades, agent_presence (migration 0086)
- WebSocket server — live agent streaming (creates issue, wakes agent via heartbeat, streams log output)
- Conversation Thread UI components (built but /conversations route removed)
- Session Grading Panel and WAT Playbook Panel (UI only — backend stub)
- Dark/Light theme toggle in main Sidebar — persists to localStorage under `praxio.theme`
- E2E tests: conversation thread + right panel
- Agent configs: Rosalind, Engineering, Marketing, Agent Ops, Release Manager, CEO (scaffold)
- Release Manager agent: SKILL.md + branch/migrate/release/announce skills
- Skills: draft-only-email-guard, head-of-marketing
- Docs: Build-CoS.md, feature-roadmap.html, Praxio wireframes PDF

## Strategic Direction
- Steven's intent: use Praxio (the app) as the primary workspace for directing agents, not external Claude Code sessions
- Issues + Agent assignment is the primary human→agent workflow
- /conversations page removed — Issues covers that need

## Phase 2 Sequence (not yet started)
1. Conversation persistence — wire conversations + conversation_messages to API routes
2. Live agent integration — connect WS to real Claude Code adapter execution
3. Streaming responses — pump agent output tokens to WS → ConversationThread
4. Grade → feedback loop — grades feed back as structured context next session
5. WAT playbook execution — make workflows/ steps executable, not just readable

## Open Technical Decisions
- How conversation history is chunked when passed as agent context (token limit strategy TBD)
- Whether streaming uses SSE or pure WebSocket (currently WS — keep or reconsider in Phase 2)
- Fate of feat-today-view and feat-visible-rebrand worktrees

## Known Issues
- None blocking

## Sub-Agent Notes
Any sub-agents working under Engineering write their session updates here, not to their own state file.
