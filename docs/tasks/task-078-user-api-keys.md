# Task 078 — `feat(db,api): encrypted user API key storage`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: human
- **Driver**: human (runs commands, merges)

## Goal

Enable users to store their own API keys for LLM providers (OpenAI, Anthropic, Grok/xAI). Keys must be encrypted at rest with AES-256-GCM. This is foundational for self-hosted deployments and per-user billing isolation.

## Background

Currently:
- All API keys are stored in `.env` as system-wide secrets
- Single-tenant architecture assumes one set of provider keys
- No mechanism for users to bring their own keys

Desired:
- Users can add their own API keys via UI/API
- Keys are encrypted before storage using a master encryption key
- Provider resolution checks user keys first, falls back to system keys when allowed
- Never expose full keys in API responses or logs

## Read first (required)

- `CLAUDE.md`
- `docs/data-model.md`
- `packages/db/migrations/` (existing migration patterns)
- `packages/api/src/routes/` (existing route patterns)

## Scope (allowed files)

- `packages/db/migrations/0008_user_api_keys.sql` (new)
- `packages/db/src/repos/user_api_keys.ts` (new)
- `packages/api/src/auth/crypto.ts` (new)
- `packages/llm/src/providers/key-resolver.ts` (new)
- `packages/shared/src/types/` (if new types needed)
- `docs/security.md` (document encryption approach)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### 1. Create the database migration

File: `packages/db/migrations/0008_user_api_keys.sql`

```sql
-- User-provided API keys for LLM providers
-- Keys are encrypted with AES-256-GCM before storage

CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,  -- 'openai', 'anthropic', 'xai'
  encrypted_key BYTEA NOT NULL,   -- AES-256-GCM encrypted key
  iv BYTEA NOT NULL,              -- Initialization vector (12 bytes for GCM)
  key_suffix VARCHAR(8) NOT NULL, -- Last 4 chars for display (e.g., "...xxxx")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)       -- One key per provider per user
);

CREATE INDEX user_api_keys_user_idx ON user_api_keys(user_id);

COMMENT ON TABLE user_api_keys IS 'Encrypted storage for user-provided LLM API keys';
COMMENT ON COLUMN user_api_keys.encrypted_key IS 'AES-256-GCM encrypted API key';
COMMENT ON COLUMN user_api_keys.iv IS '12-byte initialization vector for GCM decryption';
COMMENT ON COLUMN user_api_keys.key_suffix IS 'Last 4 characters of key for user identification';
```

### 2. Create encryption utilities

File: `packages/api/src/auth/crypto.ts`

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // GCM standard
const AUTH_TAG_LENGTH = 16;

export interface EncryptedData {
  encrypted: Buffer;
  iv: Buffer;
}

/**
 * Encrypt an API key using AES-256-GCM.
 * The auth tag is appended to the encrypted data.
 */
export function encryptApiKey(plainKey: string, masterKey: Buffer): EncryptedData {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plainKey, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return { encrypted, iv };
}

/**
 * Decrypt an API key using AES-256-GCM.
 * Expects auth tag appended to encrypted data.
 */
