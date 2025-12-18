# Sessions / handoff recaps (committed)

This folder contains **handoff recaps between AI sessions** (Cursor, Claude Code, etc.).

Why:

- Chat context windows are finite.
- A recap lets the next agent pick up quickly without re-reading the whole repo.
- Keeping recaps **committed** provides a lightweight audit log / progress journal.

## Structure

- `docs/sessions/template.md` — recap template
- `docs/sessions/recaps/` — committed recap files

## Naming

Recap files should be unique and sortable:

- `docs/sessions/recaps/recap-YYYY-MM-DDTHHMMZ-<slug>.md`
  - `YYYY-MM-DDTHHMMZ` is UTC time when the recap was written (minute precision).
  - `<slug>` is a short hint (e.g. `signal-x-search`, `pipeline-ingest`, `multi`).
  - If you ever create two recaps in the same minute, append `-01`, `-02`, etc.

## Safety policy (non-negotiable)

Recaps must not contain secrets:

- do not paste API keys, tokens, or full `.env` values
- prefer listing env var **names** only
- redact anything sensitive with `<REDACTED>`
