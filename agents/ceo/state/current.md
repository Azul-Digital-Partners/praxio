# CEO Context — Current State
Last updated: 2026-05-18

## Company
- **Company:** Azul Digital LLC
- **Product:** Praxio — conversation-first AI team management platform
- **Fork origin:** Paperclip (all core task management features inherited and live)

## Active Priorities
1. Complete Praxio Phase 2 — backend wiring sprint (conversation persistence, live agent integration, streaming responses)
2. Agent team fully activated and running real work by end of Phase 2
3. Session grading feedback loop operational so agent quality is measurable

## Strategic Direction
- Praxio is the internal operating system for Azul Digital's AI team
- Conversation-first UX replaces the task-board-first Paperclip model
- WAT framework (Workflows, Agents, Tools) governs how agents operate
- Near-term: prove the model internally before any external positioning

## Active Initiatives
| Initiative | Owner | Status |
|---|---|---|
| Praxio Phase 2 (backend wiring) | Engineering | In progress |
| Agent team activation | Agent Ops | Scaffolded, pending Phase 2 |
| Session grading feedback loop | Engineering + Agent Ops | Phase 2 |
| WAT playbook execution | Engineering | Phase 2 |

## Agent Team
| Agent | Role | Status |
|---|---|---|
| Rosalind | Chief of Staff | Scaffolded |
| Engineering | Technical Lead | Scaffolded |
| Marketing | Creative Lead | Scaffolded |
| Agent Ops | Workforce Manager | Scaffolded |

## Key Decisions
- Phase 1 scope was UI shell only — no live agent execution until Phase 2
- Sub-agents (under directors) do not maintain their own state; they write to their manager's state
- Rosalind has read access to all agent state files
- Memory is agent-specific; Rosalind is the only cross-team context holder

## Flags
- None active

## How to Update This File
This file is updated by Rosalind at the end of any session involving strategic decisions, priority changes, or new initiatives. Direct reports may flag items for CEO context through Rosalind.
