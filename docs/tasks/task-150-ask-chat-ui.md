# Task 150 — `feat(web,api): ChatGPT-style Ask UI (topic-scoped threads)`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

## Goal

Upgrade the Ask page into a ChatGPT-like experience:

- Left sidebar: **conversations for the selected topic only**
- Right panel: message thread + composer with a clear **Send** button
- Support “New chat” and “Switch chats”
- Keep everything **topic-agnostic**, **provider-agnostic**, and **bounded** (no prompt/token explosions)

## Context / current state (important)

We already have backend persistence for Ask memory:

- `qa_conversations` + `qa_turns` + `qa_turn_embeddings`
- `POST /api/ask` supports `conversationId` and returns `conversationId`
- Web currently stores a `conversationId` per topic in `localStorage` but does **not** show chat history UI.

This task focuses on **UI/UX + minimal API** needed for conversation listing and thread loading.

## Decisions (locked)

1. **Topic-scoped sidebar**: the sidebar only shows conversations for the currently selected topic.
2. **Bounded context**: the backend continues to retrieve only top‑K memory turns; UI may display full thread history but must **not** send full history in each prompt.
3. **Bound topic-item history window**: by default, Ask should use a **recent time window** for topic items (e.g., last 90 days), with an explicit “All time” override.
4. **No domain logic**: no “portfolio” special casing; keep everything generic.

## Context & history bounding plan (required)

We need to prevent prompt/context size from exploding as a topic grows.

### Layer A — Topic items (RAG) window

- Default window: **last 90 days** (configurable later, but hardcode 90 days for now).
- UI exposes a simple toggle:
  - **Recent** (default): last 90 days
  - **All time**
- Implementation MUST filter by **item timestamps** (`content_items.published_at` or `fetched_at`), not `clusters.updated_at`.

### Layer B — Ask memory window

- Even if a conversation has thousands of turns, each Ask call only uses:
  - top‑K relevant prior turns (already capped in pipeline)
  - optional conversation summary (future)

### Layer C — Hard caps (always-on)

Keep existing caps and add/ensure these are enforced:

- max clusters retrieved
- max items per cluster
- max chars per item body
- max chars per (manual summary / ai summary / triage JSON snippets)
- max prior turns included

## Read first (contracts + code)

- `AGENTS.md`
- Ask types: `packages/shared/src/types/qa.ts`
- Ask API: `packages/api/src/routes/ask.ts`
- Ask pipeline handler: `packages/pipeline/src/qa/handler.ts`
- Web Ask page: `packages/web/src/app/app/ask/page.tsx`
- Web Topic provider: `packages/web/src/components/TopicProvider` (usage in Ask page)

## Scope (allowed files)

### Modify

- `packages/api/src/routes/ask.ts`
- `packages/web/src/app/app/ask/page.tsx`
- `packages/web/src/app/app/ask/page.module.css`
- `packages/web/src/messages/en.json`
- `packages/shared/src/types/qa.ts` (only if needed for new API response types)
- `packages/pipeline/src/qa/retrieval.ts` (**required**: fix timeWindow semantics to filter by item timestamps)

### Create (allowed)

- `packages/web/src/components/Ask/AskSidebar.tsx`
- `packages/web/src/components/Ask/AskSidebar.module.css`
- `packages/web/src/components/Ask/AskThread.tsx`
- `packages/web/src/components/Ask/AskThread.module.css`
- `packages/web/src/components/Ask/AskComposer.tsx`
- `packages/web/src/components/Ask/AskComposer.module.css`
- `packages/web/src/lib/askStorage.ts` (optional helper for per-topic conversationId)

If anything else seems required, stop and ask before changing.

## API contract (additions)

Add **topic-scoped** conversation list and thread load endpoints under `/api/ask/*`.

### 1) List conversations for a topic

`GET /api/ask/conversations?topicId=<uuid>`

Response:

```ts
{
  ok: true,
  conversations: Array<{
    id: string;
    topicId: string;
    title: string | null;
    updatedAt: string; // ISO
    lastTurnAt: string | null; // ISO
    lastQuestionPreview: string | null;
  }>;
}
```

Behavior:

- Only return conversations for current user + provided topic.
- Sorted by `updated_at DESC`.
- Include last turn preview via a cheap join/subquery.

### 2) Create a new empty conversation (no turn yet)

`POST /api/ask/conversations`

Body:

```ts
{ topicId: string; title?: string | null }
```

Response:

```ts
{ ok: true, conversation: { id: string; topicId: string; title: string | null; updatedAt: string } }
```

### 3) Load a conversation thread (turns)

`GET /api/ask/conversations/:conversationId?limit=50&offset=0`

Response:

```ts
{
  ok: true,
  conversation: { id: string; topicId: string; title: string | null; updatedAt: string };
  turns: Array<{
    id: string;
    createdAt: string;
    question: string;
    answer: string;
    citations: Array<{ title: string; url: string; sourceType: string; publishedAt: string; relevance: string }>;
    confidence: { score: number; reasoning: string };
  }>;
  pagination: { limit: number; offset: number; hasMore: boolean };
}
```

