# Local AI session recaps (gitignored)

This folder is for **local-only** “handoff” notes between AI sessions (Cursor, Claude Code, etc.).

Why:
- Chat context windows are finite.
- A short recap file lets the next AI session pick up quickly without re-reading the entire repo.

How to use:
- Create a recap file like: `docs/_session/recap-YYYY-MM-DD-HHMM.md`
- Use the template: `docs/_session/template.md`

Git policy:
- Recap files are **gitignored** (not committed).
- Only this `README.md` and `template.md` are tracked.
