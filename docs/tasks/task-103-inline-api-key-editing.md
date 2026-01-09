# Task 103: Inline Editable API Keys in Settings

## Priority: Low

## Goal

Improve the API Keys section in Settings to allow inline editing by clicking on the "Not Configured" text or an edit icon, instead of requiring a separate dropdown and input field below.

## Background

Currently the Settings > API Keys section shows a list of providers with their configuration status:
```
OpenAI API Key: Not Configured
Anthropic API Key: Not Configured
```

To add an API key, users must:
1. Select the provider from a dropdown below
2. Enter the key in a separate input field
3. Click Save

This is unintuitive because:
- The list and the form are disconnected
- Users expect to click "Not Configured" to configure it
- Common UX pattern is inline editing (click to edit)

## Requirements

1. Each provider row should be directly editable
2. Click on "Not Configured" or an edit icon to enter edit mode
3. In edit mode: show inline input field + save/cancel buttons
4. Show masked key when configured (e.g., `sk-****...****a3b2`)
5. Click to reveal/edit the full key
6. Remove the separate dropdown + input form

## Current UI

```
API Keys
─────────────────────────────────────────────

OpenAI API Key:          Not Configured
Anthropic API Key:       Not Configured
Grok API Key:           Not Configured

[Select Provider ▼]
[Enter API Key...     ]
[Save]
```

## Proposed UI

```
API Keys
─────────────────────────────────────────────

OpenAI         [ Not Configured          ] [🔑]
Anthropic      [ sk-****...****a3b2      ] [✏️]
Grok           [ Not Configured          ] [🔑]

Click to configure. Keys are stored locally in your browser.
```

When clicking to edit:
```
OpenAI         [_________________________] [✓] [✗]
               Enter your OpenAI API key
```

## Files to Modify

- `packages/web/src/app/app/settings/page.tsx` - API Keys section
- `packages/web/src/components/` - May need new InlineEditField component

## Acceptance Criteria

- [ ] Each API key is editable inline
- [ ] Click "Not Configured" to start configuring
- [ ] Configured keys show masked value
- [ ] Click edit icon to modify existing key
- [ ] Save/cancel buttons appear in edit mode
- [ ] Remove separate dropdown/form
- [ ] `pnpm typecheck` passes

## Notes

- API keys are stored in localStorage (dev settings)
- Consider using a reusable InlineEditField component
- Add proper masking to hide middle portion of key
- This is a UX polish task, low priority
