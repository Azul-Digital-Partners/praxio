# Praxio Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork Paperclip, replace its frontend with a conversation-first React UI using i7n branding, add real-time streaming, session grading, agent presence, budget visibility, a WAT playbook link, and deploy the four base agent configurations (Rosalind port + Engineering/Marketing/Agent Ops new builds) each with their generic skill sets and the `/setup` skill.

**Architecture:** Keep Paperclip's entire TypeScript/Node.js/Postgres backend unchanged. Build a new React 18 + Vite frontend from scratch in `apps/web/` to replace Paperclip's existing UI package. Extend the backend with WebSocket endpoints for streaming and presence. Add `agents/` directory at the repo root for base agent SKILL.md playbooks.

**Tech Stack:** TypeScript, React 18, Vite, Tailwind CSS, shadcn/ui, WebSockets (`ws`), PostgreSQL (Paperclip schema + new migrations), Vitest (unit), Playwright (e2e)

**Scope boundary:** Phase 1 ends when Steven can talk to all four base agents in real time with grading and presence visible. Capability boundaries, skill registry, routing engine, and subscription adapter are Phase 2.

---

## Pre-work: Explore Paperclip's structure

Before writing a line of code, read Paperclip's repo to understand the package layout, how the existing frontend connects to the backend, and where the agent/task data model lives.

- [ ] Clone the fork locally and run `find . -name "package.json" -maxdepth 3 | sort` to map the monorepo structure
- [ ] Read the root `package.json` and any `turbo.json` / `pnpm-workspace.yaml` to understand the build system
- [ ] Read `packages/db/schema.sql` (or equivalent) to understand the existing data model — note the `agents`, `tasks`, `goals`, and `budget` tables
- [ ] Note the existing frontend entry point and which port it runs on
- [ ] Record the findings — update this plan's "File Structure" section with actual Paperclip paths before proceeding

---

## File Structure

