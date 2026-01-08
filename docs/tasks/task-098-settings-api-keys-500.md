# Task 098: Fix API Keys 500 error on Settings page

## Problem

On the Settings page, the API Keys section shows "Failed to load API keys" error. The API server returns a 500 Internal Server Error.

## Location

- API endpoint: `packages/api/src/routes/user-api-keys.ts`
- Web component: `packages/web/src/components/ApiKeysSettings/ApiKeysSettings.tsx`

## Console Error

```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

## Likely Causes

1. **Missing encryption key**: `APP_ENCRYPTION_KEY` env var not set
2. **Missing migration**: `0008_user_api_keys.sql` not run
3. **Database connection issue**: user_api_keys table doesn't exist
4. **Auth context issue**: User ID not properly resolved in bypass mode

## Investigation Steps

1. Check if `APP_ENCRYPTION_KEY` is set in `.env`
2. Run `pnpm migrate` to ensure migrations are applied
3. Check API logs for specific error message
4. Test endpoint directly: `curl -H "X-API-Key: ..." http://localhost:3001/api/user/api-keys`

## Acceptance Criteria

- [ ] API Keys section loads without error
- [ ] Shows provider status (configured/not configured)
- [ ] Can add and delete API keys
- [ ] Error message is user-friendly if encryption key missing

## Priority

High - blocks users from configuring their API keys
