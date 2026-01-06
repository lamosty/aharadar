# Task 019 (DEFERRED) — `feat(youtube): ingest channel uploads via YouTube feed`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal (deferred)

We are **deferring YouTube ingestion** for now.

Rationale:

- we want RSS + HN first (fastest path to more canonical content)
- YouTube ingestion has extra UX questions (how to find `channelId`, what “video content” means without transcripts)

For now, keep the `youtube` connector as a stub and revisit later with a dedicated discovery/UX pass.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md` (YouTube spec)
- Code:
  - `packages/connectors/src/youtube/fetch.ts`
  - `packages/connectors/src/youtube/normalize.ts`
  - `packages/connectors/src/rss/*` (reference parser if created in Task 018)

## Scope (allowed files)

- `packages/connectors/src/youtube/config.ts`
- `packages/connectors/src/youtube/fetch.ts`
- `packages/connectors/src/youtube/normalize.ts`
- (optional) shared feed parser helper if needed (prefer reusing RSS parsing approach)

If anything else seems required, **stop and ask**.

## Decisions (already decided)

- This task is **not started** in the current batch.
- Transcripts (and “full video content”) are **out-of-scope** for MVP ingestion.

## Next time (notes for future work)

When we revisit:

- Ingest can start from the public channel feed:
  - `https://www.youtube.com/feeds/videos.xml?channel_id=<channelId>`
- “Video content” beyond title/description likely means transcripts:
  - transcripts are a separate, budget-aware enrichment surface (can be added later behind config + credits).

## Acceptance criteria (deferred)

- [ ] N/A (task deferred)

## Test plan (deferred)

```bash
pnpm -r typecheck

# Example:
pnpm dev:cli -- admin:sources-add --type youtube --name "yt:somechannel" --config '{"channelId":"UCxxxxxxxxxxxxxxxx"}'
pnpm dev:cli -- admin:run-now --source-type youtube --max-items-per-source 30
pnpm dev:cli -- inbox --table
```

## Commit (deferred)

- **Message**: N/A (task deferred)

## Final step (required): print GPT‑5.2 review prompt (deferred)

After committing, print this block **filled in**:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-019-youtube-connector.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- <CLI smoke commands you ran>
```
