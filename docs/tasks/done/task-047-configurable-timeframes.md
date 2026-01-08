# Task 047 — `feat: configurable timeframes / viewing profiles`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Allow users to configure how they use the app - from "power user checking multiple times daily" to "weekly catch-up" to "monthly research review". Different modes affect time decay, what counts as "new", and default filters.

## Background

Different usage patterns need different behaviors:

| Profile  | Check Frequency | Decay         | "New" means      |
| -------- | --------------- | ------------- | ---------------- |
| Power    | Multiple/day    | Fast (hours)  | Since last check |
| Daily    | Once/day        | Medium (24h)  | Since yesterday  |
| Weekly   | Once/week       | Slow (7 days) | Since last week  |
| Research | Monthly         | Very slow     | Since last month |

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/spec.md`
- `docs/data-model.md`

## Scope (allowed files)

- `packages/db/migrations/` (new migration for user_preferences table)
- `packages/db/src/repos/` (preferences repo)
- `packages/api/src/routes/` (preferences endpoints)
- `packages/web/src/app/app/settings/` (UI for settings)
- `packages/pipeline/src/stages/rank.ts` (apply decay)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### Phase 1: Data model

1. **Add user_preferences table** (or extend users):

   ```sql
   CREATE TABLE user_preferences (
     user_id UUID PRIMARY KEY REFERENCES users(id),
     viewing_profile TEXT DEFAULT 'daily', -- power, daily, weekly, research
     decay_hours INTEGER DEFAULT 24,
     last_checked_at TIMESTAMPTZ,
     custom_settings JSONB DEFAULT '{}',
     updated_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. **API endpoints**:
   - `GET /api/preferences` - get current settings
   - `PATCH /api/preferences` - update settings
   - `POST /api/preferences/mark-checked` - update last_checked_at

### Phase 2: Apply decay in ranking

3. **Decay formula**:

   ```typescript
   function applyDecay(score: number, itemAge: number, decayHours: number): number {
     const decayFactor = Math.exp(-itemAge / decayHours);
     return score * decayFactor;
   }
   ```

   - `itemAge` = hours since item was published/fetched
   - `decayHours` = from user preferences (24 for daily, 168 for weekly, etc.)

4. **Integrate into unified items endpoint**:
   - Apply decay when returning items
   - Or store decayed_score alongside raw score

### Phase 3: UI for settings

5. **Settings page**:
   - Profile selector (Power / Daily / Weekly / Research / Custom)
   - If Custom: slider for decay rate
   - Show explanation of what each setting means

6. **"Mark as caught up" button**:
   - Updates last_checked_at
   - Next time, items since that time are highlighted as "new"

### Phase 4: "New since last check" indicator

7. **In feed view**:
   - Items fetched after `last_checked_at` get a "NEW" badge
   - Optional: separate "New items" section at top

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] User can select viewing profile in settings
- [ ] Decay is applied based on profile
- [ ] "Mark as caught up" updates timestamp
- [ ] New items since last check are indicated

## Test plan (copy/paste)

```bash
pnpm dev:services
pnpm migrate
pnpm build
pnpm dev:api &
pnpm dev:web

# 1. Open settings, select "Weekly" profile
# 2. Check feed - older items should have lower scores than with "Daily"
# 3. Click "Mark as caught up"
# 4. Wait for new items (or manually add)
# 5. New items should have "NEW" badge
```

## Notes

- Start with preset profiles, add "Custom" later if needed
- Consider per-topic profiles (daily for tech, weekly for science)
- Don't make it too complex - most users will pick a preset
- Decay should be gentle - a great old item should still be visible
