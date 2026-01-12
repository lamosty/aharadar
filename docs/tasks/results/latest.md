TASK REPORT

Repo: /Users/lamosty/projects/aharadar
Branch: main
Commit(s): 22781a9
Commit message: feat(web): add polymarket config fields and restricted badge
Subagents used (if any): general-purpose (agent abd7b2b)

Task spec followed:
- docs/tasks/task-136-polymarket-ui-config-restricted.md

What I changed (1–3 bullets):
- Added new Polymarket config fields (spike thresholds, inclusion toggles) to types.ts
- Updated SourceConfigForm.tsx with sensible daily digest defaults
- Added restricted badge styling and display in DigestDetailCondensed, DigestDetailTimeline
- Note: PolymarketConfigForm.tsx, FeedItem.tsx, DigestDetailReader.tsx changes were in a prior commit (ffb1be9)

Files changed:
- packages/web/src/components/DigestDetail/DigestDetailCondensed.module.css
- packages/web/src/components/DigestDetail/DigestDetailTimeline.module.css
- packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx

How to validate:
- pnpm -r typecheck (web package passes)
- Run pnpm dev:web and test Polymarket source config form
- Test with a Polymarket source that has restricted markets

Open questions / uncertainties:
- None
