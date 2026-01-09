# Task 068: Fix API Integration Tests

## Status: Open

## Priority: Medium

## Problem

API integration tests failing due to schema mismatch:

```
error: column "enabled" of relation "sources" does not exist
```

## Root Cause

The `sources` table schema changed but test seeding SQL uses old column names.

## Fix Required

Update `packages/api/src/routes/api.int.test.ts`:

- Line 107: Check actual `sources` table schema
- Update INSERT statement to match current schema

## Also Check

- Migration file `0001_init.sql` for current sources table definition
- Any other integration tests that seed data

## Tests to Verify

After fixing:

```bash
pnpm test:integration
```

Should see all 16 API tests pass (currently 16 skipped due to setup failure)
