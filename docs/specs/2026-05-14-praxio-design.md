# Praxio — Product Design Spec

**Date:** 2026-05-14  
**Status:** Approved — implementation plan active  
**Plan:** [Phase 1 Foundation](../plans/2026-05-14-praxio-phase1-foundation.md)  
**Author:** Steven Christopher / Claude brainstorming session  
**Reference:** [Feature Roadmap](../feature-roadmap.html)

---

## 1. What Is Praxio

Praxio is a governed organizational operating system for AI workforces. It answers the question every growing AI-enabled team faces: "We have agents and skills being created everywhere — how do we manage what's approved, what's available, and who should use what?"

Praxio is built as a fork of [Paperclip](https://github.com/paperclipai/paperclip) (MIT license), keeping its entire backend infrastructure while replacing the frontend with a conversation-first interface and adding a capability governance layer that Paperclip has no concept of.

**The one-sentence product story:** Paperclip gives you the tools to build an AI company. Praxio gives you a working AI company — governed, discoverable, and structured so it stays intentional as it grows.

---

## 2. Name & Branding

**Product name:** Praxio  
**Origin:** From *praxis* (action, practice — as distinguished from theory). Built for doing, not planning.  
**Logo:** i7n wordmark  
**Primary color:** `#0D9488` (teal)  
**Secondary color:** `#4338CA` (indigo)  
**Nav gradient:** `linear-gradient(135deg, #0D9488, #4338CA)`  
**Themes:** Dark and light, both using i7n palette. User-selectable per account.

---

## 3. Agent Design Methodology

Every agent in Praxio is designed and evaluated using two frameworks. These are not optional — they are the standard lenses for any new agent, significant agent change, or workforce review.

### 3.1 WAT Framework (How Agents Are Built)

WAT separates concerns so that probabilistic AI handles reasoning while deterministic code handles execution. That separation is what makes agents reliable.

| Layer | What It Is | Where It Lives |
|---|---|---|
| **Workflows** | Markdown SOPs defining the objective, required inputs, which tools to call, expected outputs, and edge case handling | `workflows/` directory, linked from agent's playbook |
| **Agents** | The decision-maker. Reads the workflow, runs tools in sequence, handles failures, asks clarifying questions. Never tries to do execution itself. | SKILL.md or CLAUDE.md — the agent's operating manual |
| **Tools** | Deterministic scripts that do the actual work: API calls, data transforms, file operations, database queries | `tools/` directory — consistent, testable, fast |

**Why this matters:** When AI handles every step directly, accuracy compounds down. Five steps at 90% accuracy each = 59% end-to-end success. Offloading execution to deterministic tools keeps agents focused on orchestration and decision-making where they excel.

In Praxio, the WAT layer is visible: each agent's playbook (SKILL.md) is one click from their conversation view. Agents are hired with a playbook. The playbook is version-controlled in git. Praxio displays it read-only — it is edited in the repo.

### 3.2 4Cs Framework (How Agents Are Evaluated)

Every agent design decision — new hire, major skill change, workflow restructure — is evaluated against four axes. This is the standard comparison frame. Other considerations (cost, complexity, speed) are side notes; the 4Cs are primary.

| Axis | The Question | Why It Matters |
|---|---|---|
| **Context** | What does the agent know? What's loaded in its prompt, what files does it read, is input structured or raw? | Agents with shallow context produce shallow output. Defines the quality ceiling. |
| **Connections** | What live data can it reach without explicit user provisioning per call? SSH, APIs, filesystem, integrations — and which artifact owns each connection? | Determines what the agent can act on autonomously without human hand-holding. |
| **Capabilities** | What multistep artifacts does it produce from a short trigger? Reports, JSON ledgers, PRs, database rows — and what downstream systems consume them? | Defines the actual value delivered per invocation. |
| **Cadence** | When does it act autonomously while the laptop is closed? Cron / scheduled / remote trigger vs. on-demand only? | The most differentiating axis. Most agent designs only work when Claude is running — that's usually wrong for monitoring, reporting, or watcher-style work. |

**In Praxio:** The 4Cs map directly to the agent card. Context → playbook and system access. Connections → system access definitions. Capabilities → owned tasks in the capability boundary. Cadence → heartbeat schedule. When reviewing a skill promotion, the 4Cs are the evaluation checklist.

---

## 4. Core Problems Praxio Solves

### 4.1 The org structure doesn't stay intentional as AI capabilities grow

Teams pull down skills, build agents, and experiment. Without governance, the org becomes a pile of agents nobody manages and capabilities nobody can find. Praxio provides a structured path from personal experiment to org-approved resource.

### 4.2 Interaction feels like leaving a voicemail

Slack-style async interaction — post and wait — doesn't match how people think when working with AI. Praxio makes agent interaction feel like a real-time conversation with a colleague, not a ticketing system.

### 4.3 Higher-level agents get bogged down in work they should delegate

Without capability boundaries, agents either over-reach (attempt work outside their domain) or under-reach (refuse to help when they could route). Praxio defines what each agent owns, what it routes, and what it can never touch — enforced at runtime.

### 4.4 No way to know if agents are worth keeping

Paperclip tracks task completion. Praxio tracks whether the work was actually good and calculates the dollar value of what was saved. Performance is measured, not assumed.

### 4.5 Subscription economics get destroyed by infrastructure

Running agents through API keys at scale is prohibitively expensive. Praxio supports running agents on a Claude or ChatGPT subscription rather than paying per-token. Per-agent setting. Clients bring their own subscription.

---

## 5. What We Inherit From Paperclip (Free)

Praxio forks Paperclip's full backend. Nothing is lost. The following features are inherited at no build cost:

| Feature | Notes |
|---|---|
| Org chart with hierarchy | Agents with titles, roles, reporting lines |
| Goal alignment | Tasks trace back to company mission |
| Multi-company support | Full data isolation per company |
| Agent status lifecycle | Testing → Active → Retired |
| Heartbeats + scheduled routines | First-class cron scheduling |
| Any agent, any runtime | Claude Code, OpenClaw, Codex, Cursor, Bash, HTTP |
| Delegation through org chart | Work flows up and down automatically |
| Atomic execution | Prevents double-work |
| Monthly budget caps per agent | Warning at 80%, auto-pause at 100% |
| Cost tracking per agent/task/goal | Full cost breakdown |
| Hire / pause / retire controls | Board-level approval for hiring |
| Immutable audit log | Every tool call and decision, tamper-proof |
| Strategy review + override | Review before execution, override without terminating |
| Agent reviews + approvals | Explicit approval stages with audit trails |
| Skills Manager (base) | Foundation for Praxio's registry |
| Company export / import | Entire org as portable template — fully preserved |
| Plugin system + MCP server | Thin core, rich edges |
| AGENTS.md configuration | Repo-native agent setup |

---

## 6. What Praxio Adds

Praxio builds 25 net-new features across seven categories. None of these exist in Paperclip.

| Category | Feature | Description |
|---|---|---|
| **Onboarding** | Base agent workforce | Four pre-configured agents (Rosalind, Engineering, Marketing, Agent Ops) deploy on setup with playbooks, boundaries, and routing pre-wired — working AI workforce on day one |
| **Interaction** | Conversation-first UI | Per-agent chat threads with real-time streaming responses — no ticket creation flow |
| **Interaction** | Agent presence indicators | Live / idle / busy status in the sidebar updated in real time |
| **Interaction** | Routing notifications | Inline banners when work is silently routed to another agent, with link to receiving thread |
| **Interaction** | Dark / light themes | i7n teal/indigo palette in both modes, user-selectable per account |
| **Interaction** | Ambient budget strip | Budget remaining visible in the sidebar while conversations are active |
| **Capability Governance** | Capability boundaries | Per-agent Owns / Routes / Never Touch zones defined at hire time |
| **Capability Governance** | Smart routing engine | Intercepts out-of-boundary requests at tool call time and routes silently to the correct agent |
| **Capability Governance** | System access control | Explicit read / write / none access per agent per connected system, editable by reporting lead only |
| **Skill Registry** | Personal / Team / Org levels | Three-tier visibility and delegation model — personal experiments never touch the org until promoted |
| **Skill Registry** | Submission workflow | Lightweight submission: description, placement, boundary; usage history and cost-per-run auto-populated from session logs |
| **Skill Registry** | Functional review routing | Routes to functional lead in the receiving domain; 72-hour SLA; auto-escalates to Steven if no response |
| **Skill Registry** | Decision gate | Four outcomes: approve-to-team, approve-to-org, request changes, stay personal |
| **Skill Registry** | Agent import & optimization review | Import any agent from GitHub, Paperclip, or another Praxio org; runs 4Cs + WAT fit check and "make it yours" wizard before landing in personal stage |
| **Skill Registry** | Duplication detection | Surfaces skills with similar names, descriptions, or capability definitions at submission and review time |
| **Skill Registry** | Living governance | Upgrade path (30-day performance gate), demotion triggers (60-day inactivity or three consecutive poor grades), forking from org back to personal |
| **Cost & Budget** | Subscription adapter | Agents run against a Claude Code or ChatGPT flat-rate subscription instead of API key — per-agent setting, client brings their own subscription |
| **Cost & Budget** | Subscription value tracking | Tracks estimated value consumed in subscription mode (time × blended rate) so ROI model stays consistent across execution modes |
| **Performance** | Inline session grading | Accepted / Minor edits / Major rework / Scrapped — graded at conversation end; surfaces in weekly review if skipped for 7+ days |
| **Performance** | Value calculation | Time saved × blended hourly rate ($250/hr default) → dollar value and net ROI per session |
| **Performance** | ROI dashboard | Per-agent: total cost, time saved, dollar value, net ROI, grade distribution, week-over-week trend |
| **Performance** | Weekly review flow | Monday review UI: low-grade sessions, budget overruns, grade-trend degradations, hire / retire / update recommendations |
| **Design Methodology** | WAT workflow layer | One-click access to each agent's markdown SOP playbook from their conversation view; version-controlled in git; displayed read-only in UI |
| **Design Methodology** | 4Cs evaluation frame | Context / Connections / Capabilities / Cadence surfaced on the agent card and used as the evaluation checklist in skill promotion reviews |
| **Portability** | Obsidian plugin | Syncs agent sessions, org context, and notes to a local Obsidian vault as markdown files (Phase 3) |
| **Portability** | Notion plugin | Syncs agent roster, tasks, and session data to Notion databases for clients who manage work in Notion (Phase 3) |

---

## 7. Base Agent Workforce

Praxio ships with four pre-configured agents that deploy on org setup. These are not blank templates — each comes with a WAT-structured playbook, defined capability boundaries, system access defaults, and pre-wired routing relationships between the four agents. A new org gets a working AI workforce on day one.

| Agent | Role | Owns | Default Cadence |
|---|---|---|---|
| **Rosalind** | Chief of Staff | Scheduling, morning briefs, client comms drafts, task tracking, people context, commitments tracking | Daily morning brief (cron 7am); event-driven for captures and urgent messages |
| **Engineering** | Technical Lead | Code review, PR drafts, technical specs, debugging, architecture questions | On-demand; optional daily standup cron |
| **Marketing** | Creative Lead | Copy, content drafts, social posts, brand review, campaign briefs | On-demand |
| **Agent Ops** | Workforce Manager | Agent management, skill registry oversight, grade reviews, hire/retire recommendations | Weekly review (Monday cron); on-demand for workforce decisions |

**Rosalind is already built.** Her configuration exists in the CoS repo and is production-ready today:
- **Behavior rules:** meeting prep, conversation capture, follow-through, drift detection, senior-touch cadence, life integration
- **Integrations:** Notion (rw), HubSpot (read), Outlook email + calendar (rw), Gmail (read), iCloud family calendar (read), Slack bot (rw), Obsidian vault (read)
- **Skills library:** 20+ skills including `/morning`, `/update`, `/capture`, `/brief`, `/done`, `/ppp`, `/cs-standup`, `/deals`, `/health`, and more
- **State management:** `state/current.md`, `state/last-session.md`, people files, decisions log, commitments tracker

Phase 1 ports Rosalind's existing configuration into Praxio. She is not built from scratch — she is migrated. Engineering, Marketing, and Agent Ops are new builds patterned after her.

**Engineering generic skills (ships with):**
`/review` — code review on a PR, file, or diff  
`/spec` — write a technical spec from a description or requirements  
`/debug` — structured debug walkthrough for a reported issue  
`/pr` — draft a PR description from a diff or implementation summary  
`/arch` — architecture question or system design recommendation  
`/test` — write test cases for a function, feature, or scenario  
`/standup` — daily engineering standup report (what's done, what's next, blockers)  
`/release` — release notes from a changelog, PR list, or commit range

**Marketing generic skills (ships with):**
`/draft` — draft copy from a brief, goal, or rough notes  
`/brief` — create a content brief from a campaign goal or audience description  
`/review` — review copy for brand voice, clarity, and tone  
`/social` — draft social posts from long-form content or a topic  
`/email` — draft a marketing or nurture email from a goal and audience  
`/repurpose` — repurpose long-form content into short-form formats (posts, snippets, headlines)  
`/campaign` — outline a campaign structure (goal, channels, messages, sequence) from a brief

### The `/setup` Skill

Every agent and every new skill runs `/setup` before going active. This is not optional — it is the gate between "created" and "operational." The same skill runs in both contexts; the questions it asks adapt to whether it's configuring an agent or a skill.

**When run for a new agent:**

| Step | What Happens |
|---|---|
| 4Cs walkthrough | Prompts through Context (what files, prompts, and structured inputs the agent loads), Connections (which integrations to wire and what access level), Capabilities (owned outputs and artifacts), and Cadence (on-demand or scheduled — and if scheduled, the exact cron) |
| Connection validation | Tests each wired integration — confirms API keys resolve, endpoints respond, permissions are sufficient |
| Capability boundary definition | Walks through Owns / Routes / Never Touch; pre-fills from any imported definition or template; requires explicit sign-off |
| Budget configuration | Sets monthly cap and warning threshold |
| WAT validation | Confirms the agent has a linked SKILL.md playbook; flags if workflows or tools are missing |
| Test invocation | Fires a sample task and checks the response for coherence |
| Org chart registration | Places the agent at the correct position in the hierarchy with reporting line confirmed |
| Setup summary | Produces a structured report: what's configured, what's missing, what the agent is cleared for |

**When run for a new skill implementation:**

| Step | What Happens |
|---|---|
| WAT validation | Confirms the skill has a workflow file (markdown SOP); checks that tools are deterministic scripts, not inline AI calls |
| Trigger definition | Sets the skill command, expected input format, and sample invocation |
| Connection check | Identifies any integrations the skill needs beyond the parent agent's existing access; flags gaps |
| Test invocation | Runs the skill against a sample input and reviews output for correctness |
| Registry entry | Registers the skill in the personal stage of the registry with auto-populated metadata (trigger, owner, parent agent, creation date, 4Cs summary) |
| Setup summary | What the skill does, what it's cleared for, and what would need to change before it's ready for promotion |

**Result:** No agent and no skill goes active without a completed setup record. Setup output is attached to the agent/skill card and visible in Praxio. The setup record is the starting point for any future promotion review.

**Pre-wired routing:** Rosalind routes code work to Engineering, copy and content to Marketing, and agent management decisions to Agent Ops. The four agents are aware of each other at deploy time — routing is configured, not discovered.

**Onboarding customization for new orgs:** During first setup, Praxio walks through each base agent to connect real accounts (calendar, email, Slack, CRM), adjust capability boundaries for the org's context, and rename agents to match the org's language. The defaults are a starting point — every org will customize them.

**Not the only agents:** The four base agents are the minimum viable workforce. Orgs add more through the standard hire flow. The base agents are simply the ones Praxio guarantees are pre-built, tested, and ready.

**Template foundation:** In Phase 3, orgs can export their customized base workforce as a Praxio marketplace template. Other orgs buy a starting point, not a blank canvas.

---

## 8. Architecture

### 8.1 Approach: Fork & Reshape

Praxio uses Paperclip's entire backend (TypeScript, Postgres, heartbeat engine, adapter system, audit log) and replaces the frontend with a new conversation-first React UI.

**What we keep:** All Paperclip backend packages (`server/`, `packages/db`, `packages/adapters`, `packages/shared`, `packages/mcp-server`)  
**What we replace:** Paperclip's ticket-based React frontend  
**What we add:** Conversation UI, capability boundary system, skill registry, promotion workflow, grading system, subscription adapter

### 8.2 Tech Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript (Node.js) — Paperclip fork |
| Database | PostgreSQL — Paperclip schema extended |
| Frontend | React — new build, not Paperclip's UI |
| Real-time | WebSockets — streaming agent responses |
| Agent adapters | Paperclip adapter system + Praxio subscription adapter |
| Plugins | Paperclip plugin system |

### 8.3 Why Not Build Fresh

Paperclip has 65k+ GitHub stars, active maintenance, a working heartbeat engine, a budget system, an adapter system for every major agent runtime, and an audit log. Rebuilding any of this from scratch would take months and produce an inferior result. The backend is the right foundation; the UX is what we replace.

### 8.4 Fork Maintenance

Upstream Paperclip changes to the backend can be merged selectively. Frontend changes from Paperclip are not relevant — we own that layer. The fork cost is manageable because the split is clean: their backend, our frontend.

---

## 9. The Conversation-First UI

### 9.1 Mental Model

Praxio interaction should feel like VS Code / Claude Code — a real-time conversation with a colleague in the room, not a Slack post you wait for a reply to. The latency may be identical; the *presence* is completely different.

### 9.2 Layout

- **Nav rail (left, 56px):** i7n gradient, icon navigation (Conversations, Org Chart, Registry, Analytics), user avatar
- **Agent sidebar (220px):** Agent list grouped by Active/Idle, presence indicators, budget summary strip
- **Main chat area:** Per-agent conversation thread, streaming responses, routing notifications
- **Right panel (220px):** Agent details — capability summary, system access, this-month ROI, session grading

### 9.3 Key Interaction Principles

- **A message is a task.** No separate ticket creation flow. Send a message → task is created in the backend automatically.
- **Redirect mid-task.** Change direction in the conversation. The agent adapts without needing a new ticket.
- **Routing is invisible.** When an agent routes work to a peer, it says so in the conversation and a quiet indigo banner appears. You can follow it or ignore it.
- **Budget is ambient.** Budget remaining is visible in the sidebar while you work, not buried in a dashboard.

### 9.4 Themes

Both dark and light themes use the i7n teal/indigo palette. User-selectable. Dark is the default for power users; light is preferred for client-facing deployments.

---

## 10. Capability Boundaries

Every agent in Praxio has three defined zones:

### 10.1 Owns Directly
Work the agent handles without asking anyone. Defined at hire time, editable by the agent's reporting lead.

### 10.2 Routes To
When an agent receives a request outside its owned domain, Praxio:
1. Intercepts the intended tool call
2. Identifies the correct agent from the org chart
3. Routes the task automatically
4. Posts an inline notification in the originating conversation: "Rosalind routed **auth module scope** → Engineering · 9:14am"
5. Links the receiving agent's thread back to the original conversation

This is a **notification model, not a block model.** Work keeps moving. The human is informed but not interrupted.

### 10.3 Never Touch
Hard access restrictions at the system level. If an agent attempts to call a tool in a system it has no access to, the call is blocked, logged to the audit trail, and the agent is instructed to route instead.

### 10.4 System Access
Each agent has explicit read/write/none access to every connected system. Defined in the agent's capability card. Editable only by the agent's reporting lead or Steven.

**Example — Rosalind (Chief of Staff):**

| Zone | Items |
|---|---|
| Owns | Scheduling, morning briefs, client comms drafts, task tracking, status updates |
| Routes | Code → Engineering, copy → Marketing, agent management → Steven, workforce health → Agent Ops |
| Never Touch | Git repositories, billing/budget caps, agent SKILL.md files, external email without review |
| Systems | Calendar (rw), Email drafts (rw), Notion (rw), HubSpot (read), Slack (read) |

### 10.5 Enforcement Timing

- **At task assignment:** Praxio checks if the requesting agent has permission to assign this type of work. Out-of-boundary requests are re-routed before the receiving agent sees them.
- **At tool call time:** If an agent tries to call a tool outside its allowed systems, the call is blocked, logged, and the agent receives routing instructions.
- **At skill promotion:** When a new skill is promoted into the org, its capability boundary is defined as part of the approval. It cannot operate outside that boundary until the boundary is explicitly updated.

---

## 11. Skill Registry & Promotion

This is the category where Praxio is most differentiated from Paperclip. Paperclip has no concept of governing how new capabilities enter the org.

### 11.1 The Problem

As teams grow and start pulling down skills or building new agents, there is no system for deciding:
- Is this personal, team-level, or org-level?
- Does something like this already exist?
- Where does it fit in the hierarchy?
- Who is accountable for it?

Without governance, the org becomes a pile of ungoverned capabilities nobody manages.

### 11.2 The Three Levels

| Level | Visibility | Delegation | Budget |
|---|---|---|---|
| **Personal** | Creator only | Not reachable by org | Creator's personal budget |
| **Team** | Team members only | Reachable within the team | Team budget sub-allocation |
| **Org** | All agents | Reachable by any agent above it in the hierarchy | Own budget cap with owner |

### 11.3 The Promotion Flow

**Stage 1 — Personal / Experimental**  
Skill runs `/setup` on creation. Setup produces a WAT validation, trigger definition, connection check, test invocation, and registry entry. Only after `/setup` completes does the skill appear in the personal workspace. Zero org visibility, zero risk. Creator uses it themselves. Budget counts against their personal allocation.

**Stage 2 — Submission**  
Creator submits to the registry. Praxio auto-populates session logs, usage frequency, cost-per-run, and success rate from history. Creator provides: description, problem it solves, suggested org placement, and suggested capability boundary. Lightweight — not a bureaucratic form.

**Stage 3 — Functional Review**  
Routes to the functional lead of the area the skill would report to (Engineering reviews code skills, Marketing reviews content skills). Reviewer evaluates: fit, placement, duplication, boundary definition, budget. Praxio surfaces similar existing skills for the reviewer to compare. 72-hour SLA; auto-escalates to Steven if no response.

**Stage 4 — Decision (four outcomes)**

| Decision | Meaning |
|---|---|
| Approve to team | Available within the reviewing team. Lower risk first step for narrow skills. |
| Approve to org | Added to org-wide registry. Gets budget cap, owner, capability boundary. |
| Request changes | Returns to personal stage. Creator improves and resubmits. |
| Stay personal | Useful for creator but not org material. No penalty. |

**Stage 5 — Integration**  
Approved skills get: position in org chart, owner, budget cap, capability boundary, audit logging, and discoverability by agents above them. Performance tracking begins from first call.

**Stage 6 — Living Governance**

- **Upgrade:** Team-level skill can re-submit for org-level after 30 days of strong grades.
- **Demotion:** Consistent poor grades or 60 days without usage triggers a demotion review.
- **Forking:** Any agent can fork an org-level skill back to personal to experiment without affecting the org version.
- **Owner accountability:** Owner is notified when the skill receives poor grades. Three consecutive poor grades triggers a demotion review automatically.

### 11.4 Agent Import & Optimization Review

When an agent is imported from outside the org — a GitHub repo, another Praxio org, a Paperclip export, or a community template — Praxio doesn't copy the files and leave them ungoverned. It runs an optimization review before the agent enters the personal workspace, so nothing unreviewed silently joins the workforce.

**Import sources:**

| Source | What Praxio Reads |
|---|---|
| GitHub repo URL | AGENTS.md, SKILL.md, CLAUDE.md — any standard agent definition file |
| Paperclip company export | Full agent definition from Paperclip's export format |
| Another Praxio org export | Agent definition + capability boundary + usage history |
| Raw agent file | .json or .md agent definition |

**Optimization review — what Praxio checks:**

| Check | What It Looks For |
|---|---|
| WAT structure | Is there a workflow (markdown SOP)? Are tools defined separately from reasoning? Does the agent act as a decision-maker or try to do everything itself? |
| 4Cs completeness | Context: system prompt defined? Connections: integrations specified? Capabilities: owned outputs defined? Cadence: scheduled or on-demand only? |
| Capability boundary | Are Owns / Routes / Never Touch zones defined, or is the boundary open-ended? |
| Org fit | Does this duplicate an agent or skill already in the org? Does it reference systems not connected here? |
| Cost posture | Is an API or subscription mode specified? Is there a budget estimate? |

Praxio produces a **fit report**: what's well-defined and can be used as-is, what needs customization for this org, what's missing and required before the agent can be promoted.

**"Make It Yours" wizard:**

After the review, Praxio walks the user through three steps:

1. **Rename & describe** — set the name and role description in this org's language
2. **Wire connections** — map the imported agent's required integrations to this org's connected systems (e.g., "this agent expects a CRM → map it to HubSpot")
3. **Set boundaries** — review and confirm the capability boundary; Praxio pre-fills from the import but requires explicit sign-off before the agent can route

Once the wizard completes, the agent lands in Stage 1 (Personal) with full import provenance attached (source URL or file, import date, optimization review results, customization audit trail). From there, the standard promotion flow applies.

### 11.5 Duplication Detection

At submission and review time, Praxio surfaces skills in the registry with similar names, descriptions, or capability definitions. This prevents the org from accumulating five different "summarize a meeting" skills.

---

## 12. Subscription Adapter

### 12.1 The Problem

Paperclip assumes API keys and per-token billing. Running a full AI workforce through the API is prohibitively expensive at scale. A Claude or ChatGPT subscription provides flat-rate access that is dramatically cheaper for teams running agents continuously.

### 12.2 The Solution

Praxio adds a **subscription adapter** alongside Paperclip's existing API adapters. Per-agent setting:

- **Subscription mode:** Agent runs inside a Claude Code / ChatGPT session against the user's flat-rate subscription. Task dispatch happens via the session interface.
- **API mode:** Agent runs via API key, pay-per-token. Paperclip's existing adapter model.

Client deployments: clients bring their own subscription. Praxio does not require clients to use Azul's API keys.

### 12.3 Budget Interaction

In subscription mode, the budget cap still applies but tracks estimated value consumed (time × blended rate) rather than API token cost. This ensures the ROI model remains consistent regardless of execution mode.

---

## 13. Performance & Grading

### 13.1 Inline Session Grading

After each conversation ends, a grading panel appears in the right panel:

| Grade | Meaning |
|---|---|
| Accepted | Output used as-is |
| Minor edits | Output used with small changes |
| Major rework | Output required significant rework |
| Scrapped | Output not used |

Grading is optional but encouraged. Agents with ungraded sessions for more than 7 days surface in the weekly review.

### 13.2 Value Calculation

Each session tracks:
- **Duration** (wall clock, capped at `assistant_turns × 3 min` to account for idle windows)
- **Time saved** (user-entered or auto-estimated based on outcome × duration)
- **Dollar value** (`time_saved_hours × BLENDED_HOURLY_RATE`, default $250/hr)
- **Token cost** (flat blended rate, adjusted for subscription vs API mode)
- **Net value** (`dollar_value - token_cost`)

### 13.3 ROI Dashboard

Per-agent view showing: sessions this month, total cost, total time saved, dollar value, net ROI, grade distribution, week-over-week trend. The same model as the current Notion formulas — now in a real UI.

### 13.4 Weekly Review Flow

Monday review UI surfaces: low-grade sessions from the past week, agents with budget overruns, agents with degrading grade trends. Presents Hire / Retire / Update recommendations. Replaces the current Python `update_grades.py` Monday script.

---

## 14. Integrations

### 14.1 Slack Dispatch Bridge

Existing Slack channels (Rosalind, Engineering) are preserved. Praxio routes outbound Slack messages through the same dispatch logic. Optionally surfaces Slack replies as inline messages in the agent's conversation thread. No migration required for existing Slack workflows.

### 14.2 Obsidian Plugin (Phase 3)

Syncs agent sessions, org context, and notes to a local Obsidian vault as markdown files. Postgres is the source of truth; Obsidian is a read layer. User preference — not core data model. Other users may prefer Notion or nothing.

### 14.3 Notion Plugin (Phase 3)

Syncs agent roster, tasks, and session data to Notion databases. For clients who manage their work in Notion. Same pattern as Obsidian — Postgres is authoritative, Notion is a sync target.

### 14.4 Company Export / Import

Fully inherited from Paperclip. Export entire org structure — agent definitions, roles, capability boundaries, skills, configs — as a portable template. Import a template to spin up a new company. Foundation for eventually selling pre-built Praxio company templates (equivalent of Paperclip's Clipmart).

---

## 15. WAT Workflow Layer

Each agent in Praxio links to their SOP playbook — the markdown file that defines how they work, what they own, what tools they use, and how to invoke them. This is the WAT framework (Workflows, Agents, Tools) made visible in the UI.

- One click from the agent's conversation view to their full operating manual
- Playbook is version-controlled in git (existing SKILL.md / CLAUDE.md files)
- Displayed read-only in the UI; edited in the repo
- Referenced automatically when an agent is invoked via the conversation interface

---

## 16. Build Phases

### Phase 1 — Foundation (Praxio exists and runs)
Fork Paperclip. Rebrand to Praxio with i7n palette. Add `NOTICES` file to repo root containing Paperclip's MIT copyright notice (`Copyright (c) 2025 Paperclip AI`) — satisfies the only legal obligation of the MIT license. Build conversation-first React frontend replacing Paperclip's ticket UI. Wire up real-time streaming via WebSockets. Implement agent presence indicators. Port Rosalind from her existing CoS configuration (behavior rules, integrations, 20+ skills, state management) — not a rebuild. Build Engineering, Marketing, and Agent Ops as new agents patterned after her. Wire pre-configured routing between all four. Add Azul's extended roster (SRE, Release Manager, Services PM) via standard hire flow. Inline budget visibility. Inline session grading. Dark and light themes. WAT workflow layer (playbook link from agent card).

**Deliverable:** Praxio runs locally with Azul's full agent roster. Steven can talk to agents in real time. New orgs get the four base agents on first setup.

### Phase 2 — Governance Layer (Praxio is differentiated)
Capability boundary definitions per agent. Smart routing with inline notifications. Skill registry (personal/team/org levels). Promotion workflow (submission → review → decision → integration). Agent import with optimization review and "make it yours" wizard. Duplication detection. Owner accountability. Subscription adapter (Claude Code subscription mode). ROI dashboard. Weekly review flow. Slack dispatch bridge.

**Deliverable:** Praxio enforces capability governance and tracks agent ROI. Skill promotion is operational.

### Phase 3 — Productization (Praxio is sellable)
Mobile-first conversation view. Obsidian plugin. Notion plugin. Skill forking and living governance (demotion/upgrade). Performance trend tracking. Multi-tenant client onboarding. Company template marketplace — base agent workforce as the default seed template, custom exports from any org.

**Deliverable:** Praxio can be deployed for a client with their own subscription and org structure.

---

## 17. Licensing

Paperclip is MIT licensed (`Copyright (c) 2025 Paperclip AI`). MIT is fully permissive for Praxio's intended use.

**Permitted without restriction:** internal use, modification, client deployment, selling Praxio as a product, keeping Praxio additions proprietary, rebranding as Praxio.

**The one obligation:** Include Paperclip's copyright notice in any distributed copies of the software. Satisfied by a `NOTICES` file in the Praxio repo root. Does not need to appear in the UI, marketing materials, or anywhere client-facing.

**Trademark:** MIT covers code only. Do not use the Paperclip name or logo in Praxio marketing or UI. Already non-issue — the product is called Praxio.

**Future upstream changes:** MIT is irrevocable for the forked version. If Paperclip changes their license, it does not affect Praxio. Verify each upstream merge is still MIT before pulling in.

**Phase 3 task:** Run a full dependency license audit with `license-checker` before client deployments to confirm no GPL dependencies have entered transitively.

---

## 18. What Praxio Is Not

- **Not a chatbot interface.** Agents are workers, not assistants. The conversation model is for directing work, not having a conversation.
- **Not a workflow builder.** Workflows live in markdown SOPs (WAT). Praxio manages the agents that execute them.
- **Not a prompt manager.** Agent instructions live in SKILL.md files in git, not in Praxio's UI.
- **Not a replacement for Claude Code.** Agents still run inside Claude Code sessions. Praxio orchestrates and governs them.
- **Not a rebuild of Paperclip from scratch.** We fork and extend. We don't rebuild what Paperclip already got right.

---

## 19. Reference Materials

- [Feature Roadmap](../feature-roadmap.html) — living tracker with build status per feature
- [Paperclip GitHub](https://github.com/paperclipai/paperclip) — upstream fork source (MIT)
- i7n Branding: `#0D9488` (teal), `#4338CA` (indigo), `linear-gradient(135deg, #0D9488, #4338CA)` nav
- Brainstorm session: `AI Agent Ops/.superpowers/brainstorm/43672-1778772330/` — UI mockups, architecture diagrams, feature views