export function decryptApiKey(encrypted: Buffer, iv: Buffer, masterKey: Buffer): string {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256');
  }

  const authTag = encrypted.subarray(-AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, -AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Get the master encryption key from environment.
 * In production, consider using a KMS instead.
 */
export function getMasterKey(): Buffer {
  const keyHex = process.env.APP_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is required');
  }
  if (keyHex.length !== 64) {
    throw new Error('APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Extract the last N characters of a key for display purposes.
 */
export function getKeySuffix(key: string, length: number = 4): string {
  return key.slice(-length);
}
```

### 3. Create the repository

File: `packages/db/src/repos/user_api_keys.ts`

```typescript
import { Pool } from 'pg';

export interface UserApiKey {
  id: string;
  userId: string;
  provider: string;
  encryptedKey: Buffer;
  iv: Buffer;
  keySuffix: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserApiKeySummary {
  id: string;
  provider: string;
  keySuffix: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createUserApiKeysRepo(pool: Pool) {
  return {
    async upsert(
      userId: string,
      provider: string,
      encryptedKey: Buffer,
      iv: Buffer,
      keySuffix: string
    ): Promise<UserApiKey> {
      const result = await pool.query<UserApiKey>(
        `INSERT INTO user_api_keys (user_id, provider, encrypted_key, iv, key_suffix)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, provider) DO UPDATE SET
           encrypted_key = EXCLUDED.encrypted_key,
           iv = EXCLUDED.iv,
           key_suffix = EXCLUDED.key_suffix,
           updated_at = now()
         RETURNING id, user_id as "userId", provider, encrypted_key as "encryptedKey",
                   iv, key_suffix as "keySuffix", created_at as "createdAt", updated_at as "updatedAt"`,
        [userId, provider, encryptedKey, iv, keySuffix]
      );
      return result.rows[0];
    },

    async findByUserAndProvider(userId: string, provider: string): Promise<UserApiKey | null> {
      const result = await pool.query<UserApiKey>(
        `SELECT id, user_id as "userId", provider, encrypted_key as "encryptedKey",
                iv, key_suffix as "keySuffix", created_at as "createdAt", updated_at as "updatedAt"
         FROM user_api_keys
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      );
      return result.rows[0] || null;
    },

    async listByUser(userId: string): Promise<UserApiKeySummary[]> {
      const result = await pool.query<UserApiKeySummary>(
        `SELECT id, provider, key_suffix as "keySuffix",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM user_api_keys
         WHERE user_id = $1
         ORDER BY provider`,
        [userId]
      );
      return result.rows;
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const result = await pool.query(
        `DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return (result.rowCount ?? 0) > 0;
    },

    async deleteByProvider(userId: string, provider: string): Promise<boolean> {
      const result = await pool.query(
        `DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
```

### 4. Create the key resolver

File: `packages/llm/src/providers/key-resolver.ts`

```typescript
import { Pool } from 'pg';
import { decryptApiKey, getMasterKey } from '@aharadar/api/auth/crypto';
import { createUserApiKeysRepo } from '@aharadar/db/repos/user_api_keys';

export type Provider = 'openai' | 'anthropic' | 'xai';

const SYSTEM_KEY_ENV_MAP: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
};

export interface KeyResolverOptions {
  pool: Pool;
  allowSystemKeyFallback?: boolean;  // Default from ALLOW_SYSTEM_KEY_FALLBACK env
}

export function createKeyResolver(options: KeyResolverOptions) {
  const repo = createUserApiKeysRepo(options.pool);
  const allowFallback = options.allowSystemKeyFallback ??
    process.env.ALLOW_SYSTEM_KEY_FALLBACK === 'true';

  return {
    /**
     * Resolve an API key for a user and provider.
     * Returns user's key if available, otherwise system key if fallback allowed.
     * Returns null if no key available.
     */
    async resolveApiKey(userId: string, provider: Provider): Promise<string | null> {
      // Try user's key first
      const userKey = await repo.findByUserAndProvider(userId, provider);
      if (userKey) {
        try {
          const masterKey = getMasterKey();
          return decryptApiKey(userKey.encryptedKey, userKey.iv, masterKey);
        } catch (error) {
          console.error(`Failed to decrypt user API key for ${provider}:`, error);
          // Fall through to system key if allowed
        }
      }

      // Fall back to system key if allowed
      if (allowFallback) {
        const envVar = SYSTEM_KEY_ENV_MAP[provider];
        return process.env[envVar] || null;
      }

      return null;
    },

    /**
     * Check if a user has a key configured for a provider.
     */
    async hasUserKey(userId: string, provider: Provider): Promise<boolean> {
      const userKey = await repo.findByUserAndProvider(userId, provider);
      return userKey !== null;
    },

    /**
     * Get key source for display/debugging (never exposes actual key).
     */
    async getKeySource(userId: string, provider: Provider): Promise<'user' | 'system' | 'none'> {
      const userKey = await repo.findByUserAndProvider(userId, provider);
      if (userKey) return 'user';

      if (allowFallback) {
        const envVar = SYSTEM_KEY_ENV_MAP[provider];
        if (process.env[envVar]) return 'system';
      }

      return 'none';
    },
  };
}
```

### 5. Document security approach

Update or create `docs/security.md`:

```markdown
## API Key Encryption

User-provided API keys are encrypted at rest using AES-256-GCM.

### Encryption details

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key size**: 256 bits (32 bytes)
- **IV size**: 96 bits (12 bytes, randomly generated per encryption)
- **Auth tag**: 128 bits (appended to ciphertext)

### Master key management

The master encryption key is provided via `APP_ENCRYPTION_KEY` environment variable.

**Generation:**
```bash
# Generate a secure 32-byte key
openssl rand -hex 32
```

**Requirements:**
- Must be 64 hex characters (32 bytes)
- Must be kept secret and backed up securely
- Rotation requires re-encrypting all stored keys

### Future improvements

- [ ] Envelope encryption with per-key data keys
- [ ] KMS integration (AWS KMS, GCP KMS, HashiCorp Vault)
- [ ] Key rotation automation
- [ ] Audit logging for key access
```

## Environment variables

Add to `.env.example`:

```bash
# Encryption key for user API keys (32 bytes, hex encoded)
# Generate with: openssl rand -hex 32
APP_ENCRYPTION_KEY=

# Allow fallback to system API keys when user has none configured
ALLOW_SYSTEM_KEY_FALLBACK=true
```

## Acceptance criteria

- [ ] `pnpm migrate` runs successfully with new migration
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes
- [ ] Can encrypt a key and decrypt it back to original value
- [ ] Repository CRUD operations work correctly
- [ ] Key resolver returns user key when present
- [ ] Key resolver falls back to system key when `ALLOW_SYSTEM_KEY_FALLBACK=true`
- [ ] Key resolver returns null when no key available and fallback disabled
- [ ] Full API keys are never logged or returned in API responses
- [ ] Security documentation updated

## Test plan (copy/paste)

```bash
pnpm dev:services
pnpm migrate
pnpm build

# Unit test crypto functions
# (Add to packages/api/src/auth/crypto.test.ts)

# Integration test
pnpm dev:api

# Verify table exists
psql $DATABASE_URL -c "SELECT * FROM user_api_keys LIMIT 1;"
```

## Notes

- This task creates the infrastructure. Task 080 adds the UI.
- Provider names should match exactly: 'openai', 'anthropic', 'xai'
- Consider adding 'google' provider for Gemini in the future
- The key suffix (last 4 chars) helps users identify which key is stored
- Never log decrypted keys even at debug level