New files created by this plan (adjust `apps/web` path based on Paperclip's actual monorepo layout):

```
NOTICES                                    # MIT attribution (Paperclip)
apps/web/                                  # New React frontend (replaces Paperclip's UI package)
  index.html
  vite.config.ts
  tailwind.config.ts
  src/
    main.tsx
    App.tsx
    theme.ts                               # i7n color tokens + dark/light mode
    components/
      layout/
        NavRail.tsx                        # Left nav, 56px, i7n gradient
        AgentSidebar.tsx                   # Agent list + presence + budget strip
        RightPanel.tsx                     # Agent card + grading + playbook
        Layout.tsx                         # Root shell composing all panels
      chat/
        ConversationThread.tsx             # Per-agent message list
        Message.tsx                        # Single message, static or streaming
        StreamingMessage.tsx               # Message that renders chunks as they arrive
        RoutingNotification.tsx            # Inline indigo banner (Phase 2 wires logic)
        MessageInput.tsx                   # Textarea + send, creates task on submit
      agents/
        AgentCard.tsx                      # Name, role, capability summary, this-month ROI
        PresenceIndicator.tsx              # Dot: green=live, yellow=busy, grey=idle
        BudgetStrip.tsx                    # Thin bar: budget remaining for this agent
      grading/
        SessionGrading.tsx                 # Four-option grade panel in RightPanel
      playbook/
        PlaybookPanel.tsx                  # Renders agent's SKILL.md read-only in RightPanel
    hooks/
      useWebSocket.ts                      # Manages WS connection, reconnect, message dispatch
      useAgentPresence.ts                  # Subscribes to presence updates for an agent
      useConversation.ts                   # Manages conversation state + streaming accumulation
    pages/
      ConversationsPage.tsx                # Main view — sidebar + thread + right panel
      OrgChartPage.tsx                     # Placeholder (uses Paperclip's existing org chart)

packages/server/src/                       # Paperclip backend (extend, don't replace)
  ws/
    index.ts                               # WebSocket server setup, attaches to HTTP server
    handlers/
      chat.ts                              # Handles incoming messages, streams agent responses
      presence.ts                          # Manages agent presence state + broadcasts

packages/db/migrations/                    # Paperclip migration directory (verify actual path)
  XXX_conversations.sql                    # conversations + conversation_messages tables
  XXX_session_grades.sql                   # session_grades table
  XXX_agent_presence.sql                   # agent_presence table

agents/                                    # Base agent configurations (new top-level directory)
  rosalind/
    SKILL.md                               # Ported from CoS repo
    skills/                                # Symlink or copy of CoS skills (morning, update, etc.)
  engineering/
    SKILL.md
    skills/
      review.md
      spec.md
      debug.md
      pr.md
      arch.md
      test.md
      standup.md
      release.md
  marketing/
    SKILL.md
    skills/
      draft.md
      brief.md
      review.md
      social.md
      email.md
      repurpose.md
      campaign.md
  agent-ops/
    SKILL.md
    skills/
      setup.md                             # The /setup skill used by all agents
      weekly-review.md
      hire.md
      retire.md
      grade-review.md
```

---

## Task 1: Fork, NOTICES, and Rebrand

**Files:**
- Create: `NOTICES`
- Modify: root `package.json` (name field)
- Modify: any `APP_NAME` / `PRODUCT_NAME` constants in the backend (grep for "Paperclip" after fork)

- [ ] **Step 1: Fork on GitHub**

Go to https://github.com/paperclipai/paperclip and click Fork. Name the fork `praxio`. Clone it locally:

```bash
git clone https://github.com/<your-org>/praxio.git
cd praxio
```

- [ ] **Step 2: Add NOTICES file**

Create `NOTICES` at the repo root:

```
Praxio includes software from the Paperclip project.

Copyright (c) 2025 Paperclip AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

- [ ] **Step 3: Find all "Paperclip" references in the codebase**

```bash
grep -r "Paperclip\|paperclip" --include="*.ts" --include="*.tsx" --include="*.json" -l | grep -v node_modules | grep -v ".git"
```

Record the output. Replace product-name references (app title, window title, email sender name) with "Praxio". Do NOT replace package names that reference `@paperclip/` internal packages — leave those alone.

- [ ] **Step 4: Commit**

```bash
git add NOTICES
git commit -m "feat: add NOTICES file for Paperclip MIT attribution"
git add -A
git commit -m "chore: rebrand product name references to Praxio"
```

---

## Task 2: New Frontend Package

**Files:**
- Create: `apps/web/` (full Vite + React scaffold)

> Before starting: confirm the exact path Paperclip uses for its frontend package and disable or remove it from the build so there are no conflicts. The existing frontend package is kept in git history but excluded from the workspace.

- [ ] **Step 1: Remove existing frontend from workspace**

In the root `pnpm-workspace.yaml` (or equivalent), comment out the existing UI app. This stops it from being built without deleting it from git history:

```yaml
packages:
  # - 'apps/web-paperclip'   # commented out — replaced by Praxio UI
  - 'apps/web'
  - 'packages/*'
```

- [ ] **Step 2: Scaffold the new frontend**

```bash
pnpm create vite apps/web --template react-ts
cd apps/web
pnpm install
```

- [ ] **Step 3: Install UI dependencies**

```bash
pnpm add tailwindcss @tailwindcss/vite lucide-react clsx
pnpm add -D @types/react @types/react-dom vitest @vitejs/plugin-react
pnpx shadcn@latest init
```

When shadcn prompts: choose TypeScript, Tailwind CSS, `src/components/ui/` for components path, `@/` as import alias.

- [ ] **Step 4: Configure Vite**

`apps/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
```

- [ ] **Step 5: Verify dev server starts**

```bash
pnpm dev
```

Expected: Vite dev server running at `http://localhost:5173` with the default React scaffold page.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: scaffold Praxio React frontend with Vite + Tailwind + shadcn"
```

---

## Task 3: i7n Theme

**Files:**
- Create: `apps/web/src/theme.ts`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Write the failing test**

`apps/web/src/theme.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { colors, gradients } from './theme'

describe('i7n theme', () => {
  it('exports primary teal color', () => {
    expect(colors.primary).toBe('#0D9488')
  })
  it('exports secondary indigo color', () => {
    expect(colors.secondary).toBe('#4338CA')
  })
  it('exports nav gradient', () => {
    expect(gradients.nav).toBe('linear-gradient(135deg, #0D9488, #4338CA)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/theme.test.ts
```

Expected: FAIL — `Cannot find module './theme'`

- [ ] **Step 3: Implement theme.ts**

`apps/web/src/theme.ts`:
```typescript
export const colors = {
  primary: '#0D9488',
  secondary: '#4338CA',
  primaryDark: '#0F766E',
  secondaryDark: '#3730A3',
} as const

export const gradients = {
  nav: 'linear-gradient(135deg, #0D9488, #4338CA)',
} as const

export const theme = { colors, gradients } as const
```

- [ ] **Step 4: Extend Tailwind config**

`apps/web/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0D9488', dark: '#0F766E' },
        secondary: { DEFAULT: '#4338CA', dark: '#3730A3' },
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 5: Set CSS variables for dark/light mode**

`apps/web/src/index.css` (replace contents):
```css
@import "tailwindcss";

:root {
  --bg: #ffffff;
  --surface: #f9fafb;
  --border: #e5e7eb;
  --text: #111827;
  --text-muted: #6b7280;
}

.dark {
  --bg: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run src/theme.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/theme.ts apps/web/src/theme.test.ts apps/web/tailwind.config.ts apps/web/src/index.css
git commit -m "feat: add i7n theme tokens (teal/indigo, dark/light CSS vars)"
```

---

## Task 4: Database Migrations

**Files:**
- Create: `packages/db/migrations/XXX_conversations.sql` (replace XXX with next migration number)
- Create: `packages/db/migrations/XXX_session_grades.sql`
- Create: `packages/db/migrations/XXX_agent_presence.sql`

> Before starting: run `ls packages/db/migrations/` to find the current highest migration number and continue from there.

- [ ] **Step 1: Create conversations migration**

`packages/db/migrations/XXX_conversations.sql`:
```sql
-- conversations: one per agent interaction session
CREATE TABLE conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  task_id     UUID        REFERENCES tasks(id)
);

-- conversation_messages: individual turns within a conversation
CREATE TABLE conversation_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
```

- [ ] **Step 2: Create session grades migration**

`packages/db/migrations/XXX_session_grades.sql`:
```sql
CREATE TABLE session_grades (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE UNIQUE,
  grade           TEXT        NOT NULL CHECK (grade IN ('accepted', 'minor_edits', 'major_rework', 'scrapped')),
  graded_by       UUID        NOT NULL REFERENCES users(id),
  graded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Create agent presence migration**

`packages/db/migrations/XXX_agent_presence.sql`:
```sql
CREATE TABLE agent_presence (
  agent_id    UUID        PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL CHECK (status IN ('live', 'idle', 'busy')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial presence for all existing agents as idle
INSERT INTO agent_presence (agent_id, status)
SELECT id, 'idle' FROM agents;
```

- [ ] **Step 4: Run migrations**

Use whatever migration runner Paperclip already uses (check `package.json` scripts for `db:migrate` or similar):

```bash
pnpm db:migrate
```

Expected: Three new tables created with no errors.

- [ ] **Step 5: Verify tables exist**

```bash
psql $DATABASE_URL -c "\dt" | grep -E "conversations|session_grades|agent_presence"
```

Expected: All three tables listed.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/
git commit -m "feat: add conversations, session_grades, and agent_presence tables"
```

---

## Task 5: WebSocket Backend

**Files:**
- Create: `packages/server/src/ws/index.ts`
- Create: `packages/server/src/ws/handlers/chat.ts`
- Create: `packages/server/src/ws/handlers/presence.ts`
- Modify: `packages/server/src/index.ts` (attach WS server to HTTP server)

- [ ] **Step 1: Install ws**

```bash
cd packages/server && pnpm add ws && pnpm add -D @types/ws
```

- [ ] **Step 2: Write the failing test**

`packages/server/src/ws/handlers/chat.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildChatHandler } from './chat'

describe('chat handler', () => {
  it('sends a streaming chunk message', async () => {
    const sent: string[] = []
    const mockWs = { send: (msg: string) => sent.push(msg), readyState: 1 }
    const handler = buildChatHandler(mockWs as any)

    await handler({ type: 'chunk', content: 'hello' })

    const parsed = JSON.parse(sent[0])
    expect(parsed.type).toBe('chunk')
    expect(parsed.content).toBe('hello')
  })

  it('sends a done message when stream ends', async () => {
    const sent: string[] = []
    const mockWs = { send: (msg: string) => sent.push(msg), readyState: 1 }
    const handler = buildChatHandler(mockWs as any)

    await handler({ type: 'done', conversationId: 'abc' })

    const parsed = JSON.parse(sent[0])
    expect(parsed.type).toBe('done')
    expect(parsed.conversationId).toBe('abc')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/server && pnpm vitest run src/ws/handlers/chat.test.ts
```

Expected: FAIL — `Cannot find module './chat'`

- [ ] **Step 4: Implement chat handler**

`packages/server/src/ws/handlers/chat.ts`:
```typescript
import type WebSocket from 'ws'

type ChatEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; message: string }

export function buildChatHandler(ws: WebSocket) {
  return async function sendChatEvent(event: ChatEvent) {
    if (ws.readyState !== 1) return
    ws.send(JSON.stringify(event))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/server && pnpm vitest run src/ws/handlers/chat.test.ts
```

Expected: PASS

- [ ] **Step 6: Write presence handler**

`packages/server/src/ws/handlers/presence.ts`:
```typescript
import type WebSocket from 'ws'
import type { Pool } from 'pg'

type PresenceStatus = 'live' | 'idle' | 'busy'

export async function updatePresence(
  db: Pool,
  agentId: string,
  status: PresenceStatus
): Promise<void> {
  await db.query(
    `INSERT INTO agent_presence (agent_id, status, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (agent_id) DO UPDATE SET status = $2, updated_at = now()`,
    [agentId, status]
  )
}

export function broadcastPresence(
  clients: Set<WebSocket>,
  agentId: string,
  status: PresenceStatus
): void {
  const msg = JSON.stringify({ type: 'presence', agentId, status })
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg)
  }
}
```

- [ ] **Step 7: Implement WebSocket server**

`packages/server/src/ws/index.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import type { Pool } from 'pg'
import { buildChatHandler } from './handlers/chat'
import { broadcastPresence } from './handlers/presence'

export function attachWebSocketServer(httpServer: Server, db: Pool): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  const clients = new Set<WebSocket>()

  wss.on('connection', (ws) => {
    clients.add(ws)
    const sendChat = buildChatHandler(ws)

    ws.on('message', async (raw) => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }

      if (msg.type === 'presence_update') {
        broadcastPresence(clients, msg.agentId, msg.status)
      }
    })

    ws.on('close', () => clients.delete(ws))
  })

  return wss
}
```

- [ ] **Step 8: Attach to HTTP server**

In `packages/server/src/index.ts`, find where the HTTP server is created and add:

```typescript
import { attachWebSocketServer } from './ws'

// After: const server = app.listen(PORT, ...)
attachWebSocketServer(server, db)
```

- [ ] **Step 9: Verify WebSocket endpoint responds**

Start the backend (`pnpm dev` or equivalent), then:

```bash
node -e "
const ws = new (require('ws'))('ws://localhost:3000/ws');
ws.on('open', () => { ws.send(JSON.stringify({type:'ping'})); });
ws.on('message', (d) => { console.log('got:', d.toString()); ws.close(); });
"
```

Expected: `got: {"type":"pong"}`

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/ws/
git commit -m "feat: add WebSocket server for streaming chat and presence broadcast"
```

---

## Task 6: App Shell Layout

**Files:**
- Create: `apps/web/src/components/layout/NavRail.tsx`
- Create: `apps/web/src/components/layout/AgentSidebar.tsx`
- Create: `apps/web/src/components/layout/RightPanel.tsx`
- Create: `apps/web/src/components/layout/Layout.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/layout/Layout.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Layout } from './Layout'

describe('Layout', () => {
  it('renders nav rail, sidebar, main, and right panel slots', () => {
    render(
      <Layout
        navRail={<div data-testid="nav" />}
        sidebar={<div data-testid="sidebar" />}
        main={<div data-testid="main" />}
        rightPanel={<div data-testid="right" />}
      />
    )
    expect(screen.getByTestId('nav')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(screen.getByTestId('right')).toBeInTheDocument()
  })
})
```

Install testing deps first:
```bash
cd apps/web && pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

Add to `vite.config.ts`:
```typescript
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test-setup.ts'],
}
```

Create `apps/web/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/components/layout/Layout.test.tsx
```

Expected: FAIL — `Cannot find module './Layout'`

- [ ] **Step 3: Implement Layout.tsx**

`apps/web/src/components/layout/Layout.tsx`:
```typescript
interface LayoutProps {
  navRail: React.ReactNode
  sidebar: React.ReactNode
  main: React.ReactNode
  rightPanel: React.ReactNode
}

export function Layout({ navRail, sidebar, main, rightPanel }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div className="w-14 flex-shrink-0">{navRail}</div>
      <div className="w-[220px] flex-shrink-0 border-r border-[var(--border)]">{sidebar}</div>
      <div className="flex-1 overflow-hidden">{main}</div>
      <div className="w-[220px] flex-shrink-0 border-l border-[var(--border)]">{rightPanel}</div>
    </div>
  )
}
```

- [ ] **Step 4: Implement NavRail.tsx**

`apps/web/src/components/layout/NavRail.tsx`:
```typescript
import { MessageSquare, Users, BookOpen, BarChart2 } from 'lucide-react'
import { gradients } from '@/theme'

const navItems = [
  { icon: MessageSquare, label: 'Conversations', href: '/' },
  { icon: Users, label: 'Org Chart', href: '/org' },
  { icon: BookOpen, label: 'Registry', href: '/registry' },
  { icon: BarChart2, label: 'Analytics', href: '/analytics' },
]

export function NavRail() {
  return (
    <nav
      className="flex h-full w-14 flex-col items-center py-4 gap-6"
      style={{ background: gradients.nav }}
    >
      <div className="text-white font-bold text-sm tracking-tight select-none">i7n</div>
      <div className="flex flex-col gap-4 flex-1">
        {navItems.map(({ icon: Icon, label, href }) => (
          <a
            key={label}
            href={href}
            title={label}
            className="text-white/70 hover:text-white transition-colors"
          >
            <Icon size={20} />
          </a>
        ))}
      </div>
    </nav>
  )
}
```

- [ ] **Step 5: Implement AgentSidebar.tsx (static placeholder)**

`apps/web/src/components/layout/AgentSidebar.tsx`:
```typescript
import { PresenceIndicator } from '@/components/agents/PresenceIndicator'
import { BudgetStrip } from '@/components/agents/BudgetStrip'

export interface AgentSummary {
  id: string
  name: string
  role: string
  status: 'live' | 'idle' | 'busy'
  budgetRemaining: number
  budgetCap: number
}

interface AgentSidebarProps {
  agents: AgentSummary[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
}

export function AgentSidebar({ agents, selectedAgentId, onSelectAgent }: AgentSidebarProps) {
  const active = agents.filter((a) => a.status !== 'idle')
  const idle = agents.filter((a) => a.status === 'idle')

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--surface)] p-2 gap-1">
      <AgentGroup label="Active" agents={active} selectedId={selectedAgentId} onSelect={onSelectAgent} />
      <AgentGroup label="Idle" agents={idle} selectedId={selectedAgentId} onSelect={onSelectAgent} />
    </div>
  )
}

function AgentGroup({ label, agents, selectedId, onSelect }: {
  label: string
  agents: AgentSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (agents.length === 0) return null
  return (
    <div>
      <p className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent.id)}
          className={`w-full text-left px-2 py-2 rounded-md flex flex-col gap-1 transition-colors ${
            selectedId === agent.id
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <PresenceIndicator status={agent.status} />
            <span className="text-sm font-medium truncate">{agent.name}</span>
          </div>
          <BudgetStrip remaining={agent.budgetRemaining} cap={agent.budgetCap} />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Implement RightPanel.tsx (static placeholder)**

`apps/web/src/components/layout/RightPanel.tsx`:
```typescript
import type { AgentSummary } from './AgentSidebar'

interface RightPanelProps {
  agent: AgentSummary | null
}

export function RightPanel({ agent }: RightPanelProps) {
  if (!agent) return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)] p-4 text-center">
      Select an agent to see details
    </div>
  )

  return (
    <div className="flex h-full flex-col p-3 gap-4 overflow-y-auto bg-[var(--surface)]">
      <div>
        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1">Agent</p>
        <p className="font-semibold">{agent.name}</p>
        <p className="text-sm text-[var(--text-muted)]">{agent.role}</p>
      </div>
      {/* Grading and playbook panels slot in here — Task 10 and 11 */}
    </div>
  )
}
```

- [ ] **Step 7: Wire App.tsx**

`apps/web/src/App.tsx`:
```typescript
import { useState } from 'react'
import { Layout } from '@/components/layout/Layout'
import { NavRail } from '@/components/layout/NavRail'
import { AgentSidebar, type AgentSummary } from '@/components/layout/AgentSidebar'
import { RightPanel } from '@/components/layout/RightPanel'

const MOCK_AGENTS: AgentSummary[] = [
  { id: '1', name: 'Rosalind', role: 'Chief of Staff', status: 'live', budgetRemaining: 180, budgetCap: 200 },
  { id: '2', name: 'Engineering', role: 'Technical Lead', status: 'idle', budgetRemaining: 95, budgetCap: 150 },
  { id: '3', name: 'Marketing', role: 'Creative Lead', status: 'idle', budgetRemaining: 60, budgetCap: 100 },
  { id: '4', name: 'Agent Ops', role: 'Workforce Manager', status: 'idle', budgetRemaining: 40, budgetCap: 75 },
]

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>('1')
  const selectedAgent = MOCK_AGENTS.find((a) => a.id === selectedId) ?? null

  return (
    <div className="dark">
      <Layout
        navRail={<NavRail />}
        sidebar={
          <AgentSidebar
            agents={MOCK_AGENTS}
            selectedAgentId={selectedId}
            onSelectAgent={setSelectedId}
          />
        }
        main={<div className="p-4 text-[var(--text-muted)]">Conversation thread coming in Task 7</div>}
        rightPanel={<RightPanel agent={selectedAgent} />}
      />
    </div>
  )
}
```

- [ ] **Step 8: Run layout test**

```bash
cd apps/web && pnpm vitest run src/components/layout/Layout.test.tsx
```

Expected: PASS

- [ ] **Step 9: Visually verify in browser**

```bash
cd apps/web && pnpm dev
```

Open http://localhost:5173. Expected: i7n gradient nav rail on left, agent list in sidebar with Rosalind shown as active, empty center and right panel.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add app shell layout (NavRail, AgentSidebar, RightPanel)"
```

---

## Task 7: Agent Presence + Budget Components

**Files:**
- Create: `apps/web/src/components/agents/PresenceIndicator.tsx`
- Create: `apps/web/src/components/agents/BudgetStrip.tsx`
- Create: `apps/web/src/components/agents/AgentCard.tsx`
- Create: `apps/web/src/hooks/useAgentPresence.ts`

- [ ] **Step 1: Write failing tests**

`apps/web/src/components/agents/PresenceIndicator.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PresenceIndicator } from './PresenceIndicator'

describe('PresenceIndicator', () => {
  it('shows green dot for live status', () => {
    render(<PresenceIndicator status="live" />)
    expect(screen.getByTitle('Live')).toHaveClass('bg-green-400')
  })
  it('shows yellow dot for busy status', () => {
    render(<PresenceIndicator status="busy" />)
    expect(screen.getByTitle('Busy')).toHaveClass('bg-yellow-400')
  })
  it('shows grey dot for idle status', () => {
    render(<PresenceIndicator status="idle" />)
    expect(screen.getByTitle('Idle')).toHaveClass('bg-gray-400')
  })
})
```

`apps/web/src/components/agents/BudgetStrip.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BudgetStrip } from './BudgetStrip'

describe('BudgetStrip', () => {
  it('renders remaining as percentage of cap', () => {
    const { container } = render(<BudgetStrip remaining={50} cap={100} />)
    const fill = container.querySelector('[data-testid="budget-fill"]')
    expect(fill).toHaveStyle({ width: '50%' })
  })
  it('uses warning color when below 20%', () => {
    const { container } = render(<BudgetStrip remaining={15} cap={100} />)
    const fill = container.querySelector('[data-testid="budget-fill"]')
    expect(fill).toHaveClass('bg-amber-400')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && pnpm vitest run src/components/agents/
```

Expected: FAIL for both

- [ ] **Step 3: Implement PresenceIndicator.tsx**

`apps/web/src/components/agents/PresenceIndicator.tsx`:
```typescript
type Status = 'live' | 'busy' | 'idle'

const statusConfig: Record<Status, { color: string; label: string }> = {
  live: { color: 'bg-green-400', label: 'Live' },
  busy: { color: 'bg-yellow-400', label: 'Busy' },
  idle: { color: 'bg-gray-400', label: 'Idle' },
}

export function PresenceIndicator({ status }: { status: Status }) {
  const { color, label } = statusConfig[status]
  return (
    <span
      title={label}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`}
    />
  )
}
```

- [ ] **Step 4: Implement BudgetStrip.tsx**

`apps/web/src/components/agents/BudgetStrip.tsx`:
```typescript
export function BudgetStrip({ remaining, cap }: { remaining: number; cap: number }) {
  const pct = Math.min(100, Math.round((remaining / cap) * 100))
  const isLow = pct < 20
  return (
    <div className="w-full h-1 rounded-full bg-[var(--border)] overflow-hidden">
      <div
        data-testid="budget-fill"
        className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-primary'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Implement AgentCard.tsx**

`apps/web/src/components/agents/AgentCard.tsx`:
```typescript
import { PresenceIndicator } from './PresenceIndicator'
import type { AgentSummary } from '@/components/layout/AgentSidebar'

export function AgentCard({ agent }: { agent: AgentSummary }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <PresenceIndicator status={agent.status} />
        <div>
          <p className="font-semibold text-sm">{agent.name}</p>
          <p className="text-xs text-[var(--text-muted)]">{agent.role}</p>
        </div>
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        Budget: ${agent.budgetRemaining} / ${agent.budgetCap}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement useAgentPresence hook**

`apps/web/src/hooks/useAgentPresence.ts`:
```typescript
import { useEffect, useState } from 'react'

type Status = 'live' | 'idle' | 'busy'

export function useAgentPresence(ws: WebSocket | null, agentId: string, initial: Status) {
  const [status, setStatus] = useState<Status>(initial)

  useEffect(() => {
    if (!ws) return
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'presence' && msg.agentId === agentId) {
          setStatus(msg.status as Status)
        }
      } catch {}
    }
    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, agentId])

  return status
}
```

- [ ] **Step 7: Run tests**

```bash
cd apps/web && pnpm vitest run src/components/agents/
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/agents/ apps/web/src/hooks/useAgentPresence.ts
git commit -m "feat: add PresenceIndicator, BudgetStrip, AgentCard, useAgentPresence hook"
```

---

## Task 8: WebSocket Client Hook

**Files:**
- Create: `apps/web/src/hooks/useWebSocket.ts`
- Create: `apps/web/src/hooks/useConversation.ts`

- [ ] **Step 1: Write failing test**

`apps/web/src/hooks/useWebSocket.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from './useWebSocket'

// Mock WebSocket
const mockWs = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1,
}
vi.stubGlobal('WebSocket', vi.fn(() => mockWs))

describe('useWebSocket', () => {
  it('returns a send function', () => {
    const { result } = renderHook(() => useWebSocket('/ws'))
    expect(typeof result.current.send).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/hooks/useWebSocket.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement useWebSocket.ts**

`apps/web/src/hooks/useWebSocket.ts`:
```typescript
import { useEffect, useRef, useState, useCallback } from 'react'

type WsStatus = 'connecting' | 'open' | 'closed'

export function useWebSocket(path: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<WsStatus>('connecting')

  useEffect(() => {
    const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${path}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.addEventListener('open', () => setStatus('open'))
    ws.addEventListener('close', () => setStatus('closed'))

    return () => ws.close()
  }, [path])

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { ws: wsRef.current, send, status }
}
```

- [ ] **Step 4: Implement useConversation.ts**

`apps/web/src/hooks/useConversation.ts`:
```typescript
import { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function useConversation(ws: WebSocket | null, conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const streamingRef = useRef<string>('')

  useEffect(() => {
    if (!ws || !conversationId) return

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.conversationId !== conversationId) return

        if (msg.type === 'chunk') {
          streamingRef.current += msg.content
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, content: streamingRef.current }]
            }
            return [...prev, { id: crypto.randomUUID(), role: 'assistant', content: streamingRef.current, streaming: true }]
          })
        }

        if (msg.type === 'done') {
          streamingRef.current = ''
          setMessages((prev) =>
            prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
          )
        }
      } catch {}
    }

    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, conversationId])

  function addUserMessage(content: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content }])
  }

  return { messages, addUserMessage }
}
```

- [ ] **Step 5: Run test**

```bash
cd apps/web && pnpm vitest run src/hooks/useWebSocket.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useWebSocket.ts apps/web/src/hooks/useConversation.ts apps/web/src/hooks/useWebSocket.test.ts
git commit -m "feat: add useWebSocket and useConversation hooks for real-time streaming"
```

---

## Task 9: Conversation Thread UI

**Files:**
- Create: `apps/web/src/components/chat/ConversationThread.tsx`
- Create: `apps/web/src/components/chat/Message.tsx`
- Create: `apps/web/src/components/chat/MessageInput.tsx`

- [ ] **Step 1: Write failing test**

`apps/web/src/components/chat/ConversationThread.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ConversationThread } from './ConversationThread'

describe('ConversationThread', () => {
  it('renders all messages', () => {
    const msgs = [
      { id: '1', role: 'user' as const, content: 'Hello', streaming: false },
      { id: '2', role: 'assistant' as const, content: 'Hi there', streaming: false },
    ]
    render(<ConversationThread messages={msgs} onSend={vi.fn()} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()
  })

  it('calls onSend when message is submitted', async () => {
    const onSend = vi.fn()
    render(<ConversationThread messages={[]} onSend={onSend} />)
    await userEvent.type(screen.getByRole('textbox'), 'test message')
    await userEvent.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('test message')
  })
})
```

Install userEvent:
```bash
cd apps/web && pnpm add -D @testing-library/user-event
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/components/chat/ConversationThread.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Implement Message.tsx**

`apps/web/src/components/chat/Message.tsx`:
```typescript
import type { ChatMessage } from '@/hooks/useConversation'

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-white rounded-br-sm'
            : 'bg-[var(--surface)] text-[var(--text)] rounded-bl-sm border border-[var(--border)]'
        } ${message.streaming ? 'animate-pulse' : ''}`}
      >
        {message.content}
        {message.streaming && <span className="ml-1 opacity-50">▍</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement MessageInput.tsx**

`apps/web/src/components/chat/MessageInput.tsx`:
```typescript
import { useState, useRef } from 'react'
import { Send } from 'lucide-react'

export function MessageInput({ onSend, disabled }: { onSend: (content: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('')

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  return (
    <div className="flex items-end gap-2 p-3 border-t border-[var(--border)]">
      <textarea
        className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-primary min-h-[40px] max-h-[120px]"
        placeholder="Send a message..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
      />
      <button
        onClick={submit}
        disabled={!value.trim() || disabled}
        className="flex-shrink-0 p-2 rounded-xl bg-primary text-white disabled:opacity-40 hover:bg-primary-dark transition-colors"
      >
        <Send size={16} />
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Implement ConversationThread.tsx**

`apps/web/src/components/chat/ConversationThread.tsx`:
```typescript
import { useEffect, useRef } from 'react'
import { Message } from './Message'
import { MessageInput } from './MessageInput'
import type { ChatMessage } from '@/hooks/useConversation'

interface ConversationThreadProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  streaming?: boolean
}

export function ConversationThread({ messages, onSend, streaming }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-[var(--text-muted)] mt-8">
            Send a message to get started.
          </p>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={onSend} disabled={streaming} />
    </div>
  )
}
```

- [ ] **Step 6: Run test**

```bash
cd apps/web && pnpm vitest run src/components/chat/ConversationThread.test.tsx
```

Expected: PASS

- [ ] **Step 7: Wire into App.tsx**

Replace the placeholder `main` slot in `App.tsx`:

```typescript
// Add to imports
import { ConversationThread } from '@/components/chat/ConversationThread'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useConversation } from '@/hooks/useConversation'

// In component body, before return:
const { ws, send } = useWebSocket('/ws')
const { messages, addUserMessage } = useConversation(ws, selectedId)

function handleSend(content: string) {
  addUserMessage(content)
  send({ type: 'message', agentId: selectedId, content })
}

// Replace main slot:
main={<ConversationThread messages={messages} onSend={handleSend} />}
```

- [ ] **Step 8: Visually verify**

Restart dev server. Open http://localhost:5173. Select an agent, type a message, press Enter. Expected: message appears in the thread in a teal bubble on the right.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/chat/
git commit -m "feat: add conversation thread UI with streaming message support"
```

---

## Task 10: Session Grading Panel

**Files:**
- Create: `apps/web/src/components/grading/SessionGrading.tsx`
- Modify: `apps/web/src/components/layout/RightPanel.tsx`
- Create: `packages/server/src/routes/grades.ts`

- [ ] **Step 1: Write failing test**

`apps/web/src/components/grading/SessionGrading.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SessionGrading } from './SessionGrading'

describe('SessionGrading', () => {
  it('renders all four grade options', () => {
    render(<SessionGrading conversationId="abc" onGrade={vi.fn()} />)
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('Minor edits')).toBeInTheDocument()
    expect(screen.getByText('Major rework')).toBeInTheDocument()
    expect(screen.getByText('Scrapped')).toBeInTheDocument()
  })

  it('calls onGrade with the selected grade', () => {
    const onGrade = vi.fn()
    render(<SessionGrading conversationId="abc" onGrade={onGrade} />)
    fireEvent.click(screen.getByText('Accepted'))
    expect(onGrade).toHaveBeenCalledWith('accepted')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/components/grading/SessionGrading.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Implement SessionGrading.tsx**

`apps/web/src/components/grading/SessionGrading.tsx`:
```typescript
import { useState } from 'react'

type Grade = 'accepted' | 'minor_edits' | 'major_rework' | 'scrapped'

const GRADES: { value: Grade; label: string; color: string }[] = [
  { value: 'accepted', label: 'Accepted', color: 'bg-green-500' },
  { value: 'minor_edits', label: 'Minor edits', color: 'bg-teal-500' },
  { value: 'major_rework', label: 'Major rework', color: 'bg-amber-500' },
  { value: 'scrapped', label: 'Scrapped', color: 'bg-red-500' },
]

interface SessionGradingProps {
  conversationId: string
  onGrade: (grade: Grade) => void
}

export function SessionGrading({ conversationId, onGrade }: SessionGradingProps) {
  const [selected, setSelected] = useState<Grade | null>(null)

  async function handleSelect(grade: Grade) {
    setSelected(grade)
    onGrade(grade)
    await fetch('/api/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, grade }),
    })
  }

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Grade this session</p>
      <div className="flex flex-col gap-1">
        {GRADES.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => handleSelect(value)}
            className={`text-left text-xs px-3 py-1.5 rounded-lg border transition-all ${
              selected === value
                ? `${color} text-white border-transparent`
                : 'border-[var(--border)] hover:border-primary text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add grades API route to backend**

`packages/server/src/routes/grades.ts`:
```typescript
import { Router } from 'express'
import type { Pool } from 'pg'

export function gradesRouter(db: Pool) {
  const router = Router()

  router.post('/', async (req, res) => {
    const { conversationId, grade } = req.body
    const validGrades = ['accepted', 'minor_edits', 'major_rework', 'scrapped']
    if (!conversationId || !validGrades.includes(grade)) {
      return res.status(400).json({ error: 'Invalid conversationId or grade' })
    }
    await db.query(
      `INSERT INTO session_grades (conversation_id, grade, graded_by, graded_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (conversation_id) DO UPDATE SET grade = $2, graded_at = now()`,
      [conversationId, grade, req.user?.id ?? 'system']
    )
    res.json({ ok: true })
  })

  return router
}
```

Wire to the existing Express app in `packages/server/src/index.ts`:
```typescript
import { gradesRouter } from './routes/grades'
app.use('/api/grades', gradesRouter(db))
```

- [ ] **Step 5: Add grading to RightPanel**

Add to `apps/web/src/components/layout/RightPanel.tsx`:
```typescript
import { SessionGrading } from '@/components/grading/SessionGrading'

// Inside the returned JSX, after the agent name block:
{agent && (
  <SessionGrading
    conversationId={`${agent.id}-session`}
    onGrade={(grade) => console.log('Graded:', grade)}
  />
)}
```

- [ ] **Step 6: Run test**

```bash
cd apps/web && pnpm vitest run src/components/grading/SessionGrading.test.tsx
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/grading/ packages/server/src/routes/grades.ts
git commit -m "feat: add session grading panel and grades API route"
```

---

## Task 11: WAT Playbook Panel

**Files:**
- Create: `apps/web/src/components/playbook/PlaybookPanel.tsx`
- Modify: `apps/web/src/components/layout/RightPanel.tsx`
- Create: `packages/server/src/routes/playbook.ts`

- [ ] **Step 1: Write failing test**

`apps/web/src/components/playbook/PlaybookPanel.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PlaybookPanel } from './PlaybookPanel'

describe('PlaybookPanel', () => {
  it('renders playbook markdown content', () => {
    render(<PlaybookPanel content="# My Skill\nDoes things." />)
    expect(screen.getByText(/My Skill/)).toBeInTheDocument()
  })

  it('shows empty state when no content', () => {
    render(<PlaybookPanel content={null} />)
    expect(screen.getByText(/No playbook/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/components/playbook/PlaybookPanel.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Install markdown renderer**

```bash
cd apps/web && pnpm add react-markdown
```

- [ ] **Step 4: Implement PlaybookPanel.tsx**

`apps/web/src/components/playbook/PlaybookPanel.tsx`:
```typescript
import ReactMarkdown from 'react-markdown'

interface PlaybookPanelProps {
  content: string | null
}

export function PlaybookPanel({ content }: PlaybookPanelProps) {
  if (!content) {
    return (
      <p className="text-xs text-[var(--text-muted)] italic">
        No playbook linked. Add a SKILL.md to this agent's config.
      </p>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-[var(--text)] overflow-y-auto max-h-64">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 5: Add playbook API route**

`packages/server/src/routes/playbook.ts`:
```typescript
import { Router } from 'express'
import fs from 'fs'
import path from 'path'

export function playbookRouter(agentsDir: string) {
  const router = Router()

  router.get('/:agentSlug', (req, res) => {
    const { agentSlug } = req.params
    // Sanitize — only allow alphanumeric and hyphens
    if (!/^[a-z0-9-]+$/.test(agentSlug)) {
      return res.status(400).json({ error: 'Invalid agent slug' })
    }
    const skillPath = path.join(agentsDir, agentSlug, 'SKILL.md')
    if (!fs.existsSync(skillPath)) {
      return res.status(404).json({ error: 'Playbook not found' })
    }
    res.type('text/plain').send(fs.readFileSync(skillPath, 'utf-8'))
  })

  return router
}
```

Wire in `packages/server/src/index.ts`:
```typescript
import { playbookRouter } from './routes/playbook'
const agentsDir = path.join(__dirname, '../../../agents')
app.use('/api/playbook', playbookRouter(agentsDir))
```

- [ ] **Step 6: Add playbook link to RightPanel**

Update `apps/web/src/components/layout/RightPanel.tsx` to fetch and display the playbook:

```typescript
import { useEffect, useState } from 'react'
import { PlaybookPanel } from '@/components/playbook/PlaybookPanel'

// Inside RightPanel, add:
const [playbookContent, setPlaybookContent] = useState<string | null>(null)

useEffect(() => {
  if (!agent) return
  fetch(`/api/playbook/${agent.id}`)
    .then((r) => (r.ok ? r.text() : null))
    .then(setPlaybookContent)
    .catch(() => setPlaybookContent(null))
}, [agent?.id])

// In JSX, after grading:
<div>
  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Playbook</p>
  <PlaybookPanel content={playbookContent} />
</div>
```

- [ ] **Step 7: Run test**

```bash
cd apps/web && pnpm vitest run src/components/playbook/PlaybookPanel.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/playbook/ packages/server/src/routes/playbook.ts
git commit -m "feat: add WAT playbook panel and API route serving agents/*/SKILL.md"
```

---

## Task 12: Base Agent Configurations

**Files:**
- Create: `agents/rosalind/SKILL.md`
- Create: `agents/engineering/SKILL.md` + all 8 skill files
- Create: `agents/marketing/SKILL.md` + all 7 skill files
- Create: `agents/agent-ops/SKILL.md` + setup skill (Task 13)

- [ ] **Step 1: Create agents/ directory structure**

```bash
mkdir -p agents/{rosalind,engineering,marketing,agent-ops}/{skills}
```

- [ ] **Step 2: Port Rosalind's SKILL.md**

Copy from the CoS repo:
```bash
cp "/path/to/CoS/.claude/skills/SKILL.md" agents/rosalind/SKILL.md
```

If no root SKILL.md exists in CoS, create `agents/rosalind/SKILL.md` with a summary of her behavior rules and a pointer to the CoS repo for the full configuration:

```markdown
# Rosalind — Chief of Staff

**Role:** Chief of Staff  
**Cadence:** Daily morning brief (7am cron); event-driven for captures and urgent messages

## Context
Full behavior rules and skill library live in the CoS repo. This playbook summarizes her capability boundary for Praxio visibility.

## Owns
- Scheduling and calendar management
- Morning briefs
- Client communications drafts
- Task tracking and status updates
- People context (meeting prep, conversation capture, follow-through)
- Commitments tracking (both directions)

## Routes
- Code work → Engineering
- Copy and content → Marketing
- Agent management decisions → Agent Ops
- External email → Review before send

## Never Touch
- Git repositories
- Billing and budget caps
- Agent SKILL.md files
- External email without review

## System Access
| System | Access |
|---|---|
| Calendar (Outlook + iCloud) | Read/Write |
| Email drafts (Outlook) | Read/Write |
| Notion | Read/Write |
| HubSpot | Read |
| Slack | Read/Write (own bot) |
| Obsidian vault | Read |

## Skills
See CoS repo `.claude/skills/` for full skill library:
`/morning`, `/update`, `/capture`, `/brief`, `/done`, `/ppp`, `/cs-standup`, `/deals`, `/health`, and more
```

- [ ] **Step 3: Create Engineering SKILL.md**

`agents/engineering/SKILL.md`:
```markdown
# Engineering — Technical Lead

**Role:** Technical Lead  
**Cadence:** On-demand; optional daily standup cron

## Context
Loads: codebase structure, recent git log, open PRs, any linked technical spec.

## Owns
- Code review
- PR drafts
- Technical specs
- Debugging walkthroughs
- Architecture questions

## Routes
- Content and copy → Marketing
- Scheduling → Rosalind
- Agent configuration and workforce decisions → Agent Ops

## Never Touch
- Client billing
- Marketing campaigns
- Calendar and email outside engineering context

## System Access
| System | Access |
|---|---|
| Git repositories | Read/Write |
| CI/CD pipelines | Read |
| Slack (engineering channel) | Read/Write |

## Skills
`/review`, `/spec`, `/debug`, `/pr`, `/arch`, `/test`, `/standup`, `/release`
```

- [ ] **Step 4: Create Engineering skill files**

`agents/engineering/skills/review.md`:
```markdown
# /review — Code Review

**Trigger:** `/review [file or PR link]`

**Input:** File path, diff, or PR URL

**Output:** Structured review with: summary of changes, issues (critical/minor), suggestions, approval status

**Steps:**
1. Read the full diff or file content
2. Check for: security issues (injection, auth, secrets), logic errors, test coverage gaps, naming clarity, YAGNI violations
3. Return structured markdown: ## Summary, ## Issues, ## Suggestions, ## Verdict (approve / request changes)
```

`agents/engineering/skills/spec.md`:
```markdown
# /spec — Write Technical Spec

**Trigger:** `/spec [description or requirements]`

**Output:** Technical spec with: problem statement, proposed solution, architecture, data model changes, API changes, testing plan, open questions

**Steps:**
1. Clarify scope if the description is ambiguous (one question at a time)
2. Draft spec in sections: Problem, Solution, Architecture, Data Model, API, Testing, Open Questions
3. Flag any assumptions made explicitly
```

`agents/engineering/skills/debug.md`:
```markdown
# /debug — Debug Walkthrough

**Trigger:** `/debug [error message or behavior description]`

**Output:** Root cause hypothesis, reproduction steps, fix recommendation, test to verify fix

**Steps:**
1. Read the full error trace or symptom description
2. Form 2-3 hypotheses about root cause, ranked by likelihood
3. For each: what would confirm it, what would rule it out
4. Recommend one fix with confidence level
5. Write a test that would catch this regression
```

`agents/engineering/skills/pr.md`:
```markdown
# /pr — Draft PR Description

**Trigger:** `/pr [diff summary or implementation description]`

**Output:** PR title + body (## Summary, bullet changes, ## Test plan, ## Notes)

**Steps:**
1. Read the diff or implementation notes
2. Write: one-line title (under 70 chars), summary bullets (what changed, not how), test plan checklist, any migration or deployment notes
```

`agents/engineering/skills/arch.md`:
```markdown
# /arch — Architecture Question

**Trigger:** `/arch [system design question or proposal]`

**Output:** 2-3 options with trade-offs and a recommendation

**Steps:**
1. Restate the constraint clearly
2. Propose 2-3 options: name, how it works, pros, cons
3. Recommend one with rationale
4. Note what would change the recommendation
```

`agents/engineering/skills/test.md`:
```markdown
# /test — Write Test Cases

**Trigger:** `/test [function name, feature description, or file]`

**Output:** Test file with: happy path, edge cases, failure cases

**Steps:**
1. Identify the function or feature boundary
2. Write tests: happy path first, then edge cases (empty input, boundary values, null), then failure cases (invalid input, external dependency failure)
3. Use the project's existing test framework (check package.json for vitest/jest/pytest)
4. Name tests descriptively: what the behavior is, not what the function is called
```

`agents/engineering/skills/standup.md`:
```markdown
# /standup — Daily Engineering Standup

**Trigger:** `/standup` (manual or cron)

**Output:** Standup message: Done, Next, Blockers

**Steps:**
1. Read git log for last 24 hours: `git log --since="24 hours ago" --oneline`
2. Read any open PR list
3. Format: **Done:** (commits), **Next:** (open PRs or planned work), **Blockers:** (if any)
4. Post to Slack engineering channel
```

`agents/engineering/skills/release.md`:
```markdown
# /release — Release Notes

**Trigger:** `/release [tag range or PR list]`

**Output:** Release notes in: ## New Features, ## Bug Fixes, ## Breaking Changes, ## Migration Steps

**Steps:**
1. Read commits or PRs in the range
2. Categorize: features (feat:), fixes (fix:), breaking (BREAKING CHANGE:)
3. Write user-facing descriptions — not commit messages verbatim
4. Flag any migration steps required
```

- [ ] **Step 5: Create Marketing SKILL.md**

`agents/marketing/SKILL.md`:
```markdown
# Marketing — Creative Lead

**Role:** Creative Lead  
**Cadence:** On-demand

## Context
Loads: brand guidelines, audience personas, campaign briefs when provided.

## Owns
- Copy and content drafts
- Social posts
- Brand voice review
- Campaign briefs
- Email marketing drafts

## Routes
- Technical specs → Engineering
- Scheduling → Rosalind
- Agent configuration → Agent Ops

## Never Touch
- Code repositories
- Billing
- Client contracts

## System Access
| System | Access |
|---|---|
| Notion (content calendar) | Read/Write |
| Slack (marketing channel) | Read/Write |

## Skills
`/draft`, `/brief`, `/review`, `/social`, `/email`, `/repurpose`, `/campaign`
```

- [ ] **Step 6: Create Marketing skill files**

`agents/marketing/skills/draft.md`:
```markdown
# /draft — Draft Copy

**Trigger:** `/draft [brief, goal, or rough notes]`

**Output:** Draft copy in the requested format with a one-line rationale for key choices

**Steps:**
1. Identify: format (email, landing page, ad, article), audience, goal
2. Draft — lead with the most important thing, cut anything that doesn't serve the goal
3. Flag where brand-specific details need to be filled in
```

`agents/marketing/skills/brief.md`:
```markdown
# /brief — Content Brief

**Trigger:** `/brief [campaign goal or topic]`

**Output:** Content brief: goal, audience, key messages, format, channel, CTA, tone

**Steps:**
1. Ask: what's the goal? who's the audience? what action do we want them to take?
2. Produce brief with sections: Goal, Audience, Key Messages (3 max), Format & Channel, CTA, Tone & Voice, Length
```

`agents/marketing/skills/review.md`:
```markdown
# /review — Copy Review

**Trigger:** `/review [copy to review]`

**Output:** Structured feedback: clarity, brand voice, CTA strength, suggested edits

**Steps:**
1. Read the copy fully first
2. Evaluate: Is the first sentence worth reading? Is the CTA clear? Does the tone match brand? Any jargon or filler?
3. Return: ## What's working, ## What to fix, ## Suggested edits (show the actual edit, don't just describe it)
```

`agents/marketing/skills/social.md`:
```markdown
# /social — Social Posts

**Trigger:** `/social [topic or long-form content]`

**Output:** 3 post variations for LinkedIn (or specified platform) at different lengths

**Steps:**
1. Identify: platform, topic, angle, CTA
2. Write 3 variations: short (1-2 sentences), medium (3-5 lines), long (full post with hook)
3. Hook must earn the read in the first line — no "I'm excited to share" openings
```

`agents/marketing/skills/email.md`:
```markdown
# /email — Marketing Email

**Trigger:** `/email [goal, audience, and any relevant context]`

**Output:** Email: subject line (3 options), preview text, body, CTA

**Steps:**
1. Identify: goal, audience segment, one thing we want them to do
2. Write subject (3 options — curiosity, benefit, directness)
3. Write preview text (under 90 chars)
4. Write body: hook, value, social proof if available, CTA
5. Keep it scannable — short paragraphs, one CTA
```

`agents/marketing/skills/repurpose.md`:
```markdown
# /repurpose — Content Repurposing

**Trigger:** `/repurpose [long-form content]`

**Output:** Short-form extracts: 3 social posts, 1 email snippet, 3 headline options

**Steps:**
1. Read the long-form content and identify 3-5 standalone insights
2. For each: write a social post version, note which is strongest for email
3. Write the email snippet from the strongest insight
4. Write 3 headline options for the piece
```

`agents/marketing/skills/campaign.md`:
```markdown
# /campaign — Campaign Structure

**Trigger:** `/campaign [goal and audience]`

**Output:** Campaign structure: goal, audience, channels, message sequence, timeline, success metric

**Steps:**
1. Clarify goal (awareness / conversion / retention) and audience segment
2. Propose channels ranked by fit
3. Outline message sequence: Awareness → Interest → Decision → Action
4. Suggest timeline and cadence
5. Define one primary success metric
```

- [ ] **Step 7: Create Agent Ops SKILL.md**

`agents/agent-ops/SKILL.md`:
```markdown
# Agent Ops — Workforce Manager

**Role:** Workforce Manager  
**Cadence:** Weekly review (Monday 9am cron); on-demand for workforce decisions

## Context
Loads: all agent records, session grades, budget data, skill registry state.

## Owns
- Agent management (hire, pause, retire recommendations)
- Skill registry oversight
- Weekly grade reviews
- Hire/retire recommendations
- /setup skill execution for all new agents and skills

## Routes
- Technical builds → Engineering
- Client-facing communications → Rosalind

## Never Touch
- Client billing
- Marketing campaigns
- Code repositories (except agent config files)

## System Access
| System | Access |
|---|---|
| Praxio agent records | Read/Write |
| Session grades database | Read |
| Budget data | Read |
| Skill registry | Read/Write |

## Skills
`/setup`, `/weekly-review`, `/hire`, `/retire`, `/grade-review`
```

- [ ] **Step 8: Commit**

```bash
git add agents/
git commit -m "feat: add base agent configurations for Rosalind, Engineering, Marketing, and Agent Ops"
```

---

## Task 13: The /setup Skill

**Files:**
- Create: `agents/agent-ops/skills/setup.md`

The `/setup` skill is the gate between "created" and "operational." It runs for every new agent and every new skill implementation.

- [ ] **Step 1: Create setup.md**

`agents/agent-ops/skills/setup.md`:
```markdown
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

Send one sample task appropriate to the agent's role. Record: did the response make sense? Did the agent try to do something outside its boundary?

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

Does this skill need integrations beyond the parent agent's existing access? If yes, list them and flag for connection validation in Step 2 of the agent setup flow (run it for this skill's gaps).

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
```

- [ ] **Step 2: Commit**

```bash
git add agents/agent-ops/skills/setup.md
git commit -m "feat: add /setup skill for agent and skill initialization"
```

---

## Task 14: Dark / Light Theme Toggle

**Files:**
- Create: `apps/web/src/components/layout/ThemeToggle.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write failing test**

`apps/web/src/components/layout/ThemeToggle.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('toggles between dark and light', () => {
    const onToggle = vi.fn()
    render(<ThemeToggle isDark={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run src/components/layout/ThemeToggle.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Implement ThemeToggle.tsx**

`apps/web/src/components/layout/ThemeToggle.tsx`:
```typescript
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="text-white/70 hover:text-white transition-colors"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
```

- [ ] **Step 4: Wire into App.tsx**

Add to `App.tsx`:
```typescript
import { useState } from 'react'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

// In component body:
const [isDark, setIsDark] = useState(true)

// Wrap root div:
<div className={isDark ? 'dark' : ''}>
```

Add `ThemeToggle` to the bottom of `NavRail` by passing it as a prop or adding a fixed slot.

- [ ] **Step 5: Persist preference**

In the theme toggle handler, save to localStorage:
```typescript
function toggleTheme() {
  const next = !isDark
  setIsDark(next)
  localStorage.setItem('praxio-theme', next ? 'dark' : 'light')
}

// Read on init:
const [isDark, setIsDark] = useState(() =>
  localStorage.getItem('praxio-theme') !== 'light'
)
```

- [ ] **Step 6: Run test**

```bash
cd apps/web && pnpm vitest run src/components/layout/ThemeToggle.test.tsx
```

Expected: PASS

- [ ] **Step 7: Visually verify both modes**

Open http://localhost:5173. Click the sun/moon icon. Verify the full UI switches between dark and light. Check that nav gradient, chat bubbles, sidebar, and panels all look correct in both modes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/layout/ThemeToggle.tsx
git commit -m "feat: add dark/light theme toggle with localStorage persistence"
```

---

## Task 15: End-to-End Integration Test

**Files:**
- Create: `e2e/conversation.spec.ts`
- Create: `e2e/grading.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D playwright @playwright/test
pnpx playwright install chromium
```

- [ ] **Step 2: Write conversation e2e test**

`e2e/conversation.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Conversation', () => {
  test('user can send a message and see it in the thread', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Select Rosalind
    await page.getByText('Rosalind').click()

    // Type and send a message
    const input = page.getByRole('textbox')
    await input.fill('Hello Rosalind')
    await input.press('Enter')

    // Message appears in thread
    await expect(page.getByText('Hello Rosalind')).toBeVisible()
  })

  test('user can switch between agents and see separate threads', async ({ page }) => {
    await page.goto('http://localhost:5173')

    await page.getByText('Rosalind').click()
    await page.getByRole('textbox').fill('Message for Rosalind')
    await page.getByRole('textbox').press('Enter')

    await page.getByText('Engineering').click()

    // Rosalind's message is not in Engineering's thread
    await expect(page.getByText('Message for Rosalind')).not.toBeVisible()
  })
})
```

- [ ] **Step 3: Write grading e2e test**

`e2e/grading.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test('user can grade a session', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await page.getByText('Rosalind').click()

  // Grade panel is visible in right panel
  await expect(page.getByText('Grade this session')).toBeVisible()

  // Click a grade
  await page.getByText('Accepted').click()

  // Grade button shows selected state
  await expect(page.getByText('Accepted')).toHaveClass(/bg-green-500/)
})
```

- [ ] **Step 4: Run both suites against running app**

Start the app (frontend + backend), then:

```bash
pnpx playwright test e2e/
```

Expected: Both tests PASS. If any fail, read the error, fix the code, and re-run.

- [ ] **Step 5: Final commit**

```bash
git add e2e/
git commit -m "test: add e2e tests for conversation thread and session grading"
```

---

## Self-Review Checklist

After implementing all tasks, verify against the spec:

- [ ] **Spec §7 Base Agent Workforce** — Rosalind ported from CoS, Engineering/Marketing/AgentOps created with generic skills ✓ Task 12
- [ ] **Spec §7 /setup Skill** — Setup skill defined for agents and skills ✓ Task 13
- [ ] **Spec §8 Architecture** — Fork + Reshape: Paperclip backend kept, new React frontend ✓ Tasks 1–2
- [ ] **Spec §9 Conversation-First UI** — NavRail, AgentSidebar, ConversationThread, RightPanel ✓ Tasks 6, 9
- [ ] **Spec §9 Themes** — Dark/light with i7n palette, user-selectable ✓ Tasks 3, 14
- [ ] **Spec §9 Ambient budget** — BudgetStrip visible in sidebar ✓ Task 7
- [ ] **Spec §9 Real-time streaming** — WebSocket streaming via useConversation hook ✓ Tasks 5, 8
- [ ] **Spec §10 Agent presence indicators** — PresenceIndicator, useAgentPresence ✓ Task 7
- [ ] **Spec §13 Inline session grading** — SessionGrading panel in RightPanel ✓ Task 10
- [ ] **Spec §15 WAT workflow layer** — PlaybookPanel renders SKILL.md from /api/playbook ✓ Task 11
- [ ] **Spec §16 Phase 1 Deliverable** — Praxio runs locally, Steven can talk to agents in real time ✓ Task 15
- [ ] **Spec §17 NOTICES file** — MIT attribution for Paperclip ✓ Task 1
