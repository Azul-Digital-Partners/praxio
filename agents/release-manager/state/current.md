# Release Manager — Current State
Last updated: 2026-05-18

## Active Branches Tracking

| Branch | Status | Notes |
|---|---|---|
| `feat/praxio-ui` | In progress (Phase 2) | Main development branch |
| `feat/today-view` | Ready to merge | Today view + Approvals NavRail, tag-selector on MessageInput |
| `feat/visible-rebrand` | Ready to merge | 30-file visible-only Paperclip→Praxio rebrand |

## Recently Shipped

### feat/visible-rebrand (2026-05-18)
- Visible-only Paperclip→Praxio rebrand across 30 UI files
- Auth pages, error toasts, config descriptions, onboarding copy
- Package names, env vars, localStorage keys untouched

### Phase 1 (shipped prior)
- Conversation UI shell (ConversationThread, MessageInput, agent sidebar)
- Dark/light theme, budget strip, grading panel stub
- DB schema: conversations, messages, session_grades, agent_presence (migration 0086)
- WebSocket echo stub
- E2E tests

## Open Release Items

- [ ] Merge `feat/today-view` into `feat/praxio-ui` — requires manual approval
- [ ] Merge `feat/visible-rebrand` into `feat/praxio-ui` — requires manual approval
- [ ] Phase 2 work not started — no release scheduled
- [ ] Migration 0087 (tag column on conversation_messages) ships with feat/today-view

## Migration Log

| Migration | Branch | Status |
|---|---|---|
| 0086 — Praxio schema | feat/praxio-ui | Shipped |
| 0087 — message tag column | feat/today-view | Pending merge |

## Decisions

- Rebranding deferred to visible-only for now; package names and env vars change at external launch
- feat/today-view and feat/visible-rebrand developed in worktrees to avoid disrupting live usage