Notes:

- This endpoint is read-only UI support; it must not affect how Ask composes prompts.

## Ask call contract updates (history window)

We already have `AskRequest.options.timeWindow`:

```ts
options?: {
  timeWindow?: { from?: string; to?: string };
  // ...
}
```

For the UI, implement a simple **historyMode** selector:

- `recent` → send `timeWindow.from = now - 90 days` and `timeWindow.to = now`
- `all_time` → omit `timeWindow`

Backend should treat missing `timeWindow` as “all time”.

## Web UX spec (ChatGPT-like)

### Layout

- Two-column layout:
  - **Left sidebar** (fixed width):
    - Topic selector (reuse existing)
    - “New chat” button
    - Conversation list (scroll)
  - **Main panel**:
    - Thread header (topic name, conversation title placeholder)
    - Thread messages (scroll)
    - Composer docked at bottom (textarea + Send button)

### Conversation list behavior

- Selecting a conversation loads its turns and sets active `conversationId`.
- “New chat”:
  - calls `POST /api/ask/conversations`
  - sets active `conversationId` to the new one
  - clears thread in main panel (until first message)

### Composer behavior

- Always show a clear **Send** button.
- Enter to send, Shift+Enter for newline.
- Disable send when:
  - no topic selected
  - empty question
  - request in flight

### Thread behavior

- Render turns as pairs:
  - “You” bubble (question)
  - “Assistant” bubble (answer)
- Show citations + confidence in a collapsible section per assistant turn (optional in v1).
- Keep existing debug panel behind a toggle (fine to move below thread).

### Persistence / state

- Keep using per-topic `conversationId` storage (already in web), but update it when:
  - user selects a different conversation
  - new chat created
  - ask response returns `conversationId`

## Implementation steps (ordered)

1. **Backend: add endpoints**
   - Extend `packages/api/src/routes/ask.ts` with:
     - `GET /ask/conversations`
     - `POST /ask/conversations`
     - `GET /ask/conversations/:id`
   - Use existing DB `db.qa.*` repo methods where possible.
   - If repo is missing a query required for list/thread load, implement minimal SQL in route file (preferred over adding lots of repos).

2. **Shared types**
   - Add minimal TS types in `packages/shared/src/types/qa.ts` for new endpoints (if used).

3. **Web: new Ask layout**
   - Refactor `packages/web/src/app/app/ask/page.tsx` into:
     - `AskSidebar` (topic selector + new chat + list)
     - `AskThread` (render turns)
     - `AskComposer` (input + send)
   - Keep styling consistent with existing app shell styles.

4. **Web: data fetching**
   - Call `GET /api/ask/conversations?topicId=...` when topic changes.
   - Call `GET /api/ask/conversations/:id` when selecting a conversation.
   - For sending:
     - `POST /api/ask` with `conversationId` and topicId and question.
     - On success, append the new turn to UI without reloading whole thread.

5. **Empty states**
6. **History window selector**
   - Add a small control (segmented/toggle) near the thread header:
     - Recent (90d) / All time
   - Store selection per-topic in localStorage (small helper is allowed).
   - When asking:
     - include `options.timeWindow` only for Recent mode

7. **Backend retrieval correctness (important)**
   - Ensure the time window affects **topic item retrieval**:
     - If `timeWindow` is provided, restrict retrieved items to the window by:
       - filtering `content_items` by `coalesce(published_at, fetched_at)` between from/to
       - and ensuring clusters are only matched if they have topic-member items in-window
   - If this requires updating pipeline retrieval logic, that work is allowed ONLY if it is minimal and within scope; otherwise stop and ask.
   - No conversations yet → show “Start a new chat”
   - Empty conversation (no turns yet) → show onboarding hint in main panel

## Acceptance criteria

- [ ] Ask page has a **visible Send button** and chat layout (sidebar + thread).
- [ ] Sidebar shows **only conversations for the selected topic**.
- [ ] “New chat” creates a new conversation and switches to it.
- [ ] Selecting an existing conversation loads and displays prior turns.
- [ ] Sending a message adds it to the thread and continues the same conversation.
- [ ] Default Ask item context is bounded to **Recent (90d)** unless user chooses “All time”.
- [ ] `pnpm -w typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -w typecheck

# Ensure services are up (if needed)
pnpm dev:services

# Run API+web locally (or use your existing stack)
pnpm dev:stack

# Manual test
# 1) Open http://localhost:3000/app/ask
# 2) Pick a topic
# 3) Click "New chat" -> should create and show empty thread
# 4) Send a question -> thread shows Q/A, sidebar updates last activity
# 5) Create a second chat; switch between them; verify turns load and continue correctly
```

## Commit

- **Message**: `feat(web,api): add chat-style Ask threads (topic-scoped)`
- **Files expected**:
  - `packages/api/src/routes/ask.ts`
  - `packages/web/src/app/app/ask/page.tsx`
  - `packages/web/src/app/app/ask/page.module.css`
  - `packages/web/src/messages/en.json`
  - plus any `packages/web/src/components/Ask/*` files created

